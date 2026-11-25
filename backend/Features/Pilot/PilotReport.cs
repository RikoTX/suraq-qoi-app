using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Data.Diagnostics;
using SuraqQoi.Api.Features.Classes;
using SuraqQoi.Api.Services.Scoring;

namespace SuraqQoi.Api.Features.Pilot;

/// <summary>
/// Отчёт по пилоту для слайдов (ТЗ, 11): dotnet run -- pilot-report 8A-1234 [--since 2026-11-26] [--names].
/// Печатает markdown. Имена учеников по умолчанию скрыты («Ученик 1»): отчёт уходит в презентацию.
/// </summary>
public static class PilotReport
{
    private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");

    public static async Task<(int Code, string Text)> RunAsync(AppDbContext db, string[] args, CancellationToken ct)
    {
        var code = ClassEndpoints.NormalizeCode(args.ElementAtOrDefault(1) ?? "");
        var names = args.Contains("--names");
        var sinceArg = args.SkipWhile(a => a != "--since").Skip(1).FirstOrDefault();
        DateOnly? since = null;
        if (sinceArg is not null)
        {
            if (!DateOnly.TryParseExact(sinceArg, "yyyy-MM-dd", out var d)) return (1, "--since: дата в формате 2026-11-26");
            since = d;
        }

        var cls = await db.Classes.AsNoTracking().SingleOrDefaultAsync(c => c.JoinCode == code, ct);
        if (cls is null) return (1, $"Класс с кодом «{code}» не найден. Пример: dotnet run -- pilot-report 8A-1234");

        var students = await db.Students.AsNoTracking().Where(s => s.ClassId == cls.Id)
            .Select(s => new { s.Id, s.User!.Name }).OrderBy(s => s.Name).ToListAsync(ct);
        var ids = students.Select(s => s.Id).ToList();
        var sessions = await db.Sessions.AsNoTracking().Where(s => ids.Contains(s.StudentId) && s.FinishedAt != null)
            .Include(s => s.Questions).ToListAsync(ct);
        if (since is { } from) sessions = sessions.Where(s => PointsCalculator.LocalDate(s.FinishedAt!.Value) >= from).ToList();
        var diagnostics = await db.Diagnostics.AsNoTracking().Where(d => ids.Contains(d.StudentId)).ToListAsync(ct);

        var rows = students.Select((s, i) =>
        {
            DiagnosticScore? Diag(string kind) => diagnostics.FirstOrDefault(d => d.StudentId == s.Id && d.Kind == kind) is { } d
                ? DiagnosticForms.Score(d.Form, d.Lang, JsonSerializer.Deserialize<int[]>(d.Answers) ?? [])
                : null;
            var pre = Diag("pre");
            var post = Diag("post");
            var mine = sessions.Where(x => x.StudentId == s.Id).Select(x => new PilotSession(
                x.FinishedAt!.Value,
                x.Questions.Select(PointsCalculator.FinalLevel).Where(l => l is not null).Select(l => l!.Value).ToArray(),
                x.Questions.Count(q => PointsCalculator.FinalLevel(q) is null))).ToList();
            return new PilotStudent(names ? s.Name : $"Ученик {i + 1}", mine, pre?.Total, post?.Total, pre?.Skills, post?.Skills);
        }).ToList();

        return (0, Render(cls, since, sessions.Select(x => x.FinishedAt!.Value).ToList(), rows, PilotMetrics.Compute(rows)));
    }

    private static string Render(SchoolClass cls, DateOnly? since, List<DateTimeOffset> times, List<PilotStudent> rows, PilotSummary m)
    {
        var sb = new StringBuilder();
        string Pct(double? x) => x is null ? "—" : $"{Math.Round(x.Value * 100)}%";
        string Num(double? x) => x is null ? "—" : x.Value.ToString("0.0", Ru);
        string Day(DateTimeOffset t) => PointsCalculator.LocalDate(t).ToString("d MMMM", Ru);

        sb.AppendLine($"# Пилот: класс {cls.Name} ({cls.JoinCode}, {(cls.Lang == "kk" ? "казахский" : "русский")})");
        sb.AppendLine();
        sb.AppendLine($"Отчёт от {DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(5)).ToString("d MMMM yyyy, HH:mm", Ru)} (Алматы)"
            + (times.Count > 0 ? $". Сессии: {Day(times.Min())} — {Day(times.Max())}" : "")
            + (since is null ? "" : $", с {since:yyyy-MM-dd}") + ".");
        if (cls.Name.Contains("(демо)"))
            sb.AppendLine().AppendLine("> ⚠️ Это демо-класс с синтетическими данными. Его цифры нельзя выдавать за результаты пилота.");
        sb.AppendLine().AppendLine("Небольшая группа за короткое время: это пилот, а не исследование. На слайде указываем число учеников.");

        sb.AppendLine().AppendLine("## Участие").AppendLine();
        sb.AppendLine($"- Учеников в классе: {m.Students}, занимались: {m.Active}");
        sb.AppendLine($"- Сессий: {m.Sessions}" + (m.Active > 0 ? $" (в среднем {Num((double)m.Sessions / m.Active)} на ученика)" : ""));
        sb.AppendLine($"- Вопросов оценено: {m.GradedQuestions}" + (m.PendingQuestions > 0
            ? $". ⚠️ Ещё не оценено ИИ: {m.PendingQuestions} — откройте приложение на телефонах учеников с интернетом и пересоберите отчёт"
            : ""));
        if (m.GradedQuestions > 0)
        {
            string[] names = ["не по тексту", "найти", "связать", "вывести", "оценить"];
            sb.AppendLine("- По уровням: " + string.Join(", ", m.LevelCounts.Select((n, l) => $"{l} {names[l]} — {n} ({Pct((double)n / m.GradedQuestions)})")));
        }

        sb.AppendLine().AppendLine("## Рост глубины вопросов").AppendLine();
        sb.AppendLine($"Доля вопросов «вывести» и «оценить» (уровни 3–4) в первых сессиях ученика и в последних. Окно — до {PilotMetrics.MaxWindow} сессий, но не больше половины.");
        sb.AppendLine();
        if (m.Depth.Count == 0) sb.AppendLine("Пока нет учеников с двумя и более оценёнными сессиями.");
        else
        {
            sb.AppendLine($"- **Все вопросы вместе: {Pct(m.EarlyDepthPooled)} → {Pct(m.LateDepthPooled)}** ({m.Depth.Count} уч.)");
            sb.AppendLine($"- Глубина выросла у {m.DepthUp}, не изменилась у {m.DepthSame}, снизилась у {m.DepthDown}");
            sb.AppendLine().AppendLine("| Ученик | Сессий | Окно | Глубина: начало → конец | Средний уровень: начало → конец |");
            sb.AppendLine("|---|---|---|---|---|");
            foreach (var d in m.Depth)
                sb.AppendLine($"| {d.Name} | {d.Sessions} | {d.Window} | {Pct(d.EarlyDepth)} → {Pct(d.LateDepth)} | {Num(d.EarlyLevel)} → {Num(d.LateLevel)} |");
        }

        sb.AppendLine().AppendLine("## Мини-диагностика (6 заданий формата PISA)").AppendLine();
        var preOnly = rows.Count(r => r.Pre is not null && r.Post is null);
        if (m.Paired == 0) sb.AppendLine($"Обе проверки ещё никто не прошёл. Только входную: {preOnly}.");
        else
        {
            sb.AppendLine($"- **Прошли обе: {m.Paired}. Средний балл: {Num(m.PreAvg)} → {Num(m.PostAvg)} из 6**");
            sb.AppendLine($"- Балл выше у {m.PostUp}, такой же у {m.PostSame}, ниже у {m.PostDown}");
            if (m.PreSkills is { } a && m.PostSkills is { } b)
                sb.AppendLine($"- По навыкам (из 2): найти {Num(a[0])} → {Num(b[0])}, связать {Num(a[1])} → {Num(b[1])}, оценить {Num(a[2])} → {Num(b[2])}");
            if (preOnly > 0) sb.AppendLine($"- Только входную: {preOnly}");
        }
        sb.AppendLine().AppendLine("За один день балл диагностики может не вырасти — поэтому на слайде и диагностика, и рост глубины вопросов (ТЗ, 11.1).");

        sb.AppendLine().AppendLine("## Для слайда").AppendLine();
        if (m.Depth.Count > 0)
            sb.AppendLine($"- «У {m.Depth.Count} школьников доля глубоких вопросов к тексту: {Pct(m.EarlyDepthPooled)} в первых сессиях → {Pct(m.LateDepthPooled)} в последних»");
        if (m.Paired > 0)
            sb.AppendLine($"- «Мини-диагностика по формату PISA: {Num(m.PreAvg)} → {Num(m.PostAvg)} из 6 ({m.Paired} учеников)»");
        sb.AppendLine($"- «{m.Active} учеников, {m.Sessions} сессий, {m.GradedQuestions} оценённых вопросов»");
        return sb.ToString();
    }
}
