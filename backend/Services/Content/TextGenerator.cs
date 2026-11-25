using System.Text.Json;
using System.ClientModel;
using OpenAI;
using OpenAI.Chat;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Features.Texts;

namespace SuraqQoi.Api.Services.Content;

public sealed record GenerateOptions(string Lang, string Topic, string Kind, short Difficulty, int Count);

/// <summary>Сгенерированный текст (ещё не сохранён).</summary>
public sealed record Generated(string Title, string Body, Dictionary<string, string> ExampleQuestions, string[] Hints);

/// <summary>Генерация невозможна: нет ключа, ошибка API, лимиты. Message — понятный пользователю текст.</summary>
public sealed class TextGenerationException(string message) : Exception(message);

/// <summary>
/// Генерация текстов через OpenAI-совместимый API (сейчас Groq; ТЗ, раздел 12).
/// Модель — OpenAI:TextModel, сервер — OpenAI:Endpoint.
/// Используется учителем (тексты своего класса, черновики) и командой generate-texts (общая библиотека):
/// dotnet run -- generate-texts --lang kk --topic local --kind schedule --difficulty 2 --count 5
/// </summary>
public sealed class TextGenerator(AppDbContext db, IConfiguration config, ILogger<TextGenerator> logger)
{
    /// <summary>Генерирует до o.Count текстов; неудачные (отказ, обрезка, плохой JSON) пропускает.</summary>
    public async Task<List<Generated>> GenerateAsync(GenerateOptions o, IEnumerable<string> avoidTitles, CancellationToken ct)
    {
        var apiKey = config["OpenAI:ApiKey"] is { Length: > 0 } k ? k : Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new TextGenerationException("ИИ не настроен: на сервере не задан ключ (OpenAI:ApiKey).");

        var model = config["OpenAI:TextModel"] is { Length: > 0 } m ? m : "openai/gpt-oss-120b";
        // Endpoint пустой — сам OpenAI; иначе любой OpenAI-совместимый сервер (сейчас Groq).
        var clientOptions = new OpenAIClientOptions { NetworkTimeout = TimeSpan.FromSeconds(90) };
        if (config["OpenAI:Endpoint"] is { Length: > 0 } endpoint) clientOptions.Endpoint = new Uri(endpoint);
        var client = new ChatClient(model, new ApiKeyCredential(apiKey), clientOptions);

        var existing = avoidTitles.ToList();
        var result = new List<Generated>();
        for (var i = 0; i < o.Count; i++)
        {
            Generated? text;
            try
            {
                text = await GenerateOneAsync(client, o, existing, ct);
            }
            catch (ClientResultException e)
            {
                // Ключ, баланс, лимиты, неверная модель — повторять бессмысленно.
                logger.LogError("ИИ вернул ошибку {Status}: {Message}", e.Status, e.Message);
                if (result.Count > 0) break; // часть уже готова — отдаём её
                throw new TextGenerationException(e.Status == 429
                    ? "ИИ сейчас перегружен (лимит запросов). Попробуйте через минуту."
                    : $"ИИ вернул ошибку ({e.Status}). Попробуйте позже.");
            }
            if (text is null) continue;
            existing.Add(text.Title);
            result.Add(text);
        }
        return result;
    }

    public static ReadingText ToEntity(Generated g, GenerateOptions o, Guid? classId, Guid? createdById) => new()
    {
        Id = Guid.NewGuid(),
        ClassId = classId,
        CreatedById = createdById,
        Lang = o.Lang,
        Topic = o.Topic,
        Kind = o.Kind,
        Difficulty = o.Difficulty,
        Title = g.Title.Trim(),
        Body = g.Body.Trim(),
        ExampleQuestions = JsonSerializer.Serialize(g.ExampleQuestions),
        Hints = JsonSerializer.Serialize(g.Hints),
        Reviewed = false,
        UpdatedAt = DateTimeOffset.UtcNow,
    };

    /// <summary>CLI: генерация в общую библиотеку (ClassId = null).</summary>
    public async Task<int> RunAsync(GenerateOptions o, CancellationToken ct)
    {
        var titles = await db.Texts.Where(t => t.ClassId == null && t.Lang == o.Lang && t.Topic == o.Topic)
            .Select(t => t.Title).ToListAsync(ct);
        try
        {
            var texts = await GenerateAsync(o, titles, ct);
            foreach (var g in texts)
            {
                db.Texts.Add(ToEntity(g, o, classId: null, createdById: null));
                logger.LogInformation("Сохранён в библиотеку: «{Title}»", g.Title);
            }
            await db.SaveChangesAsync(ct);
            return texts.Count;
        }
        catch (TextGenerationException e)
        {
            logger.LogError("{Message}", e.Message);
            return 0;
        }
    }

    private async Task<Generated?> GenerateOneAsync(ChatClient client, GenerateOptions o, List<string> existing, CancellationToken ct)
    {
        List<ChatMessage> messages = [new SystemChatMessage(SystemPrompt), new UserChatMessage(UserPrompt(o, existing))];
        var options = new ChatCompletionOptions
        {
            ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                jsonSchemaFormatName: "reading_text",
                jsonSchema: BinaryData.FromString(Schema),
                jsonSchemaIsStrict: true),
        };

        ChatCompletion response = await client.CompleteChatAsync(messages, options, ct);

        if (!string.IsNullOrEmpty(response.Refusal))
        {
            logger.LogWarning("Модель отказалась писать текст (тема {Topic}); пропускаю", o.Topic);
            return null;
        }
        if (response.FinishReason == ChatFinishReason.Length)
        {
            logger.LogWarning("Ответ обрезан по лимиту токенов; пропускаю");
            return null;
        }

        var json = string.Concat(response.Content.Select(p => p.Text));
        try
        {
            var g = JsonSerializer.Deserialize<Generated>(json, JsonOpts);
            if (g is null || g.Body.Length < 100) throw new JsonException("пустой текст");
            return g;
        }
        catch (JsonException e)
        {
            logger.LogWarning("Не удалось разобрать ответ модели: {Error}; пропускаю", e.Message);
            return null;
        }
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private static readonly string SystemPrompt = """
        Ты пишешь короткие тексты для тренажёра функциональной грамотности (чтение) для учеников 7–9 классов
        в Казахстане, 13–15 лет. Ученик читает текст и сам задаёт к нему вопросы четырёх уровней по PISA:
        1 — найти информацию, 2 — связать факты, 3 — сделать вывод, 4 — оценить текст.
        Поэтому в тексте должны быть факты для поиска, связи между ними, то, что можно вывести,
        но что прямо не сказано, и что-то, о чём можно поспорить.

        Требования к тексту:
        - 180–300 слов (не короче 180!), markdown (таблицы и списки — если подходят к типу текста).
        - Реалии Казахстана: города и сёла, тенге, школа, праздники, природа. Жизнь подростка, без морали и назиданий.
        - Никаких реальных компаний, банков, брендов, операторов связи и известных людей: все герои и организации вымышлены, но правдоподобны.
        - Простой живой язык, без канцелярита. Казахский — грамотный литературный, как у носителя.
        - Без насилия, политики и рекламы.

        exampleQuestions — по одному образцовому вопросу ученика на каждый уровень, ключи "1"–"4".
        hints — 2 короткие подсказки, которые помогут ученику задать вопрос поглубже, не раскрывая ответ.
        Всё — на языке текста.
        """;

    private static string UserPrompt(GenerateOptions o, List<string> existing)
    {
        var lang = o.Lang == "kk" ? "казахском" : "русском";
        var avoid = existing.Count == 0 ? "" : $"\nУже есть тексты с заголовками (не повторяй сюжеты): {string.Join("; ", existing.TakeLast(30))}.";
        return $"""
            Напиши один текст на {lang} языке.
            Тема: {TopicLabels[o.Topic]}. Тип текста: {KindLabels[o.Kind]}. Сложность {o.Difficulty} из 5.{avoid}
            """;
    }

    private static readonly Dictionary<string, string> TopicLabels = new()
    {
        ["sport"] = "спорт", ["games"] = "игры и киберспорт", ["money"] = "деньги и финансы",
        ["nature"] = "природа и экология", ["history"] = "история и культура Казахстана",
        ["tech"] = "технологии", ["local"] = "жизнь села или города",
    };

    private static readonly Dictionary<string, string> KindLabels = new()
    {
        ["article"] = "статья или заметка в местной газете", ["table"] = "таблица с пояснением",
        ["notice"] = "объявление", ["schedule"] = "расписание с пояснениями",
        ["social_post"] = "пост в соцсети или чате", ["math_problem"] = "текстовая задача по математике",
    };

    // Строгая схема OpenAI: у каждого объекта additionalProperties = false и все поля в required.
    private const string Schema = """
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["title", "body", "exampleQuestions", "hints"],
          "properties": {
            "title": { "type": "string" },
            "body": { "type": "string" },
            "exampleQuestions": {
              "type": "object",
              "additionalProperties": false,
              "required": ["1", "2", "3", "4"],
              "properties": {
                "1": { "type": "string" }, "2": { "type": "string" },
                "3": { "type": "string" }, "4": { "type": "string" }
              }
            },
            "hints": { "type": "array", "items": { "type": "string" } }
          }
        }
        """;

    /// <summary>Разбор аргументов командной строки; null — ошибка (сообщение в error).</summary>
    public static GenerateOptions? ParseArgs(string[] args, out string? error)
    {
        var map = new Dictionary<string, string>();
        for (var i = 1; i + 1 < args.Length; i += 2) map[args[i].TrimStart('-')] = args[i + 1];

        var lang = map.GetValueOrDefault("lang", "");
        var topic = map.GetValueOrDefault("topic", "local");
        var kind = map.GetValueOrDefault("kind", "article");
        error = null;
        if (!TextEndpoints.Langs.Contains(lang)) error = "--lang: kk или ru";
        else if (!TextEndpoints.Topics.Contains(topic)) error = $"--topic: {string.Join(", ", TextEndpoints.Topics)}";
        else if (!TextEndpoints.Kinds.Contains(kind)) error = $"--kind: {string.Join(", ", TextEndpoints.Kinds)}";
        else if (!short.TryParse(map.GetValueOrDefault("difficulty", "2"), out var d) || d is < 1 or > 5) error = "--difficulty: 1–5";
        else if (!int.TryParse(map.GetValueOrDefault("count", "1"), out var c) || c is < 1 or > 20) error = "--count: 1–20";
        if (error is not null) return null;

        return new GenerateOptions(lang, topic, kind, short.Parse(map.GetValueOrDefault("difficulty", "2")), int.Parse(map.GetValueOrDefault("count", "1")));
    }
}
