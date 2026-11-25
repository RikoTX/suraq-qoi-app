using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Features.Admin;
using SuraqQoi.Api.Features.Classes;
using SuraqQoi.Api.Features.Diagnostics;
using SuraqQoi.Api.Features.Pilot;
using SuraqQoi.Api.Features.Sessions;
using SuraqQoi.Api.Features.Teacher;
using SuraqQoi.Api.Features.Texts;
using SuraqQoi.Api.Data.DevSeed;
using SuraqQoi.Api.Services.Content;
using SuraqQoi.Api.Services.Grading;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o => o
    .UseNpgsql(builder.Configuration.GetConnectionString("Default"))
    .UseSnakeCaseNamingConvention());

// --- Авторизация (JWT) ---
var jwtOptions = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (jwtOptions.Secret.Length < 32)
    throw new InvalidOperationException("Jwt:Secret must be at least 32 characters (env: Jwt__Secret).");
builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton<JwtTokenService>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Issuer,
            IssuerSigningKey = jwtOptions.SigningKey(),
            NameClaimType = Claims.Name,
            RoleClaimType = Claims.Role,
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddProblemDetails();
// Некорректный JSON в запросе → 400, а не 500 (в Development по умолчанию бросается исключение).
builder.Services.Configure<RouteHandlerOptions>(o => o.ThrowOnBadRequest = false);

// На сервере API стоит за Caddy (ТЗ, 13): адрес ученика берём из X-Forwarded-For, иначе лимит ниже
// считался бы на всех сразу. API наружу не открыт, поэтому заголовку от Caddy можно доверять.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

// Подбор кода класса и PIN: не больше 120 попыток в минуту с одного адреса. Вся сельская школа часто
// выходит в сеть через один адрес, а класс из 25 учеников входит одновременно (2–3 запроса на ученика).
// PIN дополнительно защищён блокировкой после 5 ошибок (StudentAuthEndpoints).
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(RateLimits.StudentAuth, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddScoped<TextGenerator>();
builder.Services.AddSingleton<IGradingService, OpenAiGradingService>();

var app = builder.Build();

// Миграции при старте (ТЗ, 13): на сервере база создаётся сама, до CLI-команд и до приёма запросов.
using (var scope = app.Services.CreateScope())
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();

// CLI: dotnet run -- generate-texts --lang kk --topic local --kind schedule --difficulty 2 --count 5
if (args.FirstOrDefault() == "generate-texts")
{
    Console.OutputEncoding = System.Text.Encoding.UTF8;
    var options = TextGenerator.ParseArgs(args, out var error);
    if (options is null)
    {
        Console.Error.WriteLine($"Ошибка в аргументах: {error}");
        return 1;
    }
    using var scope = app.Services.CreateScope();
    var saved = await scope.ServiceProvider.GetRequiredService<TextGenerator>().RunAsync(options, CancellationToken.None);
    Console.WriteLine($"Готово: сохранено {saved} из {options.Count}. Тексты в общей библиотеке — учителя добавляют их в свои классы.");
    return saved > 0 ? 0 : 1;
}

// CLI: dotnet run -- seed-demo — демо-класс с историей за 14 дней (ТЗ, D1)
if (args.FirstOrDefault() == "seed-demo")
{
    Console.OutputEncoding = System.Text.Encoding.UTF8;
    using var scope = app.Services.CreateScope();
    Console.WriteLine(await DemoSeeder.RunAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), CancellationToken.None));
    return 0;
}

// CLI: dotnet run -- pilot-report 8A-1234 [--since 2026-11-26] [--names] — цифры пилота для слайдов (ТЗ, 11)
if (args.FirstOrDefault() == "pilot-report")
{
    Console.OutputEncoding = System.Text.Encoding.UTF8;
    using var scope = app.Services.CreateScope();
    var (code, text) = await PilotReport.RunAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), args, CancellationToken.None);
    (code == 0 ? Console.Out : Console.Error).WriteLine(text);
    return code;
}

// CLI: dotnet run -- export-texts library.json / import-texts library.json — перенос общей библиотеки текстов
if (args.FirstOrDefault() is "export-texts" or "import-texts")
{
    Console.OutputEncoding = System.Text.Encoding.UTF8;
    if (args.Length < 2)
    {
        Console.Error.WriteLine($"Укажите файл: {args[0]} library.json");
        return 1;
    }
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (args[0] == "export-texts")
        Console.WriteLine($"Сохранено текстов библиотеки: {await LibraryTransfer.ExportAsync(db, args[1], CancellationToken.None)} → {args[1]}");
    else
    {
        var (added, skipped) = await LibraryTransfer.ImportAsync(db, args[1], CancellationToken.None);
        Console.WriteLine($"Добавлено: {added}, уже были: {skipped}.");
    }
    return 0;
}

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapGet("/health", async (AppDbContext db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct)
        ? Results.Ok(new { status = "ok" })
        : Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Database unavailable"));

app.MapAuth();
app.MapStudentAuth();
app.MapClasses();
app.MapTexts();
app.MapSessions();
app.MapTeacher();
app.MapDiagnostics();
app.MapAdmin();

await AdminSeeder.SeedAsync(app.Services, app.Configuration, app.Logger);
await DevTextSeeder.SeedAsync(app.Services, app.Environment, app.Logger);

app.Run();
return 0;

/// <summary>Для интеграционных тестов (WebApplicationFactory&lt;Program&gt;).</summary>
public partial class Program;
