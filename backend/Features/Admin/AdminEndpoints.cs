using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;

namespace SuraqQoi.Api.Features.Admin;

public sealed record AdminStats(
    int Teachers, int Students, int StudentsWithoutClass, int Classes,
    int ClassTexts, int PublishedTexts, int LibraryTexts, int Sessions, int Questions,
    int NewUsers7Days);

public sealed record AdminUserDto(Guid Id, string Name, string Email, string Role, DateTimeOffset CreatedAt, string? Info);
public sealed record AdminClassDto(Guid Id, string Name, string JoinCode, string Lang, string TeacherName, int Students, int Texts, int PublishedTexts, DateTimeOffset CreatedAt);

/// <summary>Админ наблюдает за проектом: кто зарегистрирован, какие классы, общая статистика. Контент не правит.</summary>
public static class AdminEndpoints
{
    public static void MapAdmin(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").WithTags("Admin")
            .RequireAuthorization(p => p.RequireRole("admin"));
        g.MapGet("/stats", Stats);
        g.MapGet("/users", Users);
        g.MapGet("/classes", Classes);
    }

    private static async Task<IResult> Stats(AppDbContext db, CancellationToken ct)
    {
        var weekAgo = DateTimeOffset.UtcNow.AddDays(-7);
        return TypedResults.Ok(new AdminStats(
            Teachers: await db.Users.CountAsync(u => u.Role == UserRole.Teacher, ct),
            Students: await db.Students.CountAsync(ct),
            StudentsWithoutClass: await db.Students.CountAsync(s => s.ClassId == null, ct),
            Classes: await db.Classes.CountAsync(ct),
            ClassTexts: await db.Texts.CountAsync(t => t.ClassId != null, ct),
            PublishedTexts: await db.Texts.CountAsync(t => t.ClassId != null && t.Reviewed, ct),
            LibraryTexts: await db.Texts.CountAsync(t => t.ClassId == null, ct),
            Sessions: await db.Sessions.CountAsync(ct),
            Questions: await db.Questions.CountAsync(ct),
            NewUsers7Days: await db.Users.CountAsync(u => u.Role != UserRole.Admin && u.CreatedAt >= weekAgo, ct)));
    }

    /// <summary>Все пользователи. Info: для учителя — число классов, для ученика — класс.</summary>
    private static async Task<IResult> Users(string? role, AppDbContext db, CancellationToken ct)
    {
        var q = db.Users.Where(u => u.Role != UserRole.Admin);
        if (role == "teacher") q = q.Where(u => u.Role == UserRole.Teacher);
        if (role == "student") q = q.Where(u => u.Role == UserRole.Student);

        var users = await q.OrderByDescending(u => u.CreatedAt)
            .Select(u => new
            {
                u.Id, u.Name, u.Email, u.Role, u.CreatedAt,
                ClassCount = u.Classes.Count,
                StudentClass = db.Students.Where(s => s.UserId == u.Id).Select(s => s.Class!.Name).FirstOrDefault(),
            })
            .Take(500)
            .ToListAsync(ct);

        return TypedResults.Ok(users.Select(u => new AdminUserDto(u.Id, u.Name, u.Email, u.Role.ToApi(), u.CreatedAt,
            u.Role == UserRole.Teacher
                ? $"Классов: {u.ClassCount}"
                : u.StudentClass is null ? "Без класса" : $"Класс {u.StudentClass}")));
    }

    private static async Task<IResult> Classes(AppDbContext db, CancellationToken ct)
    {
        var classes = await db.Classes
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new AdminClassDto(
                c.Id, c.Name, c.JoinCode, c.Lang, c.Teacher!.Name, c.Students.Count,
                db.Texts.Count(t => t.ClassId == c.Id),
                db.Texts.Count(t => t.ClassId == c.Id && t.Reviewed),
                c.CreatedAt))
            .ToListAsync(ct);
        return TypedResults.Ok(classes);
    }
}
