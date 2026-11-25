using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Data.Diagnostics;

namespace SuraqQoi.Api.Features.Diagnostics;

public sealed record DiagnosticFormDto(string Kind, string Form, string Lang, DiagnosticText[] Texts);

public sealed record DiagnosticResultDto(Guid Id, string Kind, string Form, int Score, int[] Skills, DateTimeOffset TakenAt);

/// <summary>
/// Что ученику пройти. Forms — задания, которые ему ещё предстоят (pre или post), чтобы пройти их без сети.
/// Итоговая открывается после PostAfterSessions сессий или по кнопке учителя (PostOpen).
/// </summary>
public sealed record DiagnosticStatusDto(
    DiagnosticResultDto? Pre, DiagnosticResultDto? Post, int Sessions, int PostAfterSessions, bool PostOpen,
    List<DiagnosticFormDto> Forms);

public sealed record SubmitDiagnosticRequest(
    Guid Id, string? Kind, string? Form, string? Lang, int[]? Answers, DateTimeOffset StartedAt, DateTimeOffset FinishedAt);

public sealed record SetPostOpenRequest(bool PostOpen);

/// <summary>Средний балл (из 6) и средние по навыкам [найти, связать, оценить] (из 2).</summary>
public sealed record DiagnosticStatDto(int Count, double Avg, double[] Skills);

/// <summary>Ученики, прошедшие обе: средний pre и post только по ним — честное сравнение «было/стало».</summary>
public sealed record DiagnosticPairedDto(int Count, double PreAvg, double PostAvg);

public sealed record DiagnosticSummaryDto(bool PostOpen, int PostAfterSessions, DiagnosticStatDto? Pre, DiagnosticStatDto? Post, DiagnosticPairedDto? Paired);

/// <summary>Мини-диагностика (ТЗ, 11.1): задания ученику, приём результата, сводка и кнопка учителя.</summary>
public static class DiagnosticEndpoints
{
    public const int PostAfterSessions = 10;

    public static void MapDiagnostics(this IEndpointRouteBuilder app)
    {
        var student = app.MapGroup("/api/student").WithTags("Student").RequireAuthorization(p => p.RequireRole("student"));
        student.MapGet("/diagnostic", Status);
        student.MapPost("/diagnostics", Submit);

        app.MapPut("/api/classes/{id:guid}/diagnostic", SetPostOpen).WithTags("Teacher")
            .RequireAuthorization(p => p.RequireRole("teacher"));
    }

    private static Guid UserId(ClaimsPrincipal p) => Guid.Parse(p.FindFirstValue(Claims.Sub)!);

    private static async Task<IResult> Status(ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = UserId(principal);
        var student = await db.Students.Include(s => s.Class).SingleOrDefaultAsync(s => s.UserId == userId, ct);
        if (student is null) return NotFound("Профиль ученика не найден");

        var mine = await db.Diagnostics.Where(d => d.StudentId == student.Id).ToListAsync(ct);
        var pre = mine.FirstOrDefault(d => d.Kind == "pre");
        var post = mine.FirstOrDefault(d => d.Kind == "post");
        var sessions = await db.Sessions.CountAsync(s => s.StudentId == student.Id, ct);

        var forms = new List<DiagnosticFormDto>();
        if (student.Class is { } cls)
        {
            // Входная — только до первой сессии, иначе она уже не «входная». Итоговая — другая форма.
            if (pre is null && sessions == 0) forms.Add(Form("pre", DiagnosticForms.PreFormFor(student.Id), cls.Lang));
            if (pre is not null && post is null) forms.Add(Form("post", DiagnosticForms.Other(pre.Form), cls.Lang));
        }

        return TypedResults.Ok(new DiagnosticStatusDto(
            pre is null ? null : ToDto(pre), post is null ? null : ToDto(post),
            sessions, PostAfterSessions, student.Class?.DiagnosticPostOpen ?? false, forms));
    }

    private static DiagnosticFormDto Form(string kind, string form, string lang) =>
        new(kind, form, lang, (DiagnosticForms.Get(form, lang) ?? DiagnosticForms.Get(form, "ru")!).Texts);

    /// <summary>
    /// Результат с устройства (через очередь отправки). Идемпотентно: та же запись или уже пройденный вид
    /// возвращают сохранённый результат, а не ошибку — устройство просто убирает запись из очереди.
    /// </summary>
    private static async Task<IResult> Submit(SubmitDiagnosticRequest req, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = UserId(principal);
        var student = await db.Students.SingleOrDefaultAsync(s => s.UserId == userId, ct);
        if (student is null) return NotFound("Профиль ученика не найден");

        var same = await db.Diagnostics.SingleOrDefaultAsync(d => d.Id == req.Id, ct);
        if (same is not null)
            return same.StudentId == student.Id ? TypedResults.Ok(ToDto(same)) : NotFound("Диагностика не найдена");

        var errors = new Dictionary<string, string[]>();
        if (req.Kind is not ("pre" or "post")) errors["kind"] = ["Вид: pre или post"];
        if (!DiagnosticForms.Forms.Contains(req.Form)) errors["form"] = ["Форма: A или B"];
        if (!DiagnosticForms.Langs.Contains(req.Lang)) errors["lang"] = ["Язык: kk или ru"];
        var score = errors.Count == 0 ? DiagnosticForms.Score(req.Form!, req.Lang!, req.Answers ?? []) : null;
        if (errors.Count == 0 && score is null) errors["answers"] = [$"Нужно {DiagnosticForms.TaskCount} ответов"];
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var done = await db.Diagnostics.SingleOrDefaultAsync(d => d.StudentId == student.Id && d.Kind == req.Kind, ct);
        if (done is not null) return TypedResults.Ok(ToDto(done));

        var now = DateTimeOffset.UtcNow;
        var d = new Diagnostic
        {
            Id = req.Id, StudentId = student.Id, Kind = req.Kind!, Form = req.Form!, Lang = req.Lang!,
            Answers = JsonSerializer.Serialize(req.Answers), Score = (short)score!.Total,
            StartedAt = req.StartedAt, TakenAt = req.FinishedAt > now ? now : req.FinishedAt, ReceivedAt = now,
        };
        db.Diagnostics.Add(d);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException e) when (DbErrors.IsUniqueViolation(e))
        {
            // Тот же результат пришёл параллельно (повтор из очереди) — отдаём сохранённый.
            db.ChangeTracker.Clear();
            var saved = await db.Diagnostics.SingleAsync(x => x.StudentId == student.Id && (x.Id == req.Id || x.Kind == req.Kind), ct);
            return TypedResults.Ok(ToDto(saved));
        }
        return TypedResults.Ok(ToDto(d));
    }

    private static async Task<IResult> SetPostOpen(Guid id, SetPostOpenRequest req, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var teacherId = UserId(principal);
        var cls = await db.Classes.SingleOrDefaultAsync(c => c.Id == id && c.TeacherId == teacherId, ct);
        if (cls is null) return NotFound("Класс не найден");
        cls.DiagnosticPostOpen = req.PostOpen;
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(new { postOpen = cls.DiagnosticPostOpen });
    }

    /// <summary>Сводка для карты навыков (ТЗ, 11): средние pre/post по классу и по ученикам.</summary>
    public static async Task<(DiagnosticSummaryDto Summary, Dictionary<Guid, (int? Pre, int? Post)> ByStudent)> SummaryAsync(
        SchoolClass cls, AppDbContext db, CancellationToken ct)
    {
        var rows = await db.Diagnostics.Where(d => d.Student!.ClassId == cls.Id).ToListAsync(ct);
        var results = rows.Select(r => (r.StudentId, r.Kind, Score: Rescore(r))).ToList();

        DiagnosticStatDto? Stat(string kind)
        {
            var list = results.Where(r => r.Kind == kind).Select(r => r.Score).ToList();
            if (list.Count == 0) return null;
            return new DiagnosticStatDto(list.Count, Math.Round(list.Average(s => s.Total), 2),
                Enumerable.Range(0, DiagnosticForms.Skills.Length).Select(i => Math.Round(list.Average(s => s.Skills[i]), 2)).ToArray());
        }

        var byStudent = results.GroupBy(r => r.StudentId).ToDictionary(
            g => g.Key,
            g => (g.FirstOrDefault(r => r.Kind == "pre").Score?.Total, g.FirstOrDefault(r => r.Kind == "post").Score?.Total));
        var paired = byStudent.Values.Where(v => v.Item1 is not null && v.Item2 is not null).ToList();

        return (new DiagnosticSummaryDto(cls.DiagnosticPostOpen, PostAfterSessions, Stat("pre"), Stat("post"),
            paired.Count == 0 ? null : new DiagnosticPairedDto(paired.Count,
                Math.Round(paired.Average(p => p.Item1!.Value), 2), Math.Round(paired.Average(p => p.Item2!.Value), 2))),
            byStudent);
    }

    private static DiagnosticScore Rescore(Diagnostic d) =>
        DiagnosticForms.Score(d.Form, d.Lang, JsonSerializer.Deserialize<int[]>(d.Answers) ?? [])
        ?? new DiagnosticScore(d.Score, new int[DiagnosticForms.Skills.Length]);

    private static DiagnosticResultDto ToDto(Diagnostic d)
    {
        var s = Rescore(d);
        return new(d.Id, d.Kind, d.Form, s.Total, s.Skills, d.TakenAt);
    }

    private static IResult NotFound(string title) => TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: title);
}
