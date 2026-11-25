using System.Net.Mail;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Data;

namespace SuraqQoi.Api.Auth;

public sealed record RegisterRequest(string Name, string Email, string Password, string Role);
public sealed record LoginRequest(string Email, string Password);
public sealed record UserDto(Guid Id, string Name, string? Email, string Role);
public sealed record AuthResponse(string Token, UserDto User);

public static class AuthEndpoints
{
    public const int MinPasswordLength = 8;

    public static void MapAuth(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").WithTags("Auth");
        g.MapPost("/register", Register);
        g.MapPost("/login", Login);
        g.MapGet("/me", Me).RequireAuthorization();
    }

    private static async Task<IResult> Register(RegisterRequest req, AppDbContext db, JwtTokenService jwt, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var name = req.Name?.Trim() ?? "";
        var email = NormalizeEmail(req.Email);

        if (name.Length is < 2 or > 80) errors["name"] = ["Имя: от 2 до 80 символов"];
        if (email is null) errors["email"] = ["Некорректный email"];
        if ((req.Password ?? "").Length < MinPasswordLength) errors["password"] = [$"Пароль: минимум {MinPasswordLength} символов"];

        // Админа нельзя зарегистрировать через форму — только через настройки сервера.
        // Ученик регистрируется без email — по коду класса (StudentAuthEndpoints, ТЗ 7.0.1).
        UserRole? role = req.Role?.ToLowerInvariant() switch
        {
            "teacher" => UserRole.Teacher,
            _ => null,
        };
        if (req.Role?.ToLowerInvariant() == "student") errors["role"] = ["Ученики входят по коду класса, без email"];
        else if (role is null) errors["role"] = ["Роль: teacher"];

        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["email"] = ["Этот email уже зарегистрирован"] });

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email!,
            Name = name,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = role!.Value,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new AuthResponse(jwt.Create(user), ToDto(user)));
    }

    private static async Task<IResult> Login(LoginRequest req, AppDbContext db, JwtTokenService jwt, CancellationToken ct)
    {
        var email = NormalizeEmail(req.Email);
        var user = email is null ? null : await db.Users.SingleOrDefaultAsync(u => u.Email == email, ct);

        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password ?? "", user.PasswordHash))
            return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Неверный email или пароль");

        return TypedResults.Ok(new AuthResponse(jwt.Create(user), ToDto(user)));
    }

    private static async Task<IResult> Me(ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue(Claims.Sub), out var id)) return TypedResults.Unauthorized();
        var user = await db.Users.FindAsync([id], ct);
        return user is null ? TypedResults.Unauthorized() : TypedResults.Ok(ToDto(user));
    }

    internal static UserDto ToDto(User u) => new(u.Id, u.Name, u.Email, u.Role.ToApi());

    private static string? NormalizeEmail(string? email)
    {
        var e = email?.Trim().ToLowerInvariant();
        return !string.IsNullOrEmpty(e) && e.Length <= 254 && MailAddress.TryCreate(e, out var a) && a.Address == e ? e : null;
    }
}
