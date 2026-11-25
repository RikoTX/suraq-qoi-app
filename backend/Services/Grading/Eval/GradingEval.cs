using System.Text;
using System.Text.Json;

namespace SuraqQoi.Api.Services.Grading.Eval;

public sealed record EvalText(string Id, string Lang, string Title, string Body);

/// <summary>Draft — черновой уровень команды; Teacher — уровень учителя из labels.csv (эталон, если есть).</summary>
public sealed record EvalQuestion(string Id, string Text, string Q, int Draft, string Note)
{
    public string Lang => Id[..2];
}

public sealed record EvalDataset(List<EvalText> Texts, List<EvalQuestion> Questions);

/// <summary>Предсказание оценщика: null — оценщик не ответил (таймаут, ошибка, нет ключа).</summary>
public sealed record EvalPrediction(string QuestionId, int? Level, string? Comment);

public sealed record EvalScore(int Total, int Answered, int Exact, int Within1, int[,] Confusion, int[] Unanswered)
{
    public double ExactShare => Total == 0 ? 0 : (double)Exact / Total;
    public double Within1Share => Total == 0 ? 0 : (double)Within1 / Total;
}

/// <summary>
/// Проверка оценки ИИ (ТЗ, 9.4, Q2): набор вопросов с эталонными уровнями и подсчёт совпадений.
/// Неответ оценщика считается несовпадением — так цифра честная для пользователя.
/// </summary>
public static class GradingEval
{
    public const double TargetExact = 0.7;
    public const double TargetWithin1 = 0.9;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static EvalDataset LoadDataset(string path) =>
        JsonSerializer.Deserialize<EvalDataset>(File.ReadAllText(path), Json) ?? throw new InvalidDataException(path);

    /// <summary>Уровни учителя из labels.csv (id → 0–4). Пустые и непонятные ячейки пропускаются.</summary>
    public static Dictionary<string, int> LoadLabels(string path)
    {
        var rows = ParseCsv(File.ReadAllText(path));
        if (rows.Count == 0) return [];
        var header = rows[0];
        var idCol = header.FindIndex(h => h.Trim().Equals("id", StringComparison.OrdinalIgnoreCase));
        var levelCol = header.FindIndex(h => h.Trim().StartsWith("уровень", StringComparison.OrdinalIgnoreCase));
        if (idCol < 0 || levelCol < 0) throw new InvalidDataException($"{path}: нужны столбцы «id» и «уровень_учителя»");
        var labels = new Dictionary<string, int>();
        foreach (var row in rows.Skip(1))
        {
            if (row.Count <= Math.Max(idCol, levelCol)) continue;
            if (int.TryParse(row[levelCol].Trim(), out var level) && level is >= 0 and <= 4) labels[row[idCol].Trim()] = level;
        }
        return labels;
    }

    public static EvalScore Score(IReadOnlyList<(int Expected, int? Predicted)> pairs)
    {
        var confusion = new int[5, 5];
        var unanswered = new int[5];
        int exact = 0, within1 = 0, answered = 0;
        foreach (var (expected, predicted) in pairs)
        {
            if (predicted is not { } p)
            {
                unanswered[expected]++;
                continue;
            }
            answered++;
            confusion[expected, p]++;
            if (p == expected) exact++;
            if (Math.Abs(p - expected) <= 1) within1++;
        }
        return new EvalScore(pairs.Count, answered, exact, within1, confusion, unanswered);
    }

    /// <summary>CSV по RFC 4180: запятая, кавычки, переносы внутри кавычек (так выгружают Excel и Google Sheets).</summary>
    public static List<List<string>> ParseCsv(string text)
    {
        var rows = new List<List<string>>();
        var row = new List<string>();
        var cell = new StringBuilder();
        var quoted = false;
        text = text.TrimStart('﻿');
        var sep = text.Split('\n')[0].Count(c => c == ';') > text.Split('\n')[0].Count(c => c == ',') ? ';' : ',';
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { cell.Append('"'); i++; }
                else if (c == '"') quoted = false;
                else cell.Append(c);
            }
            else if (c == '"') quoted = true;
            else if (c == sep) { row.Add(cell.ToString()); cell.Clear(); }
            else if (c == '\n')
            {
                row.Add(cell.ToString().TrimEnd('\r'));
                cell.Clear();
                if (row.Any(x => x.Length > 0)) rows.Add(row);
                row = [];
            }
            else cell.Append(c);
        }
        row.Add(cell.ToString().TrimEnd('\r'));
        if (row.Any(x => x.Length > 0)) rows.Add(row);
        return rows;
    }
}
