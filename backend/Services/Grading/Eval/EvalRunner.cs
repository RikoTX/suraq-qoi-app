using System.Diagnostics;
using System.Globalization;
using System.Text;

namespace SuraqQoi.Api.Services.Grading.Eval;

/// <summary>
/// dotnet run -- eval-grading [--lang kk|ru] [--rules-only] [--budget 6.5] [--pace 20] [--out отчёт.md]
///   [--dataset tests/grading-eval/dataset.json] [--labels tests/grading-eval/labels.csv]
/// Прогоняет набор через ИИ (как в приложении: по 3 вопроса к тексту за запрос, тот же бюджет) и через правила,
/// сравнивает с уровнями учителя и печатает отчёт в markdown (ТЗ, 9.4).
/// </summary>
public static class EvalRunner
{
    public const int BatchSize = 3;
    private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");
    private static readonly string[] LevelNames = ["0 не по тексту", "1 найти", "2 связать", "3 вывести", "4 оценить"];

    public static async Task<int> RunAsync(string[] args, IServiceProvider services, IConfiguration config, string contentRoot, CancellationToken ct)
    {
        string Arg(string name, string fallback) => args.SkipWhile(a => a != name).Skip(1).FirstOrDefault() ?? fallback;
        var datasetPath = Arg("--dataset", Path.Combine(contentRoot, "tests", "grading-eval", "dataset.json"));
        var labelsPath = Arg("--labels", Path.Combine(contentRoot, "tests", "grading-eval", "labels.csv"));
        var lang = Arg("--lang", "");
        var rulesOnly = args.Contains("--rules-only");
        if (!double.TryParse(Arg("--budget", "6.5"), NumberStyles.Float, CultureInfo.InvariantCulture, out var budgetSeconds) || budgetSeconds <= 0)
        {
            Console.Error.WriteLine("--budget: секунды на запрос, например 6.5");
            return 1;
        }
        // Пауза между запросами к ИИ: бесплатный Groq — 8000 токенов в минуту, без паузы прогон упирается в лимит (429).
        if (!double.TryParse(Arg("--pace", "0"), NumberStyles.Float, CultureInfo.InvariantCulture, out var pace) || pace < 0) pace = 0;
        if (!File.Exists(datasetPath))
        {
            Console.Error.WriteLine($"Нет набора: {datasetPath}");
            return 1;
        }

        var dataset = GradingEval.LoadDataset(datasetPath);
        var labels = File.Exists(labelsPath) ? GradingEval.LoadLabels(labelsPath) : [];
        var questions = dataset.Questions.Where(q => lang == "" || q.Lang == lang).ToList();
        var byTeacher = questions.Count(q => labels.ContainsKey(q.Id));
        var teacherOnly = byTeacher > 0;
        if (teacherOnly) questions = questions.Where(q => labels.ContainsKey(q.Id)).ToList();
        int Expected(EvalQuestion q) => teacherOnly ? labels[q.Id] : q.Draft;
        var texts = dataset.Texts.ToDictionary(t => t.Id);

        var rules = questions.ToDictionary(q => q.Id, q => new EvalPrediction(q.Id, HeuristicGrader.Level(q.Q, texts[q.Text].Body, []), null));

        var hasKey = config["OpenAI:ApiKey"] is { Length: > 0 } || !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("OPENAI_API_KEY"));
        Dictionary<string, EvalPrediction>? ai = null;
        var latencies = new List<double>(); // только успешные ответы
        var failedCalls = 0;
        string? aiSkipped = rulesOnly ? "пропущен (--rules-only)" : hasKey ? null : "пропущен: нет ключа (dotnet user-secrets set \"OpenAI:ApiKey\" \"gsk_…\")";
        if (aiSkipped is null)
        {
            ai = [];
            var grader = services.GetRequiredService<IGradingService>();
            var budget = TimeSpan.FromSeconds(budgetSeconds);
            foreach (var group in questions.GroupBy(q => q.Text))
            {
                var text = texts[group.Key];
                foreach (var batch in group.Chunk(BatchSize))
                {
                    var input = new GradeInput(text.Lang, text.Title, text.Body,
                        batch.Select((q, i) => new GradeQuestion(i + 1, q.Q)).ToList(), null);
                    if (pace > 0 && (latencies.Count + failedCalls) > 0) await Task.Delay(TimeSpan.FromSeconds(pace), ct);
                    var clock = Stopwatch.StartNew();
                    var result = await grader.GradeAsync(input, budget, ct);
                    if (result is null) failedCalls++;
                    else latencies.Add(clock.Elapsed.TotalSeconds);
                    for (var i = 0; i < batch.Length; i++)
                    {
                        var graded = result?.Questions.FirstOrDefault(g => g.Position == i + 1);
                        ai[batch[i].Id] = new EvalPrediction(batch[i].Id, graded?.Level, graded?.Comment);
                    }
                    Console.Error.Write(result is null ? "×" : "·");
                }
            }
            Console.Error.WriteLine();
        }

        var report = Render(questions, texts, Expected, teacherOnly, byTeacher, rules, ai, aiSkipped, latencies, failedCalls, budgetSeconds,
            config["OpenAI:GradingModel"] ?? "openai/gpt-oss-20b");
        if (args.Contains("--out"))
        {
            File.WriteAllText(Arg("--out", "eval-grading.md"), report);
            Console.Error.WriteLine($"Отчёт: {Arg("--out", "eval-grading.md")}");
        }
        Console.WriteLine(report);
        return 0;
    }

    private static string Render(List<EvalQuestion> questions, Dictionary<string, EvalText> texts, Func<EvalQuestion, int> expected,
        bool teacherOnly, int byTeacher, Dictionary<string, EvalPrediction> rules, Dictionary<string, EvalPrediction>? ai,
        string? aiSkipped, List<double> latencies, int failedCalls, double budget, string model)
    {
        var sb = new StringBuilder();
        string Pct(double x) => $"{Math.Round(x * 100)}%";
        string Cell(EvalScore s, Func<EvalScore, int> part) => s.Total == 0 ? "—" : $"{Pct((double)part(s) / s.Total)} ({part(s)}/{s.Total})";
        EvalScore ScoreOf(Dictionary<string, EvalPrediction> p, string? lang) =>
            GradingEval.Score(questions.Where(q => lang is null || q.Lang == lang).Select(q => (expected(q), p[q.Id].Level)).ToList());
        string[] langs = ["kk", "ru"];

        sb.AppendLine("# Проверка оценки ИИ (Q2)").AppendLine();
        sb.AppendLine($"{DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(5)).ToString("d MMMM yyyy, HH:mm", Ru)} (Алматы). " +
                      $"Вопросов: {questions.Count}. Модель: `{model}`, бюджет на запрос {budget.ToString("0.#", Ru)} с, по {BatchSize} вопроса за запрос — как в приложении.");
        sb.AppendLine();
        sb.AppendLine(teacherOnly
            ? $"Эталон — **уровни учителя** ({byTeacher} вопросов размечено)."
            : "> ⚠️ Эталон — **черновые уровни команды**: учитель ещё не заполнил `labels.csv`. Эти цифры — для настройки промпта, **не для слайда**.");

        sb.AppendLine().AppendLine("## Итог").AppendLine();
        sb.AppendLine("| | kk | ru | всего | цель |").AppendLine("|---|---|---|---|---|");
        if (ai is not null)
        {
            sb.AppendLine($"| **ИИ: точно** | {string.Join(" | ", langs.Select(l => Cell(ScoreOf(ai, l), s => s.Exact)))} | **{Cell(ScoreOf(ai, null), s => s.Exact)}** | ≥ {Pct(GradingEval.TargetExact)} |");
            sb.AppendLine($"| **ИИ: ±1 уровень** | {string.Join(" | ", langs.Select(l => Cell(ScoreOf(ai, l), s => s.Within1)))} | **{Cell(ScoreOf(ai, null), s => s.Within1)}** | ≥ {Pct(GradingEval.TargetWithin1)} |");
            sb.AppendLine($"| ИИ ответил | {string.Join(" | ", langs.Select(l => Cell(ScoreOf(ai, l), s => s.Answered)))} | {Cell(ScoreOf(ai, null), s => s.Answered)} | 100% |");
        }
        else sb.AppendLine($"| ИИ | {aiSkipped} | | | |");
        sb.AppendLine($"| Правила на телефоне: точно | {string.Join(" | ", langs.Select(l => Cell(ScoreOf(rules, l), s => s.Exact)))} | {Cell(ScoreOf(rules, null), s => s.Exact)} | — |");
        sb.AppendLine($"| Правила: ±1 уровень | {string.Join(" | ", langs.Select(l => Cell(ScoreOf(rules, l), s => s.Within1)))} | {Cell(ScoreOf(rules, null), s => s.Within1)} | — |");
        sb.AppendLine().AppendLine("Правила работают без сети и намеренно не ставят выше уровня 2 (ТЗ, 9.3): уровни 3–4 у них всегда «ошибка». Это сравнение показывает, сколько даёт ИИ.");

        if (ai is not null)
        {
            sb.AppendLine().AppendLine("## Время ответа ИИ").AppendLine();
            if (latencies.Count == 0) sb.AppendLine($"Успешных ответов нет (неудачных запросов: {failedCalls}). Проверьте ключ и сеть.");
            else
            {
                var sorted = latencies.Order().ToList();
                double P(double q) => sorted[Math.Min(sorted.Count - 1, (int)Math.Ceiling(q * sorted.Count) - 1)];
                sb.AppendLine($"Успешных ответов: {sorted.Count}, без ответа (таймаут или ошибка): {failedCalls}. " +
                              $"Медиана {P(0.5).ToString("0.0", Ru)} с, p95 {P(0.95).ToString("0.0", Ru)} с, максимум {sorted[^1].ToString("0.0", Ru)} с. " +
                              $"Уложились в 5 с: {Pct((double)sorted.Count(x => x <= 5) / (sorted.Count + failedCalls))} всех запросов (критерий приёмки 3).");
            }

            foreach (var l in langs)
            {
                var s = ScoreOf(ai, l);
                if (s.Total == 0) continue;
                sb.AppendLine().AppendLine($"## Матрица ошибок ИИ — {l}").AppendLine();
                sb.AppendLine("Строки — уровень учителя (эталон), столбцы — уровень ИИ.").AppendLine();
                sb.AppendLine("| эталон \\ ИИ | 0 | 1 | 2 | 3 | 4 | нет ответа |").AppendLine("|---|---|---|---|---|---|---|");
                for (var e = 0; e < 5; e++)
                    sb.AppendLine($"| {LevelNames[e]} | {string.Join(" | ", Enumerable.Range(0, 5).Select(p => e == p ? $"**{s.Confusion[e, p]}**" : s.Confusion[e, p].ToString()))} | {s.Unanswered[e]} |");
            }

            var misses = questions.Where(q => ai[q.Id].Level != expected(q)).ToList();
            sb.AppendLine().AppendLine($"## Расхождения ИИ с эталоном ({misses.Count})").AppendLine();
            if (misses.Count == 0) sb.AppendLine("Нет.");
            else
            {
                sb.AppendLine("| id | вопрос | эталон | ИИ | комментарий ИИ |").AppendLine("|---|---|---|---|---|");
                foreach (var q in misses)
                    sb.AppendLine($"| {q.Id} | {Md(q.Q)} | {expected(q)} | {ai[q.Id].Level?.ToString() ?? "—"} | {Md(ai[q.Id].Comment ?? "")} |");
            }

            if (teacherOnly)
            {
                var all = ScoreOf(ai, null);
                sb.AppendLine().AppendLine("## Для слайда").AppendLine();
                sb.AppendLine($"«ИИ совпадает с учителем в {Pct(all.ExactShare)} случаев, ±1 уровень — {Pct(all.Within1Share)} " +
                              $"(казахский — {Pct(ScoreOf(ai, "kk").ExactShare)}, русский — {Pct(ScoreOf(ai, "ru").ExactShare)}; {all.Total} вопросов, разметка учителя)»");
            }
        }
        return sb.ToString();
    }

    private static string Md(string s) => s.Replace("|", "\\|").Replace("\n", " ");
}
