using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Services.Scoring;

namespace SuraqQoi.Api.Features.Classes;

public sealed record CreateClassRequest(string Name, string Lang);
public sealed record JoinClassRequest(string JoinCode);
public sealed record ClassDto(Guid Id, string Name, string JoinCode, string Lang, int StudentCount, DateTimeOffset CreatedAt);
public sealed record ClassStudentDto(Guid Id, string Name, string? Email, int Points, int Streak, DateOnly? LastActiveDate);
public sealed record StudentClassDto(Guid Id, string Name, string Lang, string TeacherName);
public sealed record StudentMeDto(string Name, int Points, string Rank, int Streak, StudentClassDto? Class);

/// <summary>Этап 2: классы учителя, вступление ученика по коду (ТЗ, разделы 7.1–7.2).</summary>
public static class ClassEndpoints
{
    private static readonly string[] Langs = ["kk", "ru"];

    public static void MapClasses(this IEndpointRouteBuilder app)
    {
        var teacher = app.MapGroup("/api/classes").WithTags("Classes")
            .RequireAuthorization(p => p.RequireRole("teacher"));
        teacher.MapGet("/", List);
        teacher.MapPost("/", Create);
        teacher.MapGet("/{id:guid}/students", Students);
        teacher.MapDelete("/{id:guid}/students/{studentId:guid}", RemoveStudent);

        var student = app.MapGroup("/api/student").WithTags("Student")
            .RequireAuthorization(p => p.RequireRole("student"));
        student.MapGet("/me", StudentMe);
        student.MapPost("/join-class", Join);
    }

    private static Guid UserId(ClaimsPrincipal p) => Guid.Parse(p.FindFirstValue(Claims.Sub)!);

    private static async Task<IResult> List(ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var teacherId = UserId(principal);
        var classes = await db.Classes
            .Where(c => c.TeacherId == teacherId)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new ClassDto(c.Id, c.Name, c.JoinCode, c.Lang, c.Students.Count, c.CreatedAt))
            .ToListAsync(ct);
        return TypedResults.Ok(classes);
    }

    private static async Task<IResult> Create(CreateClassRequest req, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var name = req.Name?.Trim() ?? "";
        var lang = req.Lang?.Trim().ToLowerInvariant() ?? "";
        if (name.Length is < 1 or > 40) errors["name"] = ["Название: от 1 до 40 символов"];
        if (!Langs.Contains(lang)) errors["lang"] = ["Язык: kk или ru"];
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var teacherId = UserId(principal);
        var prefix = CodePrefix(name);
        string code;
        do code = $"{prefix}-{RandomNumberGenerator.GetInt32(1000, 10000)}";
        while (await db.Classes.AnyAsync(c => c.JoinCode == code, ct));

        var cls = new SchoolClass
        {
            Id = Guid.NewGuid(),
            TeacherId = teacherId,
            Name = name,
            JoinCode = code,
            Lang = lang,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Classes.Add(cls);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new ClassDto(cls.Id, cls.Name, cls.JoinCode, cls.Lang, 0, cls.CreatedAt));
    }

    private static async Task<IResult> Students(Guid id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var teacherId = UserId(principal);
        var cls = await db.Classes.SingleOrDefaultAsync(c => c.Id == id && c.TeacherId == teacherId, ct);
        if (cls is null) return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Класс не найден");

        var students = await db.Students
            .Where(s => s.ClassId == id)
            .OrderBy(s => s.User!.Name)
            .Select(s => new ClassStudentDto(s.Id, s.User!.Name, s.User.Email, s.Points, s.Streak, s.LastActiveDate))
            .ToListAsync(ct);
        return TypedResults.Ok(new
        {
            @class = new ClassDto(cls.Id, cls.Name, cls.JoinCode, cls.Lang, students.Count, cls.CreatedAt),
            students,
        });
    }

    /// <summary>
    /// Убрать ученика из класса (зашёл не тот). Аккаунт и прогресс остаются: ученик увидит ввод кода
    /// и сможет вступить в нужный класс.
    /// </summary>
    private static async Task<IResult> RemoveStudent(Guid id, Guid studentId, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var teacherId = UserId(principal);
        var student = await db.Students.SingleOrDefaultAsync(
            s => s.Id == studentId && s.ClassId == id && s.Class!.TeacherId == teacherId, ct);
        if (student is null)
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Ученик не найден в этом классе");

        student.ClassId = null;
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    private static async Task<IResult> StudentMe(ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = UserId(principal);
        var row = await db.Students
            .Where(s => s.UserId == userId)
            .Select(s => new
            {
                Me = new StudentMeDto(s.User!.Name, s.Points, "", s.Streak,
                    s.Class == null ? null : new StudentClassDto(s.Class.Id, s.Class.Name, s.Class.Lang, s.Class.Teacher!.Name)),
                s.LastActiveDate,
            })
            .SingleOrDefaultAsync(ct);
        // Стрик хранится на момент последней сессии; пропущен день — серия прервалась.
        var today = PointsCalculator.LocalDate(DateTimeOffset.UtcNow);
        var me = row is null ? null : row.Me with
        {
            Rank = PointsCalculator.Rank(row.Me.Points),
            Streak = row.LastActiveDate >= today.AddDays(-1) ? row.Me.Streak : 0,
        };
        return me is null
            ? TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Профиль ученика не найден")
            : TypedResults.Ok(me);
    }

    private static async Task<IResult> Join(JoinClassRequest req, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var code = NormalizeCode(req.JoinCode);
        if (code.Length == 0)
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["joinCode"] = ["Введите код класса"] });

        var cls = await db.Classes.Include(c => c.Teacher).SingleOrDefaultAsync(c => c.JoinCode == code, ct);
        if (cls is null)
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Класс с таким кодом не найден");

        var userId = UserId(principal);
        var student = await db.Students.SingleOrDefaultAsync(s => s.UserId == userId, ct);
        if (student is null)
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Профиль ученика не найден");

        student.ClassId = cls.Id;
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new StudentClassDto(cls.Id, cls.Name, cls.Lang, cls.Teacher!.Name));
    }

    /// <summary>«8А» → «8A», «7 Б» → «7B». Кириллица переводится в латиницу, лишнее отбрасывается.</summary>
    private static string CodePrefix(string name)
    {
        var sb = new StringBuilder();
        foreach (var c in Translit(name.ToUpperInvariant()))
        {
            if (c is (>= 'A' and <= 'Z') or (>= '0' and <= '9')) sb.Append(c);
            if (sb.Length == 3) break;
        }
        return sb.Length > 0 ? sb.ToString() : "CL";
    }

    /// <summary>Код вводят как попало: «8а-4821», « 8A 4821 ». Приводим к виду «8A-4821».</summary>
    internal static string NormalizeCode(string? raw)
    {
        var s = new string((raw ?? "").ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
        s = Translit(s);
        if (s.Length < 5) return s;
        return $"{s[..^4]}-{s[^4..]}";
    }

    private const string Cyr = "АВЕКМНОРСТХБГДЖЗИЙЛПФЦЧШЩЭЮЯӘҒҚҢӨҰҮҺІУ";
    private const string Lat = "ABEKMHOPCTXBGDJZIILPFCCSSEUYAGQNOUUHIU";

    /// <summary>Кириллица → латиница (одинаково при создании кода и при вводе учеником).</summary>
    private static string Translit(string s) =>
        new(s.Select(ch => Cyr.IndexOf(ch) is var i and >= 0 ? Lat[i] : ch).ToArray());
}
