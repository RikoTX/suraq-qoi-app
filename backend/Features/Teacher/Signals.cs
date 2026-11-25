namespace SuraqQoi.Api.Features.Teacher;

/// <summary>
/// Сигналы учителю (ТЗ, 11): inactive — «пропал», stuck — «застрял», rising — «растёт»; null — ничего особенного.
/// </summary>
public static class Signals
{
    public const int InactiveDays = 7;
    public const int StuckSessions = 5;
    public const double RisingDelta = 0.2;

    /// <param name="today">сегодня по Asia/Almaty</param>
    /// <param name="lastActive">последний день с сессией; null — сессий не было</param>
    /// <param name="joined">день, когда ученик появился в системе</param>
    /// <param name="sessions14">сессий за 14 дней</param>
    /// <param name="deep14">был ли за 14 дней хоть один вопрос уровня 3–4</param>
    /// <param name="graded7">оценённых вопросов за 7 дней</param>
    /// <param name="depth7">доля уровней 3–4 за 7 дней</param>
    /// <param name="depthPrev7">то же за предыдущие 7 дней; null — вопросов не было</param>
    public static string? Of(DateOnly today, DateOnly? lastActive, DateOnly joined,
        int sessions14, bool deep14, int graded7, double depth7, double? depthPrev7)
    {
        // «Пропал» — нет сессий 7 дней. Новенький без сессий считается от дня прихода: первую неделю он не «пропал».
        if ((lastActive ?? joined) < today.AddDays(-InactiveDays)) return "inactive";
        if (lastActive is null) return null;
        if (sessions14 >= StuckSessions && !deep14) return "stuck";
        if (depthPrev7 is not null && graded7 > 0 && depth7 - depthPrev7 >= RisingDelta) return "rising";
        return null;
    }
}
