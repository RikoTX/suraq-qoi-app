using System.Text.Json;

namespace SuraqQoi.Api.Data.Diagnostics;

public sealed record DiagnosticTask(string Skill, string Q, string[] Options, int Answer);

public sealed record DiagnosticText(string Title, string Body, DiagnosticTask[] Tasks);

public sealed record DiagnosticFormContent(DiagnosticText[] Texts);

/// <summary>Результат: всего верных 0–6 и по навыкам [найти, связать, оценить], 0–2 каждый.</summary>
public sealed record DiagnosticScore(int Total, int[] Skills);

/// <summary>
/// Мини-диагностика (ТЗ, 11.1): две параллельные формы A и B на kk и ru, по 6 заданий с выбором ответа.
/// Задания — в forms.json (встроен в сборку). Ответ проверяет и устройство (офлайн), и сервер — его оценка главная.
/// </summary>
public static class DiagnosticForms
{
    public const int TaskCount = 6;
    public static readonly string[] Skills = ["locate", "connect", "evaluate"];
    public static readonly string[] Forms = ["A", "B"];
    public static readonly string[] Langs = ["kk", "ru"];

    private static readonly Lazy<Dictionary<string, Dictionary<string, DiagnosticFormContent>>> All = new(Load);

    public static DiagnosticFormContent? Get(string form, string lang) =>
        All.Value.TryGetValue(form, out var byLang) && byLang.TryGetValue(lang, out var f) ? f : null;

    /// <summary>Форма входной диагностики: A или B, постоянно для ученика (по id). Итоговая — другая.</summary>
    public static string PreFormFor(Guid studentId) => (studentId.ToByteArray()[0] & 1) == 0 ? "A" : "B";

    public static string Other(string form) => form == "A" ? "B" : "A";

    /// <summary>null — ответы не подходят к форме (не 6 штук или вариант вне диапазона).</summary>
    public static DiagnosticScore? Score(string form, string lang, IReadOnlyList<int> answers)
    {
        var content = Get(form, lang);
        if (content is null) return null;
        var tasks = content.Texts.SelectMany(t => t.Tasks).ToList();
        if (answers.Count != tasks.Count) return null;
        var skills = new int[Skills.Length];
        var total = 0;
        for (var i = 0; i < tasks.Count; i++)
        {
            if (answers[i] < 0 || answers[i] >= tasks[i].Options.Length) return null;
            if (answers[i] != tasks[i].Answer) continue;
            total++;
            skills[Array.IndexOf(Skills, tasks[i].Skill)]++;
        }
        return new DiagnosticScore(total, skills);
    }

    private static Dictionary<string, Dictionary<string, DiagnosticFormContent>> Load()
    {
        using var stream = typeof(DiagnosticForms).Assembly.GetManifestResourceStream("SuraqQoi.Api.Data.Diagnostics.forms.json")
            ?? throw new InvalidOperationException("forms.json не встроен в сборку");
        using var doc = JsonDocument.Parse(stream);
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        return doc.RootElement.GetProperty("forms").Deserialize<Dictionary<string, Dictionary<string, DiagnosticFormContent>>>(options)!;
    }
}
