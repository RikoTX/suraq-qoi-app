using System.Diagnostics;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Services.Grading;
using SuraqQoi.Api.Services.Scoring;

namespace SuraqQoi.Api.Features.Sessions;

public sealed record QuestionUpload(Guid Id, short Position, string Body, short? LevelLocal, DateTimeOffset CreatedAt);

public sealed record SessionUpload(
    Guid Id, Guid TextId, DateTimeOffset StartedAt, DateTimeOffset FinishedAt, string? Conclusion, List<QuestionUpload> Questions);

public sealed record UploadSessionsRequest(List<SessionUpload> Sessions);

/// <summary>Итоговая оценка вопроса. ByTeacher — уровень поставил учитель (важнее ИИ).</summary>
public sealed record GradedQuestionDto(Guid QuestionId, int Level, string? Comment, string? Hint, bool ByTeacher);

/// <summary>Pending — оценены ещё не все вопросы: очки сессии пока не входят в очки ученика.</summary>
public sealed record SessionResultDto(Guid Id, int Points, int? ConclusionScore, string? ConclusionComment, bool Pending);

public sealed record StudentProgressDto(int Points, string Rank, int Streak);

/// <summary>Rejected — сессии, которые сервер не примет никогда (битые данные, чужой id): клиент убирает их из очереди.</summary>
public sealed record UploadSessionsResponse(
    List<GradedQuestionDto> Graded, List<SessionResultDto> Sessions, StudentProgressDto Student, List<Guid> Rejected);

/// <summary>
/// Сессии «Обыграй ИИ» (ТЗ, 7.1). Клиент шлёт пачку завершённых сессий из очереди отправки;
/// повторная отправка не создаёт дублей и не меняет уже оценённое. Неоценённые вопросы оцениваются ИИ
/// в пределах общего бюджета; не успели — оценим при следующей отправке.
/// </summary>
public static class SessionEndpoints
{
    public const int MaxSessionsPerRequest = 20;
    public const int MaxQuestions = 3;
    public const int MaxQuestionLength = 500;
    public const int MaxConclusionLength = 1000;
    /// <summary>Клиент ждёт 8 с; на оценку ИИ — 6,5 с вместе с повтором (ТЗ, 9.2).</summary>
    public static readonly TimeSpan GradingBudget = TimeSpan.FromMilliseconds(6500);
    public const int GradingParallelism = 4;

    public static void MapSessions(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/student/sessions", Upload).WithTags("Student")
            .RequireAuthorization(p => p.RequireRole("student"));
    }

    private static async Task<IResult> Upload(UploadSessionsRequest req, ClaimsPrincipal principal, AppDbContext db,
        IGradingService grader, CancellationToken ct)
    {
        var clock = Stopwatch.StartNew();
        var userId = Guid.Parse(principal.FindFirstValue(Claims.Sub)!);
        var student = await db.Students.SingleOrDefaultAsync(s => s.UserId == userId, ct);
        if (student is null)
            return TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Профиль ученика не найден");

        var uploads = (req.Sessions ?? []).Take(MaxSessionsPerRequest).ToList();
        if (uploads.Count == 0)
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["sessions"] = ["Нет сессий для отправки"] });

        var now = DateTimeOffset.UtcNow;
        List<Guid> rejected = [], accepted = [];
        // Телефон не дождался ответа и прислал ту же пачку снова, пока первая ещё обрабатывается: вставка второй
        // упрётся в первичный ключ. Тогда перечитываем базу — эти сессии уже приняты, это обычный повтор.
        for (var attempt = 1; ; attempt++)
        {
            rejected = [];
            accepted = [];
            var ids = uploads.Select(u => u.Id).ToList();
            var existing = await db.Sessions.Where(s => ids.Contains(s.Id)).Select(s => new { s.Id, s.StudentId }).ToListAsync(ct);
            var textIds = uploads.Select(u => u.TextId).Distinct().ToList();
            var texts = await db.Texts.Where(t => textIds.Contains(t.Id)).Select(t => new { t.Id, t.Body }).ToDictionaryAsync(t => t.Id, t => t.Body, ct);
            var questionIds = uploads.SelectMany(u => u.Questions ?? []).Select(q => q.Id).ToList();
            var takenQuestionIds = (await db.Questions.Where(q => questionIds.Contains(q.Id)).Select(q => q.Id).ToListAsync(ct)).ToHashSet();

            foreach (var u in uploads.DistinctBy(u => u.Id))
            {
                var known = existing.FirstOrDefault(e => e.Id == u.Id);
                if (known is not null)
                {
                    // Уже приняли раньше — повтор из очереди. Чужой id — отклоняем.
                    if (known.StudentId == student.Id) accepted.Add(u.Id);
                    else rejected.Add(u.Id);
                    continue;
                }
                if (!IsValid(u, texts, takenQuestionIds))
                {
                    rejected.Add(u.Id);
                    continue;
                }

                var body = texts[u.TextId];
                var session = new Session
                {
                    Id = u.Id,
                    StudentId = student.Id,
                    TextId = u.TextId,
                    Conclusion = string.IsNullOrWhiteSpace(u.Conclusion) ? null : u.Conclusion.Trim(),
                    StartedAt = u.StartedAt,
                    FinishedAt = u.FinishedAt > now ? now : u.FinishedAt, // часы телефона могут спешить
                    ReceivedAt = now,
                };
                var previous = new List<string>();
                foreach (var q in u.Questions.OrderBy(q => q.Position))
                {
                    var text = q.Body.Trim();
                    session.Questions.Add(new Question
                    {
                        Id = q.Id,
                        Position = q.Position,
                        Body = text,
                        // Клиент считает правилами (раздел 9.3); не прислал — считаем сами.
                        LevelLocal = (short)Math.Clamp(q.LevelLocal ?? HeuristicGrader.Level(text, body, previous), 0, HeuristicGrader.MaxLevel),
                        CreatedAt = q.CreatedAt,
                    });
                    previous.Add(text);
                }
                db.Sessions.Add(session);
                accepted.Add(u.Id);
            }
            try
            {
                await db.SaveChangesAsync(ct);
                break;
            }
            catch (DbUpdateException e) when (DbErrors.IsUniqueViolation(e) && attempt < 3)
            {
                db.ChangeTracker.Clear();
                student = await db.Students.SingleAsync(x => x.Id == student.Id, ct);
            }
        }

        var sessions = await db.Sessions.Where(s => accepted.Contains(s.Id))
            .Include(s => s.Questions).Include(s => s.Text).ToListAsync(ct);
        await GradeAsync(sessions, grader, GradingBudget - clock.Elapsed, ct);

        // Пересчёт по всем сессиям ученика: очки, стрик, последний активный день.
        var all = await db.Sessions.Where(s => s.StudentId == student.Id).Include(s => s.Questions).ToListAsync(ct);
        PointsCalculator.Recalculate(student, all, now);
        await db.SaveChangesAsync(ct);

        return TypedResults.Ok(new UploadSessionsResponse(
            sessions.SelectMany(s => s.Questions)
                .Where(q => PointsCalculator.FinalLevel(q) is not null)
                .Select(q => new GradedQuestionDto(q.Id, PointsCalculator.FinalLevel(q)!.Value, q.AiComment, q.AiHint, q.LevelTeacher is not null))
                .ToList(),
            sessions.Select(ToResult).ToList(),
            Progress(student, now),
            rejected));
    }

    public static SessionResultDto ToResult(Session s) =>
        new(s.Id, s.Points, s.ConclusionScore, s.ConclusionComment, PointsCalculator.IsPending(s));

    public static StudentProgressDto Progress(Student s, DateTimeOffset now) =>
        new(s.Points, PointsCalculator.Rank(s.Points),
            s.LastActiveDate >= PointsCalculator.LocalDate(now).AddDays(-1) ? s.Streak : 0);

    /// <summary>Оценка ИИ всех сессий, где что-то ещё не оценено. Вызовы к ИИ — параллельно, запись в БД — после.</summary>
    private static async Task GradeAsync(List<Session> sessions, IGradingService grader, TimeSpan budget, CancellationToken ct)
    {
        var todo = sessions.Where(NeedsGrading).ToList();
        if (todo.Count == 0 || budget <= TimeSpan.Zero) return;

        using var gate = new SemaphoreSlim(GradingParallelism);
        var clock = Stopwatch.StartNew();
        var results = await Task.WhenAll(todo.Select(async s =>
        {
            await gate.WaitAsync(ct);
            try
            {
                var left = budget - clock.Elapsed;
                if (left <= TimeSpan.Zero) return (s, null);
                var input = new GradeInput(s.Text!.Lang, s.Text.Title, s.Text.Body,
                    s.Questions.Select(q => new GradeQuestion(q.Position, q.Body)).ToList(), s.Conclusion);
                return (s, result: await grader.GradeAsync(input, left, ct));
            }
            finally
            {
                gate.Release();
            }
        }));

        foreach (var (s, result) in results)
        {
            if (result is null) continue;
            foreach (var q in s.Questions.Where(q => q.LevelAi is null))
            {
                var g = result.Questions.FirstOrDefault(r => r.Position == q.Position);
                if (g is null) continue;
                q.LevelAi = (short)g.Level;
                q.AiComment = g.Comment;
                q.AiHint = g.Hint;
            }
            if (s.ConclusionScore is null && s.Conclusion is not null)
            {
                s.ConclusionScore = (short)result.ConclusionScore;
                s.ConclusionComment = result.ConclusionComment;
            }
        }
    }

    private static bool NeedsGrading(Session s) =>
        s.Questions.Any(q => q.LevelAi is null && q.LevelTeacher is null) || (s.Conclusion is not null && s.ConclusionScore is null);

    private static bool IsValid(SessionUpload u, Dictionary<Guid, string> texts, HashSet<Guid> takenQuestionIds)
    {
        var qs = u.Questions ?? [];
        return texts.ContainsKey(u.TextId)
            && qs.Count is >= 1 and <= MaxQuestions
            && qs.Select(q => q.Position).Distinct().Count() == qs.Count
            && qs.All(q => q.Position is >= 1 and <= MaxQuestions)
            && qs.All(q => (q.Body?.Trim().Length ?? 0) is >= 1 and <= MaxQuestionLength)
            && qs.All(q => !takenQuestionIds.Contains(q.Id))
            && qs.Select(q => q.Id).Distinct().Count() == qs.Count
            && (u.Conclusion?.Length ?? 0) <= MaxConclusionLength
            && u.FinishedAt >= u.StartedAt;
    }
}
