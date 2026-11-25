using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Services.Content;

namespace SuraqQoi.Api.Features.Texts;

/// <summary>Текст для чтения. exampleQuestions: уровень ("1"–"4") → пример вопроса; hints: подсказки ученику.</summary>
public sealed record TextDto(
    Guid Id, Guid? ClassId, string Lang, string Topic, string Kind, short Difficulty, string Title, string Body,
    Dictionary<string, string> ExampleQuestions, string[] Hints, bool Reviewed, DateTimeOffset UpdatedAt);

/// <summary>Создание и правка текста учителем. Reviewed = опубликован для учеников класса.</summary>
public sealed record SaveTextRequest(
    string Title, string Body, string Topic, string Kind, short Difficulty,
    Dictionary<string, string>? ExampleQuestions, string[]? Hints, bool Reviewed);

public sealed record GenerateTextsRequest(string Topic, string Kind, short Difficulty, int Count);
public sealed record AddFromLibraryRequest(Guid[] TextIds);

/// <summary>Пакет для устройства: новые/изменённые тексты + id всех актуальных (чтобы удалить снятые с публикации).</summary>
public sealed record PackResponse(string? Version, List<TextDto> Texts, List<Guid> Ids);

/// <summary>
/// Тексты класса: учитель пишет их сам, генерирует через ИИ или берёт из общей библиотеки,
/// проверяет и публикует — и отвечает за них. Ученик получает опубликованные тексты своего класса.
/// </summary>
public static class TextEndpoints
{
    public static readonly string[] Langs = ["kk", "ru"];
    public static readonly string[] Topics = ["sport", "games", "money", "nature", "history", "tech", "local"];
    public static readonly string[] Kinds = ["article", "table", "notice", "schedule", "social_post", "math_problem"];
    public const int MaxGeneratePerRequest = 5;

    public static void MapTexts(this IEndpointRouteBuilder app)
    {
        var teacher = app.MapGroup("/api").WithTags("Teacher texts")
            .RequireAuthorization(p => p.RequireRole("teacher"));
        teacher.MapGet("/classes/{classId:guid}/texts", ClassTexts);
        teacher.MapPost("/classes/{classId:guid}/texts", Create);
        teacher.MapPost("/classes/{classId:guid}/texts/generate", Generate);
        teacher.MapPost("/classes/{classId:guid}/texts/from-library", AddFromLibrary);
        teacher.MapGet("/library", Library);
        teacher.MapGet("/texts/{id:guid}", Get);
        teacher.MapPut("/texts/{id:guid}", Update);
        teacher.MapDelete("/texts/{id:guid}", Delete);

        app.MapGet("/api/student/pack", Pack).WithTags("Student")
            .RequireAuthorization(p => p.RequireRole("student"));
    }

    private static Guid UserId(ClaimsPrincipal p) => Guid.Parse(p.FindFirstValue(Claims.Sub)!);

    private static Task<SchoolClass?> OwnClass(AppDbContext db, Guid classId, ClaimsPrincipal p, CancellationToken ct)
    {
        var teacherId = UserId(p);
        return db.Classes.SingleOrDefaultAsync(c => c.Id == classId && c.TeacherId == teacherId, ct);
    }

    /// <summary>Текст класса, принадлежащего этому учителю. Библиотечные тексты так не редактируются.</summary>
    private static Task<ReadingText?> OwnText(AppDbContext db, Guid id, ClaimsPrincipal p, CancellationToken ct)
    {
        var teacherId = UserId(p);
        return db.Texts.SingleOrDefaultAsync(t => t.Id == id && t.Class != null && t.Class.TeacherId == teacherId, ct);
    }

    private static async Task<IResult> ClassTexts(Guid classId, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        if (await OwnClass(db, classId, principal, ct) is null) return ClassNotFound();
        var texts = await db.Texts.Where(t => t.ClassId == classId)
            .OrderBy(t => t.Reviewed).ThenByDescending(t => t.UpdatedAt).ToListAsync(ct);
        return TypedResults.Ok(texts.Select(ToDto));
    }

    private static async Task<IResult> Create(Guid classId, SaveTextRequest req, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var cls = await OwnClass(db, classId, principal, ct);
        if (cls is null) return ClassNotFound();
        if (Validate(req) is { } problem) return problem;

        var t = new ReadingText
        {
            Id = Guid.NewGuid(),
            ClassId = cls.Id,
            CreatedById = UserId(principal),
            Lang = cls.Lang,
            Topic = req.Topic,
            Kind = req.Kind,
            Title = "",
            Body = "",
            ExampleQuestions = "{}",
            Hints = "[]",
        };
        Apply(t, req);
        db.Texts.Add(t);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(ToDto(t));
    }

    /// <summary>ИИ пишет черновики (reviewed = false) на языке класса. Учитель читает, правит и публикует.</summary>
    private static async Task<IResult> Generate(Guid classId, GenerateTextsRequest req, ClaimsPrincipal principal,
        AppDbContext db, TextGenerator generator, CancellationToken ct)
    {
        var cls = await OwnClass(db, classId, principal, ct);
        if (cls is null) return ClassNotFound();

        var errors = new Dictionary<string, string[]>();
        if (!Topics.Contains(req.Topic)) errors["topic"] = ["Выберите тему"];
        if (!Kinds.Contains(req.Kind)) errors["kind"] = ["Выберите тип текста"];
        if (req.Difficulty is < 1 or > 5) errors["difficulty"] = ["Сложность: от 1 до 5"];
        if (req.Count is < 1 or > MaxGeneratePerRequest) errors["count"] = [$"Количество: от 1 до {MaxGeneratePerRequest}"];
        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var options = new GenerateOptions(cls.Lang, req.Topic, req.Kind, req.Difficulty, req.Count);
        var avoid = await db.Texts.Where(t => t.ClassId == cls.Id).Select(t => t.Title).ToListAsync(ct);
        List<Generated> generated;
        try
        {
            generated = await generator.GenerateAsync(options, avoid, ct);
        }
        catch (TextGenerationException e)
        {
            return TypedResults.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: e.Message);
        }
        if (generated.Count == 0)
            return TypedResults.Problem(statusCode: StatusCodes.Status502BadGateway,
                title: "ИИ не смог написать текст. Попробуйте ещё раз или выберите другую тему.");

        var texts = generated.Select(g => TextGenerator.ToEntity(g, options, cls.Id, UserId(principal))).ToList();
        db.Texts.AddRange(texts);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(texts.Select(ToDto));
    }

    /// <summary>Копии библиотечных текстов в класс — черновиками: учитель читает и публикует сам.</summary>
    private static async Task<IResult> AddFromLibrary(Guid classId, AddFromLibraryRequest req, ClaimsPrincipal principal,
        AppDbContext db, CancellationToken ct)
    {
        var cls = await OwnClass(db, classId, principal, ct);
        if (cls is null) return ClassNotFound();
        var ids = (req.TextIds ?? []).Distinct().Take(50).ToArray();
        var source = await db.Texts.Where(t => ids.Contains(t.Id) && t.ClassId == null && t.Lang == cls.Lang).ToListAsync(ct);
        if (source.Count == 0)
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["textIds"] = ["Выберите тексты из библиотеки"] });

        var copies = source.Select(s => new ReadingText
        {
            Id = Guid.NewGuid(),
            ClassId = cls.Id,
            CreatedById = UserId(principal),
            Lang = s.Lang,
            Topic = s.Topic,
            Kind = s.Kind,
            Difficulty = s.Difficulty,
            Title = s.Title,
            Body = s.Body,
            ExampleQuestions = s.ExampleQuestions,
            Hints = s.Hints,
            Reviewed = false,
            UpdatedAt = DateTimeOffset.UtcNow,
        }).ToList();
        db.Texts.AddRange(copies);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(copies.Select(ToDto));
    }

    /// <summary>Общая библиотека на языке класса (тексты из generate-texts).</summary>
    private static async Task<IResult> Library(string lang, AppDbContext db, CancellationToken ct)
    {
        if (!Langs.Contains(lang))
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["lang"] = ["Язык: kk или ru"] });
        var texts = await db.Texts.Where(t => t.ClassId == null && t.Lang == lang)
            .OrderBy(t => t.Difficulty).ThenBy(t => t.Title).ToListAsync(ct);
        return TypedResults.Ok(texts.Select(ToDto));
    }

    private static async Task<IResult> Get(Guid id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct) =>
        await OwnText(db, id, principal, ct) is { } t ? TypedResults.Ok(ToDto(t)) : TextNotFound();

    private static async Task<IResult> Update(Guid id, SaveTextRequest req, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var t = await OwnText(db, id, principal, ct);
        if (t is null) return TextNotFound();
        if (Validate(req) is { } problem) return problem;
        Apply(t, req);
        await db.SaveChangesAsync(ct);
        return TypedResults.Ok(ToDto(t));
    }

    private static async Task<IResult> Delete(Guid id, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var t = await OwnText(db, id, principal, ct);
        if (t is null) return TextNotFound();
        db.Texts.Remove(t);
        await db.SaveChangesAsync(ct);
        return TypedResults.NoContent();
    }

    /// <summary>Опубликованные тексты класса ученика. since — версия прошлого пакета на устройстве.</summary>
    private static async Task<IResult> Pack(DateTimeOffset? since, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct)
    {
        var userId = UserId(principal);
        var classId = await db.Students.Where(s => s.UserId == userId).Select(s => s.ClassId).SingleOrDefaultAsync(ct);
        if (classId is null)
            return TypedResults.Problem(statusCode: StatusCodes.Status409Conflict, title: "Сначала вступите в класс");

        var published = db.Texts.Where(t => t.ClassId == classId && t.Reviewed);
        var ids = await published.Select(t => t.Id).ToListAsync(ct);
        var changed = await (since is null ? published : published.Where(t => t.UpdatedAt > since))
            .OrderBy(t => t.Difficulty).ToListAsync(ct);
        var version = await published.MaxAsync(t => (DateTimeOffset?)t.UpdatedAt, ct);

        return TypedResults.Ok(new PackResponse(version?.ToString("O"), changed.Select(ToDto).ToList(), ids));
    }

    private static IResult? Validate(SaveTextRequest req)
    {
        var errors = new Dictionary<string, string[]>();
        var title = req.Title?.Trim() ?? "";
        var body = req.Body?.Trim() ?? "";
        if (title.Length is < 1 or > 120) errors["title"] = ["Заголовок: от 1 до 120 символов"];
        if (body.Length < 50) errors["body"] = ["Текст слишком короткий — нужно хотя бы несколько предложений"];
        if (body.Length > 6000) errors["body"] = ["Текст слишком длинный (максимум ~800 слов)"];
        if (!Topics.Contains(req.Topic)) errors["topic"] = ["Выберите тему"];
        if (!Kinds.Contains(req.Kind)) errors["kind"] = ["Выберите тип текста"];
        if (req.Difficulty is < 1 or > 5) errors["difficulty"] = ["Сложность: от 1 до 5"];
        return errors.Count > 0 ? TypedResults.ValidationProblem(errors) : null;
    }

    private static void Apply(ReadingText t, SaveTextRequest req)
    {
        t.Title = req.Title.Trim();
        t.Body = req.Body.Trim();
        t.Topic = req.Topic;
        t.Kind = req.Kind;
        t.Difficulty = req.Difficulty;
        var examples = (req.ExampleQuestions ?? [])
            .Where(kv => kv.Key is "1" or "2" or "3" or "4" && !string.IsNullOrWhiteSpace(kv.Value))
            .ToDictionary(kv => kv.Key, kv => kv.Value.Trim());
        t.ExampleQuestions = JsonSerializer.Serialize(examples);
        t.Hints = JsonSerializer.Serialize((req.Hints ?? []).Where(h => !string.IsNullOrWhiteSpace(h)).Select(h => h.Trim()));
        t.Reviewed = req.Reviewed;
        t.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static IResult ClassNotFound() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Класс не найден");

    private static IResult TextNotFound() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Текст не найден");

    public static TextDto ToDto(ReadingText t) => new(
        t.Id, t.ClassId, t.Lang, t.Topic, t.Kind, t.Difficulty, t.Title, t.Body,
        Parse<Dictionary<string, string>>(t.ExampleQuestions) ?? [],
        Parse<string[]>(t.Hints) ?? [],
        t.Reviewed, t.UpdatedAt);

    private static T? Parse<T>(string json)
    {
        try { return JsonSerializer.Deserialize<T>(json); }
        catch (JsonException) { return default; }
    }
}
