using SuraqQoi.Api.Data;

namespace SuraqQoi.Api.Services.Scoring;

/// <summary>Очки, ранги, стрик (ТЗ, раздел 10). Чистые функции — покрыты тестами.</summary>
public static class PointsCalculator
{
    /// <summary>Очки за уровень вопроса 0–4.</summary>
    public static readonly int[] LevelPoints = [0, 10, 20, 30, 50];
    public const int MaxConclusionScore = 20;

    public static readonly (string Code, int From)[] Ranks =
    [
        ("novice", 0), ("sleuth", 200), ("detective", 600), ("professor", 1500), ("master", 3000),
    ];

    public static readonly TimeZoneInfo Almaty = FindAlmaty();

    /// <summary>Итоговый уровень: учитель важнее ИИ. null — вопрос ещё не оценён ни тем, ни другим.</summary>
    public static int? FinalLevel(Question q) => q.LevelTeacher ?? q.LevelAi;

    /// <summary>
    /// Сессия «предварительная», пока хоть один вопрос или вывод не оценён ИИ/учителем.
    /// Её очки не входят в очки ученика и ранг — так после проверки ИИ очки никогда не отнимаются.
    /// </summary>
    public static bool IsPending(Session s) =>
        s.Questions.Any(q => FinalLevel(q) is null)
        || (!string.IsNullOrWhiteSpace(s.Conclusion) && s.ConclusionScore is null);

    /// <summary>Очки сессии по итоговым уровням; 0, пока сессия предварительная.</summary>
    public static int SessionPoints(Session s) =>
        IsPending(s) ? 0 : s.Questions.Sum(q => Points(FinalLevel(q)!.Value)) + Math.Clamp((int)(s.ConclusionScore ?? 0), 0, MaxConclusionScore);

    public static int Points(int level) => LevelPoints[Math.Clamp(level, 0, LevelPoints.Length - 1)];

    public static string Rank(int points) => Ranks.Last(r => points >= r.From).Code;

    /// <summary>Следующий ранг и сколько до него очков; null — уже высший.</summary>
    public static (string Code, int From)? NextRank(int points) =>
        Ranks.Where(r => r.From > points).Select(r => ((string, int)?)r).FirstOrDefault();

    /// <summary>
    /// Стрик: подряд идущие календарные дни (Asia/Almaty) с завершённой сессией, по последний активный день.
    /// Если последний активный день раньше вчерашнего — серия прервалась, стрик 0.
    /// </summary>
    public static int Streak(IEnumerable<DateOnly> activeDays, DateOnly today)
    {
        var days = activeDays.ToHashSet();
        if (days.Count == 0) return 0;
        var last = days.Max();
        if (last < today.AddDays(-1)) return 0;
        var streak = 0;
        for (var d = last; days.Contains(d); d = d.AddDays(-1)) streak++;
        return streak;
    }

    public static DateOnly LocalDate(DateTimeOffset t) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(t, Almaty).DateTime);

    /// <summary>Пересчитать очки, стрик и последний активный день ученика по его сессиям.</summary>
    public static void Recalculate(Student student, IReadOnlyCollection<Session> sessions, DateTimeOffset now)
    {
        foreach (var s in sessions) s.Points = SessionPoints(s);
        student.Points = sessions.Sum(s => s.Points);
        var days = sessions.Where(s => s.FinishedAt is not null).Select(s => LocalDate(s.FinishedAt!.Value)).ToList();
        student.Streak = Streak(days, LocalDate(now));
        student.LastActiveDate = days.Count > 0 ? days.Max() : null;
    }

    private static TimeZoneInfo FindAlmaty()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Almaty"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.CreateCustomTimeZone("Asia/Almaty", TimeSpan.FromHours(5), "Almaty", "Almaty"); }
    }
}
