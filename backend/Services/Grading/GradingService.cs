using System.ClientModel;
using System.ClientModel.Primitives;
using System.Diagnostics;
using System.Text.Json;
using OpenAI;
using OpenAI.Chat;

namespace SuraqQoi.Api.Services.Grading;

public sealed record GradeQuestion(int Position, string Body);

public sealed record GradeInput(string Lang, string TextTitle, string TextBody, IReadOnlyList<GradeQuestion> Questions, string? Conclusion);

public sealed record GradedQuestion(int Position, int Level, string Comment, string Hint);

public sealed record GradeResult(List<GradedQuestion> Questions, int ConclusionScore, string ConclusionComment);

/// <summary>Оценка вопросов и вывода ученика (ТЗ, 9.2). null — оценить не удалось (нет ключа, таймаут, ошибка).</summary>
public interface IGradingService
{
    Task<GradeResult?> GradeAsync(GradeInput input, TimeSpan budget, CancellationToken ct);
}

/// <summary>
/// Оценка через OpenAI-совместимый API (сейчас Groq), модель OpenAI:GradingModel, строгая JSON-схема.
/// Бюджет на сессию — общий с повтором: первая попытка ≤ 4 с, повтор — только если осталось ≥ 2 с.
/// Без ключа в Development оценивает правилами (чтобы приложение работало локально), на сервере — null.
/// </summary>
public sealed class OpenAiGradingService(IConfiguration config, IHostEnvironment env, ILogger<OpenAiGradingService> logger) : IGradingService
{
    public static readonly TimeSpan FirstAttempt = TimeSpan.FromSeconds(4);
    public static readonly TimeSpan MinRetry = TimeSpan.FromSeconds(2);
    /// <summary>Ответ на 3 вопроса + вывод — около 400 токенов; запас на рассуждение модели.</summary>
    public const int MaxOutputTokens = 1500;

    public async Task<GradeResult?> GradeAsync(GradeInput input, TimeSpan budget, CancellationToken ct)
    {
        var apiKey = config["OpenAI:ApiKey"] is { Length: > 0 } k ? k : Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
            return env.IsDevelopment() ? DevFallback(input) : null;

        var model = config["OpenAI:GradingModel"] is { Length: > 0 } m ? m : "openai/gpt-oss-20b";
        var clientOptions = new OpenAIClientOptions { NetworkTimeout = budget, RetryPolicy = new ClientRetryPolicy(0) };
        if (config["OpenAI:Endpoint"] is { Length: > 0 } endpoint) clientOptions.Endpoint = new Uri(endpoint);
        var client = new ChatClient(model, new ApiKeyCredential(apiKey), clientOptions);

        var clock = Stopwatch.StartNew();
        for (var attempt = 1; attempt <= 2; attempt++)
        {
            var left = budget - clock.Elapsed;
            var timeout = attempt == 1 ? (left < FirstAttempt ? left : FirstAttempt) : left;
            if (timeout <= TimeSpan.Zero || (attempt == 2 && left < MinRetry)) break;

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(timeout);
            try
            {
                var result = await CallAsync(client, input, cts.Token);
                if (result is not null) return result;
            }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                logger.LogWarning("Оценка ИИ: таймаут попытки {Attempt} ({Timeout} мс)", attempt, (int)timeout.TotalMilliseconds);
            }
            catch (ClientResultException e)
            {
                // Без текста вопросов и имён в логах (ТЗ, 15).
                logger.LogWarning("Оценка ИИ: ошибка API {Status} (попытка {Attempt})", e.Status, attempt);
                // Ключ, модель или лимит Groq (429: бесплатно 8000 токенов в минуту) — сразу повторять бесполезно.
                // Сессия останется «ждёт проверки» и оценится при следующей отправке из очереди телефона.
                if (e.Status is 401 or 403 or 404 or 429) break;
            }
        }
        return null;
    }

    private async Task<GradeResult?> CallAsync(ChatClient client, GradeInput input, CancellationToken ct)
    {
        List<ChatMessage> messages = [new SystemChatMessage(GradingPrompts.System), new UserChatMessage(GradingPrompts.User(input))];
        var options = new ChatCompletionOptions
        {
            Temperature = 0.2f,
            // gpt-oss «рассуждает» перед ответом, и эти токены тоже идут в лимит Groq. Для классификации хватает коротких.
#pragma warning disable OPENAI001 // свойство помечено в SDK как экспериментальное; Groq его поддерживает для gpt-oss
            ReasoningEffortLevel = ChatReasoningEffortLevel.Low,
#pragma warning restore OPENAI001
            MaxOutputTokenCount = MaxOutputTokens,
            ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat(
                jsonSchemaFormatName: "grading", jsonSchema: BinaryData.FromString(GradingPrompts.Schema), jsonSchemaIsStrict: true),
        };
        ChatCompletion response = await client.CompleteChatAsync(messages, options, ct);
        // Без текста ученика — только расход (ТЗ, 15): по нему видно, сколько оценок влезает в лимит.
        logger.LogInformation("Оценка ИИ: {Prompt} + {Completion} токенов (из них рассуждение {Reasoning})",
            response.Usage?.InputTokenCount, response.Usage?.OutputTokenCount, response.Usage?.OutputTokenDetails?.ReasoningTokenCount);
        if (!string.IsNullOrEmpty(response.Refusal) || response.FinishReason == ChatFinishReason.Length) return null;

        try
        {
            var raw = JsonSerializer.Deserialize<RawResult>(string.Concat(response.Content.Select(p => p.Text)), JsonOpts);
            if (raw is null) return null;
            var byPosition = raw.Questions.GroupBy(q => q.Position).ToDictionary(g => g.Key, g => g.First());
            // Ответ должен покрыть все вопросы ученика, иначе считаем его неудачным.
            if (input.Questions.Any(q => !byPosition.ContainsKey(q.Position))) return null;

            var questions = input.Questions.Select(q => byPosition[q.Position]).Select(q => new GradedQuestion(
                q.Position, Math.Clamp(q.Level, 0, 4), Trim(q.Comment, 200), Trim(q.Hint, 200))).ToList();
            var conclusionScore = string.IsNullOrWhiteSpace(input.Conclusion) ? 0 : Math.Clamp(raw.ConclusionScore, 0, 20);
            return new GradeResult(questions, conclusionScore, Trim(raw.ConclusionComment, 300));
        }
        catch (JsonException)
        {
            logger.LogWarning("Оценка ИИ: не удалось разобрать ответ модели");
            return null;
        }
    }

    /// <summary>Только для локальной разработки без ключа: правила вместо ИИ, с честной пометкой.</summary>
    private static GradeResult DevFallback(GradeInput input)
    {
        var previous = new List<string>();
        var questions = new List<GradedQuestion>();
        foreach (var q in input.Questions.OrderBy(q => q.Position))
        {
            var level = HeuristicGrader.Level(q.Body, input.TextBody, previous);
            previous.Add(q.Body);
            questions.Add(new GradedQuestion(q.Position, level, "Оценено правилами: ИИ на сервере не настроен (нет ключа).",
                "Спроси, почему так получилось или что будет дальше."));
        }
        return new GradeResult(questions, HeuristicGrader.ConclusionScore(input.Conclusion, input.TextBody),
            "Оценено правилами: ИИ на сервере не настроен.");
    }

    private static string Trim(string? s, int max)
    {
        var t = (s ?? "").Trim();
        return t.Length > max ? t[..max] : t;
    }

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    private sealed record RawQuestion(int Position, int Level, string Comment, string Hint);

    private sealed record RawResult(List<RawQuestion> Questions, int ConclusionScore, string ConclusionComment);
}
