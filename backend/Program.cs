using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Features.Classes;

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

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", async (AppDbContext db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct)
        ? Results.Ok(new { status = "ok" })
        : Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Database unavailable"));

app.MapAuth();
app.MapClasses();

await AdminSeeder.SeedAsync(app.Services, app.Configuration, app.Logger);

app.Run();
