using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Features.Classes;

namespace SuraqQoi.Api.Auth;

public sealed record StudentClassLookupRequest(string JoinCode);
public sealed record ClassmateDto(Guid Id, string Name);
public sealed record StudentClassLookupResponse(string ClassName, string Lang, List<ClassmateDto> Students);
public sealed record StudentRegisterRequest(string JoinCode, string Name, string Pin);
public sealed record StudentLoginRequest(string JoinCode, Guid StudentId, string Pin);
public sealed record ResetPinResponse(string Pin);

/// <summary>
/// Вход ученика без email (ТЗ, 7.0.1): код класса → выбрать своё имя (или «я новенький») → PIN из 4 цифр.
/// У многих сельских школьников нет email, а раздел 15 ТЗ запрещает собирать его у детей.
/// </summary>
public static class StudentAuthEndpoints
{
    public const int MaxFailedLogins = 5;
    public static readonly TimeSpan LockFor = TimeSpan.FromMinutes(10);

    public static void MapStudentAuth(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth/student").WithTags("Auth").RequireRateLimiting(RateLimits.StudentAuth);
        g.MapPost("/class", LookupClass);
        g.MapPost("/register", Register);
        g.MapPost("/login", Login);

        app.MapPost("/api/classes/{id:guid}/students/{studentId:guid}/reset-pin", ResetPin).WithTags("Classes")
            .RequireAuthorization(p => p.RequireRole("teacher"));
    }

    /// <summary>Список имён класса, чтобы ученик выбрал себя. Только имена — без очков и прочего.</summary>
    private static async Task<IResult> LookupClass(StudentClassLookupRequest req, AppDbContext db, CancellationToken ct)
    {
        var cls = await FindClass(db, req.JoinCode, ct);
        if (cls is null) return ClassNotFound();

        var students = await db.Students.Where(s => s.ClassId == cls.Id)
            .OrderBy(s => s.User!.Name)
            .Select(s => new ClassmateDto(s.UserId, s.User!.Name))
            .ToListAsync(ct);
        return TypedResults.Ok(new StudentClassLookupResponse(cls.Name, cls.Lang, students));
    }

    private static async Task<IResult> Register(StudentRegisterRequest req, AppDbContext db, JwtTokenService jwt, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var name = NormalizeName(req.Name);
        if (name.Length is < 2 or > 40) errors["name"] = ["Имя: от 2 до 40 символов"];
        if (!IsPin(req.Pin)) errors["pin"] = ["PIN — 4 цифры"];
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var cls = await FindClass(db, req.JoinCode, ct);
        if (cls is null) return ClassNotFound();

        var taken = await db.Students.AnyAsync(s => s.ClassId == cls.Id && s.User!.Name.ToLower() == name.ToLower(), ct);
        if (taken)
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["name"] = ["Такое имя в классе уже есть. Если это ты — вернись и выбери себя в списке. Если нет — добавь первую букву фамилии: «Айгерим Б.»"],
            });

        var now = DateTimeOffset.UtcNow;
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = null,
            Name = name,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Pin),
            Role = UserRole.Student,
            CreatedAt = now,
        };
        db.Users.Add(user);
        db.Students.Add(new Student { Id = Guid.NewGuid(), UserId = user.Id, ClassId = cls.Id, CreatedAt = now });
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new AuthResponse(jwt.Create(user), AuthEndpoints.ToDto(user)));
    }

    private static async Task<IResult> Login(StudentLoginRequest req, AppDbContext db, JwtTokenService jwt, CancellationToken ct)
    {
        var cls = await FindClass(db, req.JoinCode, ct);
        if (cls is null) return ClassNotFound();

        var user = await db.Students.Where(s => s.ClassId == cls.Id && s.UserId == req.StudentId)
            .Select(s => s.User!).SingleOrDefaultAsync(ct);
        if (user is null)
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Ученик не найден в этом классе");

        var now = DateTimeOffset.UtcNow;
        if (user.LockedUntil > now)
        {
            var minutes = (int)Math.Ceiling((user.LockedUntil.Value - now).TotalMinutes);
            return TypedResults.Problem(statusCode: StatusCodes.Status429TooManyRequests,
                title: $"Слишком много неверных PIN. Подожди {minutes} мин. или попроси учителя сбросить PIN.");
        }

        if (!IsPin(req.Pin) || !BCrypt.Net.BCrypt.Verify(req.Pin, user.PasswordHash))
        {
            user.FailedLogins++;
            if (user.FailedLogins >= MaxFailedLogins)
            {
                user.FailedLogins = 0;
                user.LockedUntil = now + LockFor;
            }
            await db.SaveChangesAsync(ct);
            return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Неверный PIN");
        }

        user.FailedLogins = 0;
        user.LockedUntil = null;
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new AuthResponse(jwt.Create(user), AuthEndpoints.ToDto(user)));
    }

    /// <summary>Учитель выдаёт новый временный PIN и снимает блокировку. studentId — id записи students.</summary>
    private static async Task<IResult> ResetPin(Guid id, Guid studentId, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var teacherId = Guid.Parse(principal.FindFirstValue(Claims.Sub)!);
        var user = await db.Students
            .Where(s => s.Id == studentId && s.ClassId == id && s.Class!.TeacherId == teacherId)
            .Select(s => s.User!).SingleOrDefaultAsync(ct);
        if (user is null)
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Ученик не найден в этом классе");
        if (user.Email is not null)
            return TypedResults.Problem(statusCode: StatusCodes.Status409Conflict, title: "Этот ученик входит по email, PIN у него нет");

        var pin = RandomNumberGenerator.GetInt32(0, 10000).ToString("D4");
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(pin);
        user.FailedLogins = 0;
        user.LockedUntil = null;
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new ResetPinResponse(pin));
    }

    private static async Task<SchoolClass?> FindClass(AppDbContext db, string? joinCode, CancellationToken ct)
    {
        var code = ClassEndpoints.NormalizeCode(joinCode);
        return code.Length == 0 ? null : await db.Classes.SingleOrDefaultAsync(c => c.JoinCode == code, ct);
    }

    private static bool IsPin(string? pin) => pin is { Length: 4 } && pin.All(char.IsAsciiDigit);

    /// <summary>«  айгерим   б. » → «айгерим б.»: обрезаем и схлопываем пробелы.</summary>
    private static string NormalizeName(string? name) =>
        string.Join(' ', (name ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    private static IResult ClassNotFound() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Класс с таким кодом не найден");
}

/// <summary>Ограничения частоты запросов: подбор кода класса и PIN.</summary>
public static class RateLimits
{
    public const string StudentAuth = "student-auth";
}
