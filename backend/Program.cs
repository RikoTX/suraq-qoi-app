using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Features.Admin;
using SuraqQoi.Api.Features.Classes;
using SuraqQoi.Api.Features.Texts;
using SuraqQoi.Api.Data.DevSeed;
using SuraqQoi.Api.Services.Content;

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

// Подбор кода класса и PIN ученика: не больше 30 попыток в минуту с одного адреса.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(RateLimits.StudentAuth, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) }));
});

builder.Services.AddScoped<TextGenerator>();

var app = builder.Build();

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
app.MapAdmin();

await AdminSeeder.SeedAsync(app.Services, app.Configuration, app.Logger);
await DevTextSeeder.SeedAsync(app.Services, app.Environment, app.Logger);

app.Run();
return 0;
