using System.Text;

namespace SuraqQoi.Api.Services.Grading;

/// <summary>
/// Предварительная оценка вопроса правилами — когда ответа ИИ нет (ТЗ, 9.3).
/// Тот же алгоритм — во frontend/src/scoring/heuristic.ts; меняете здесь — меняйте и там.
/// Намеренно осторожна: не выше уровня 2. Уровни 3–4 ставит только ИИ или учитель,
/// иначе «Можно ли доверять…?» без опоры на текст давало бы 50 очков.
/// </summary>
public static class HeuristicGrader
{
    public const int MaxLevel = 2;
    public const int MinWords = 4;
    public const int StemLength = 5;

    // Маркеры: слова через пробел; «*» в конце слова — сравнение по началу, без «*» — слово целиком.
    private static readonly string[][] Level2 = Compile(
        // ru
        "почему", "зачем", "отчего", "чем отлича*", "как связ*", "что будет", "если", "как дума*", "что было бы",
        "можно ли довер*", "прав* ли", "докаж*", "достоверн*", "убедительн*",
        // kk
        "неліктен", "неге", "не үшін", "айырмашылығы", "айырмашылық*", "егер", "қалай ойлайс*", "не болар еді",
        "сенуге бола ма", "дұрыс па", "дәлелде*", "сенімді*");

    /// <summary>Уровень вопроса 0–2. previous — предыдущие вопросы этой же сессии.</summary>
    public static int Level(string question, string text, IEnumerable<string> previous)
    {
        var words = Words(question);
        if (words.Count < MinWords) return 0;
        var norm = string.Join(' ', words);
        if (previous.Any(p => string.Join(' ', Words(p)) == norm)) return 0;

        var overlap = Overlap(words, text);
        if (overlap == 0) return 0;

        // Маркер уровня 2 засчитывается, только если вопрос опирается на текст (≥ 2 слова из него).
        // Остальное (кто, где, когда, сколько… или без маркеров) — уровень 1.
        if (Level2.Any(m => Contains(words, m))) return overlap >= 2 ? 2 : 1;
        return 1;
    }

    /// <summary>Предварительная оценка вывода 0–10 (ИИ ставит до 20).</summary>
    public static int ConclusionScore(string? conclusion, string text)
    {
        var words = Words(conclusion ?? "");
        var overlap = Overlap(words, text);
        if (words.Count >= 15 && overlap >= 3) return 10;
        if (words.Count >= 6 && overlap >= 1) return 5;
        return 0;
    }

    /// <summary>Сколько разных «основ» (первые 5 букв слов длиной ≥ 4) вопроса есть в тексте.</summary>
    public static int Overlap(IReadOnlyList<string> words, string text)
    {
        var textStems = Words(text).Where(w => w.Length >= 4).Select(Stem).ToHashSet();
        return words.Where(w => w.Length >= 4).Select(Stem).Distinct().Count(textStems.Contains);
    }

    private static string Stem(string w) => w.Length > StemLength ? w[..StemLength] : w;

    /// <summary>Нижний регистр, только буквы и цифры, ё → е.</summary>
    public static List<string> Words(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s.ToLowerInvariant())
            sb.Append(char.IsLetterOrDigit(ch) ? (ch == 'ё' ? 'е' : ch) : ' ');
        return sb.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();
    }

    private static bool Contains(List<string> words, string[] marker)
    {
        for (var i = 0; i + marker.Length <= words.Count; i++)
        {
            var ok = true;
            for (var j = 0; j < marker.Length && ok; j++) ok = Matches(words[i + j], marker[j]);
            if (ok) return true;
        }
        return false;
    }

    private static bool Matches(string word, string pattern) =>
        pattern.EndsWith('*') ? word.StartsWith(pattern[..^1], StringComparison.Ordinal) : word == pattern;

    private static string[][] Compile(params string[] markers) =>
        markers.Select(m => m.Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToArray();
}
