using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Services.Scoring;

namespace SuraqQoi.Api.Features.Teacher;

/// <summary>Сигнал для учителя (ТЗ, 11): stuck — застрял, inactive — пропал, rising — растёт.</summary>
public sealed record OverviewStudentDto(
    Guid Id, string Name, int Points, string Rank, int Streak, DateOnly? LastActiveDate,
    int Sessions7, int Questions7, double Depth7, string? Signal);

/// <summary>
/// SkillMap7 — число оценённых вопросов уровней 0–4 за 7 дней; AvgLevel7 — средний уровень;
/// ActiveShare7 — доля учеников с сессией за 7 дней; Depth7/DepthPrev7 — доля вопросов уровней 3–4.
/// </summary>
public sealed record ClassOverviewDto(
    Guid Id, string Name, string JoinCode, string Lang,
    int[] SkillMap7, double? AvgLevel7, double ActiveShare7, double? Depth7, double? DepthPrev7,
    List<OverviewStudentDto> Students);

public sealed record ProfileQuestionDto(
    Guid Id, int Position, string Body, int? LevelLocal, int? LevelAi, int? LevelTeacher, string? AiComment, string? AiHint);

public sealed record ProfileSessionDto(
    Guid Id, string TextTitle, DateTimeOffset? FinishedAt, int Points, bool Pending,
    string? Conclusion, int? ConclusionScore, string? ConclusionComment, List<ProfileQuestionDto> Questions);

public sealed record StudentProfileDto(
    Guid Id, string Name, Guid ClassId, string ClassName, int Points, string Rank, int Streak, List<ProfileSessionDto> Sessions);

public sealed record SetLevelRequest(int? LevelTeacher);

public sealed record SetLevelResponse(ProfileQuestionDto Question, int SessionPoints, int StudentPoints);

/// <summary>Панель учителя (ТЗ, 7.2, 11): карта навыков класса, профиль ученика, правка оценки ИИ.</summary>
public static class TeacherEndpoints
{
    public const int SessionsInProfile = 50;

    public static void MapTeacher(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api").WithTags("Teacher").RequireAuthorization(p => p.RequireRole("teacher"));
        g.MapGet("/classes/{id:guid}/overview", Overview);
        g.MapGet("/students/{id:guid}", Profile);
        g.MapPatch("/questions/{id:guid}", SetLevel);
    }

    private static Guid UserId(ClaimsPrincipal p) => Guid.Parse(p.FindFirstValue(Claims.Sub)!);

    private static async Task<IResult> Overview(Guid id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var teacherId = UserId(principal);
        var cls = await db.Classes.SingleOrDefaultAsync(c => c.Id == id && c.TeacherId == teacherId, ct);
        if (cls is null) return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Класс не найден");

        var now = DateTimeOffset.UtcNow;
        var today = PointsCalculator.LocalDate(now);
        var from14 = now.AddDays(-14);
        var weekAgo = now.AddDays(-7);
        var students = await db.Students.Where(s => s.ClassId == id)
            .Select(s => new { s.Id, s.User!.Name, s.Points, s.Streak, s.LastActiveDate })
            .ToListAsync(ct);
        // Вопросы за 14 дней — для карты навыков, глубины и сигналов. Неоценённые не учитываем.
        var questions = await db.Questions
            .Where(q => q.Session!.Student!.ClassId == id && q.Session.FinishedAt >= from14)
            .Select(q => new { q.Session!.StudentId, q.SessionId, q.Session.FinishedAt, Level = (int?)(q.LevelTeacher ?? q.LevelAi) })
            .ToListAsync(ct);
        var graded = questions.Where(q => q.Level is not null).ToList();
        var last7 = graded.Where(q => q.FinishedAt >= weekAgo).ToList();
        var prev7 = graded.Where(q => q.FinishedAt < weekAgo).ToList();

        var map = new int[5];
        foreach (var q in last7) map[q.Level!.Value]++;

        var rows = students.Select(s =>
        {
            var mine = graded.Where(q => q.StudentId == s.Id).ToList();
            var mine7 = mine.Where(q => q.FinishedAt >= weekAgo).ToList();
            var minePrev = mine.Where(q => q.FinishedAt < weekAgo).ToList();
            var sessions14 = questions.Where(q => q.StudentId == s.Id).Select(q => q.SessionId).Distinct().Count();
            var sessions7 = questions.Where(q => q.StudentId == s.Id && q.FinishedAt >= weekAgo).Select(q => q.SessionId).Distinct().Count();
            var depth7 = Depth(mine7.Select(q => q.Level!.Value)) ?? 0;
            var depthPrev = Depth(minePrev.Select(q => q.Level!.Value));

            string? signal = null;
            if (s.LastActiveDate is null || s.LastActiveDate < today.AddDays(-7)) signal = "inactive";
            else if (sessions14 >= 5 && mine.All(q => q.Level < 3)) signal = "stuck";
            else if (depthPrev is not null && mine7.Count > 0 && depth7 - depthPrev >= 0.2) signal = "rising";

            return new OverviewStudentDto(s.Id, s.Name, s.Points, PointsCalculator.Rank(s.Points),
                s.LastActiveDate >= today.AddDays(-1) ? s.Streak : 0, s.LastActiveDate,
                sessions7, mine7.Count, Math.Round(depth7, 2), signal);
        })
        .OrderByDescending(r => r.Points).ThenBy(r => r.Name)
        .ToList();

        var active = rows.Count(r => r.Sessions7 > 0);
        return TypedResults.Ok(new ClassOverviewDto(
            cls.Id, cls.Name, cls.JoinCode, cls.Lang, map,
            last7.Count > 0 ? Math.Round(last7.Average(q => (double)q.Level!.Value), 2) : null,
            students.Count > 0 ? Math.Round((double)active / students.Count, 2) : 0,
            Depth(last7.Select(q => q.Level!.Value)) is { } d7 ? Math.Round(d7, 2) : null,
            Depth(prev7.Select(q => q.Level!.Value)) is { } dp ? Math.Round(dp, 2) : null,
            rows));
    }

    /// <summary>Доля вопросов уровней 3–4; null — вопросов нет.</summary>
    private static double? Depth(IEnumerable<int> levels)
    {
        var list = levels.ToList();
        return list.Count == 0 ? null : (double)list.Count(l => l >= 3) / list.Count;
    }

    /// <summary>Профиль ученика: последние сессии и все его вопросы с оценками. id — запись students.</summary>
    private static async Task<IResult> Profile(Guid id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var teacherId = UserId(principal);
        var student = await db.Students.Include(s => s.User).Include(s => s.Class)
            .SingleOrDefaultAsync(s => s.Id == id && s.Class!.TeacherId == teacherId, ct);
        if (student is null) return StudentNotFound();

        var sessions = await db.Sessions.Where(s => s.StudentId == id)
            .Include(s => s.Questions).Include(s => s.Text)
            .OrderByDescending(s => s.FinishedAt).Take(SessionsInProfile)
            .ToListAsync(ct);
        var today = PointsCalculator.LocalDate(DateTimeOffset.UtcNow);
        return TypedResults.Ok(new StudentProfileDto(
            student.Id, student.User!.Name, student.Class!.Id, student.Class.Name, student.Points, PointsCalculator.Rank(student.Points),
            student.LastActiveDate >= today.AddDays(-1) ? student.Streak : 0,
            sessions.Select(ToDto).ToList()));
    }

    /// <summary>Учитель ставит уровень вопроса сам (null — вернуть оценку ИИ). Очки сессии и ученика пересчитываются.</summary>
    private static async Task<IResult> SetLevel(Guid id, SetLevelRequest req, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        if (req.LevelTeacher is < 0 or > 4)
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["levelTeacher"] = ["Уровень: от 0 до 4"] });

        var teacherId = UserId(principal);
        var question = await db.Questions.Include(q => q.Session)
            .SingleOrDefaultAsync(q => q.Id == id && q.Session!.Student!.Class!.TeacherId == teacherId, ct);
        if (question is null)
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Вопрос не найден");

        question.LevelTeacher = (short?)req.LevelTeacher;
        var student = await db.Students.SingleAsync(s => s.Id == question.Session!.StudentId, ct);
        var sessions = await db.Sessions.Where(s => s.StudentId == student.Id).Include(s => s.Questions).ToListAsync(ct);
        PointsCalculator.Recalculate(student, sessions, DateTimeOffset.UtcNow);
        await db.SaveChangesAsync(ct);

        var session = sessions.Single(s => s.Id == question.SessionId);
        return TypedResults.Ok(new SetLevelResponse(ToDto(question), session.Points, student.Points));
    }

    private static ProfileSessionDto ToDto(Session s) => new(
        s.Id, s.Text?.Title ?? "", s.FinishedAt, s.Points, PointsCalculator.IsPending(s),
        s.Conclusion, s.ConclusionScore, s.ConclusionComment,
        s.Questions.OrderBy(q => q.Position).Select(ToDto).ToList());

    private static ProfileQuestionDto ToDto(Question q) =>
        new(q.Id, q.Position, q.Body, q.LevelLocal, q.LevelAi, q.LevelTeacher, q.AiComment, q.AiHint);

    private static IResult StudentNotFound() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Ученик не найден");
}
