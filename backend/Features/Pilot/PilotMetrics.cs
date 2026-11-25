namespace SuraqQoi.Api.Features.Pilot;

/// <summary>Сессия ученика для отчёта: итоговые уровни оценённых вопросов (учитель ?? ИИ) и сколько ещё не оценено.</summary>
public sealed record PilotSession(DateTimeOffset FinishedAt, int[] Levels, int Pending);

public sealed record PilotStudent(string Name, IReadOnlyList<PilotSession> Sessions, int? Pre, int? Post, int[]? PreSkills, int[]? PostSkills);

/// <summary>«Рост глубины» одного ученика: первые K сессий против последних K.</summary>
public sealed record DepthChange(string Name, int Sessions, int Window, double EarlyDepth, double LateDepth, double EarlyLevel, double LateLevel);

public sealed record PilotSummary(
    int Students, int Active, int Sessions, int GradedQuestions, int PendingQuestions, int[] LevelCounts,
    IReadOnlyList<DepthChange> Depth, int DepthUp, int DepthSame, int DepthDown,
    double? EarlyDepthPooled, double? LateDepthPooled,
    int Paired, double? PreAvg, double? PostAvg, double[]? PreSkills, double[]? PostSkills, int PostUp, int PostSame, int PostDown);

/// <summary>
/// Цифры пилота (ТЗ, 11 и 11.1). «Рост глубины» — доля вопросов уровней 3–4 в первых K сессиях ученика
/// против последних K, где K = min(3, сессий / 2): на пилоте из 3–4 сессий это первая (две) против последней (двух).
/// Учитываются только оценённые вопросы. Диагностика — только ученики, прошедшие обе проверки.
/// </summary>
public static class PilotMetrics
{
    public const int MaxWindow = 3;

    public static PilotSummary Compute(IReadOnlyList<PilotStudent> students)
    {
        var levels = new int[5];
        foreach (var l in students.SelectMany(s => s.Sessions).SelectMany(s => s.Levels)) levels[l]++;

        var depth = new List<DepthChange>();
        int earlyDeep = 0, earlyAll = 0, lateDeep = 0, lateAll = 0;
        foreach (var s in students)
        {
            var graded = s.Sessions.Where(x => x.Levels.Length > 0).OrderBy(x => x.FinishedAt).ToList();
            var k = Math.Min(MaxWindow, graded.Count / 2);
            if (k == 0) continue;
            var early = graded.Take(k).SelectMany(x => x.Levels).ToList();
            var late = graded.Skip(graded.Count - k).SelectMany(x => x.Levels).ToList();
            depth.Add(new DepthChange(s.Name, graded.Count, k, Share(early), Share(late), early.Average(), late.Average()));
            earlyDeep += early.Count(l => l >= 3);
            earlyAll += early.Count;
            lateDeep += late.Count(l => l >= 3);
            lateAll += late.Count;
        }

        var paired = students.Where(s => s.Pre is not null && s.Post is not null).ToList();
        double[]? SkillAvg(Func<PilotStudent, int[]?> pick)
        {
            var rows = paired.Select(pick).Where(x => x is not null).ToList();
            return rows.Count == 0 ? null : Enumerable.Range(0, 3).Select(i => Math.Round(rows.Average(r => (double)r![i]), 2)).ToArray();
        }

        return new PilotSummary(
            students.Count,
            students.Count(s => s.Sessions.Count > 0),
            students.Sum(s => s.Sessions.Count),
            levels.Sum(),
            students.SelectMany(s => s.Sessions).Sum(x => x.Pending),
            levels,
            depth,
            depth.Count(d => d.LateDepth > d.EarlyDepth + 1e-9),
            depth.Count(d => Math.Abs(d.LateDepth - d.EarlyDepth) <= 1e-9),
            depth.Count(d => d.LateDepth < d.EarlyDepth - 1e-9),
            earlyAll == 0 ? null : (double)earlyDeep / earlyAll,
            lateAll == 0 ? null : (double)lateDeep / lateAll,
            paired.Count,
            paired.Count == 0 ? null : Math.Round(paired.Average(s => s.Pre!.Value), 2),
            paired.Count == 0 ? null : Math.Round(paired.Average(s => s.Post!.Value), 2),
            SkillAvg(s => s.PreSkills),
            SkillAvg(s => s.PostSkills),
            paired.Count(s => s.Post > s.Pre),
            paired.Count(s => s.Post == s.Pre),
            paired.Count(s => s.Post < s.Pre));
    }

    private static double Share(IReadOnlyCollection<int> levels) => levels.Count == 0 ? 0 : (double)levels.Count(l => l >= 3) / levels.Count;
}
