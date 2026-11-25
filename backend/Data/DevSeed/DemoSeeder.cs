using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Data.Diagnostics;
using SuraqQoi.Api.Services.Scoring;

namespace SuraqQoi.Api.Data.DevSeed;

/// <summary>
/// Демо-данные для показа панели учителя (ТЗ, D1): учитель, класс «8А (демо)» из 15 учеников
/// и их сессии за 14 дней — у большинства вопросы постепенно становятся глубже, двое «застряли», один пропал.
/// Мини-диагностика: входная у всех, итоговая — у всех, кроме пропавшего (учитель открыл её классу).
/// Запуск: dotnet run -- seed-demo. Повторный запуск ничего не меняет.
/// Все данные выдуманы и помечены как демо; вход учителя и PIN — в backend/AGENTS.md.
/// </summary>
public static class DemoSeeder
{
    public const string TeacherEmail = "demo-teacher@suraqqoi.kz";
    public const string TeacherPassword = "demo-teacher-2026";
    public const string StudentPin = "1234";
    public const string ClassName = "8А (демо)";
    public const int Days = 14;

    private static readonly string[] Names =
    [
        "Айгерим Б.", "Ерлан", "Дана", "Нурсултан", "Асель", "Тимур", "Камила", "Арман",
        "Жансая", "Данияр", "Алина", "Санжар", "Мадина", "Ильяс", "Томирис",
    ];

    // Вопросы-образцы по уровням — к ним добавляются примеры из самих текстов.
    private static readonly string[][] Generic =
    [
        ["Мне скучно, можно другой текст?", "Какая погода будет завтра?", "Кто сильнее всех в нашем классе?"],
        ["Когда это начинается?", "Сколько всего человек участвует?", "Где это происходит?"],
        ["Почему автор сравнивает эти два варианта?", "Чем условия в начале отличаются от условий в конце?", "Как связаны цена и количество участников?"],
        ["Что будет, если план не сработает?", "Хватит ли им времени, если начать на неделю позже?", "Успеют ли все, если один участник заболеет?"],
        ["Можно ли доверять этим цифрам, если не сказано, откуда они?", "Убедительно ли автор объясняет своё решение?", "Чего не хватает в тексте, чтобы принять решение?"],
    ];

    private static readonly string[] Comments =
    [
        "Этот вопрос не про текст. Перечитай и спроси о том, что в нём написано.",
        "Хорошо: ты нашёл факт в тексте. Ответ лежит на поверхности.",
        "Молодец: чтобы ответить, нужно связать два факта из текста.",
        "Отлично: ответа в тексте нет, нужно сделать вывод самому.",
        "Сильный вопрос: ты оцениваешь сам текст и его надёжность.",
    ];

    private static readonly string[] Hints =
    [
        "Начни с того, что тебя удивило в тексте.",
        "Спроси, почему так получилось.",
        "Спроси, что будет дальше, если что-то изменится.",
        "Подумай, можно ли верить автору и почему.",
        "Спроси, каких данных не хватает для уверенного вывода.",
    ];

    public static async Task<string> RunAsync(AppDbContext db, CancellationToken ct)
    {
        var existing = await db.Users.Where(u => u.Email == TeacherEmail).Select(u => u.Id).SingleOrDefaultAsync(ct);
        if (existing != Guid.Empty)
        {
            var code = await db.Classes.Where(c => c.TeacherId == existing).Select(c => c.JoinCode).FirstOrDefaultAsync(ct);
            return $"Демо-данные уже есть. Учитель: {TeacherEmail} / {TeacherPassword}. Код класса: {code}. PIN учеников: {StudentPin}.";
        }

        var library = await db.Texts.Where(t => t.ClassId == null && t.Lang == "ru").OrderBy(t => t.Difficulty).Take(8).ToListAsync(ct);
        if (library.Count == 0)
            return "В библиотеке нет русских текстов. Сначала запустите API в Development (примеры) или generate-texts --lang ru.";

        var now = DateTimeOffset.UtcNow;
        var rnd = new Random(2026);
        var teacher = new User
        {
            Id = Guid.NewGuid(), Email = TeacherEmail, Name = "Айгуль Сериковна (демо)",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(TeacherPassword), Role = UserRole.Teacher, CreatedAt = now.AddDays(-Days - 1),
        };
        string joinCode;
        do joinCode = $"8A-{RandomNumberGenerator.GetInt32(1000, 10000)}";
        while (await db.Classes.AnyAsync(c => c.JoinCode == joinCode, ct));
        var cls = new SchoolClass { Id = Guid.NewGuid(), TeacherId = teacher.Id, Name = ClassName, JoinCode = joinCode, Lang = "ru", DiagnosticPostOpen = true, CreatedAt = teacher.CreatedAt };
        db.Users.Add(teacher);
        db.Classes.Add(cls);

        var texts = library.Select(s => new ReadingText
        {
            Id = Guid.NewGuid(), ClassId = cls.Id, CreatedById = teacher.Id, Lang = s.Lang, Topic = s.Topic, Kind = s.Kind,
            Difficulty = s.Difficulty, Title = s.Title, Body = s.Body, ExampleQuestions = s.ExampleQuestions, Hints = s.Hints,
            Reviewed = true, UpdatedAt = teacher.CreatedAt,
        }).ToList();
        db.Texts.AddRange(texts);

        var pinHash = BCrypt.Net.BCrypt.HashPassword(StudentPin);
        for (var i = 0; i < Names.Length; i++)
        {
            var user = new User { Id = Guid.NewGuid(), Name = Names[i], PasswordHash = pinHash, Role = UserRole.Student, CreatedAt = teacher.CreatedAt };
            var student = new Student { Id = Guid.NewGuid(), UserId = user.Id, ClassId = cls.Id, CreatedAt = user.CreatedAt };
            db.Users.Add(user);
            db.Students.Add(student);

            // Профиль ученика: стартовый уровень и рост за две недели. 3 и 9 — «застряли», 12 — «пропал».
            var start = 0.9 + rnd.NextDouble() * 0.9;
            var growth = i is 3 or 9 ? 0 : 1.2 + rnd.NextDouble() * 1.3;
            var lastDay = i == 12 ? Days - 9 : Days;
            var sessions = new List<Session>();
            for (var day = 0; day < lastDay; day++)
            {
                if (rnd.NextDouble() < 0.45) continue; // занимаются не каждый день
                var text = texts[rnd.Next(texts.Count)];
                var finished = now.AddDays(-(Days - 1 - day)).Date.AddHours(9 + rnd.Next(8)).AddMinutes(rnd.Next(60));
                var session = new Session
                {
                    Id = Guid.NewGuid(), StudentId = student.Id, TextId = text.Id,
                    StartedAt = new DateTimeOffset(finished.AddMinutes(-7), TimeSpan.Zero),
                    FinishedAt = new DateTimeOffset(finished, TimeSpan.Zero), ReceivedAt = new DateTimeOffset(finished, TimeSpan.Zero),
                };
                var examples = JsonSerializer.Deserialize<Dictionary<string, string>>(text.ExampleQuestions) ?? [];
                var mean = Math.Min(start + growth * day / Days, i is 3 or 9 ? 1.4 : 4);
                var used = new HashSet<string>();
                for (short pos = 1; pos <= 3; pos++)
                {
                    var level = Math.Clamp((int)Math.Round(mean + (rnd.NextDouble() - 0.5) * 1.6), 0, 4);
                    var pool = Generic[level].ToList();
                    if (examples.TryGetValue(level.ToString(), out var ex)) pool.Add(ex);
                    var body = pool.Where(used.Add).OrderBy(_ => rnd.Next()).FirstOrDefault() ?? pool[0];
                    session.Questions.Add(new Question
                    {
                        Id = Guid.NewGuid(), Position = pos, Body = body, LevelLocal = (short)Math.Min(level, 2), LevelAi = (short)level,
                        AiComment = Comments[level], AiHint = Hints[level], CreatedAt = session.StartedAt.AddMinutes(pos * 2),
                    });
                }
                session.Conclusion = "Главное в тексте — люди договариваются и считают, хватит ли времени и денег.";
                session.ConclusionScore = (short)Math.Clamp((int)Math.Round(5 + mean * 3.5), 0, 20);
                session.ConclusionComment = "Хорошо: ты своими словами передал главную мысль.";
                sessions.Add(session);
            }
            db.Sessions.AddRange(sessions);

            // Диагностика: вероятность верного ответа по навыкам [найти, связать, оценить] растёт вместе с вопросами.
            // Свой генератор: история сессий остаётся той же, что и без диагностики.
            var drnd = new Random(100 + i);
            var preForm = DiagnosticForms.PreFormFor(student.Id);
            var stuck = i is 3 or 9;
            db.Diagnostics.Add(DemoDiagnostic(drnd, student.Id, "pre", preForm, start, 0, teacher.CreatedAt.AddHours(20)));
            if (i != 12)
                db.Diagnostics.Add(DemoDiagnostic(drnd, student.Id, "post", DiagnosticForms.Other(preForm), start, stuck ? 0.2 : growth, now.AddHours(-3 - drnd.Next(20))));
            PointsCalculator.Recalculate(student, sessions, now);
        }

        await db.SaveChangesAsync(ct);
        return $"Готово. Учитель: {TeacherEmail} / {TeacherPassword}. Класс {ClassName}, код {joinCode}, 15 учеников, PIN {StudentPin}.";
    }

    private static Diagnostic DemoDiagnostic(Random rnd, Guid studentId, string kind, string form, double start, double growth, DateTimeOffset takenAt)
    {
        double[] baseP = [0.75, 0.5, 0.25];
        double[] gain = [0.05, 0.12, 0.14];
        var tasks = DiagnosticForms.Get(form, "ru")!.Texts.SelectMany(t => t.Tasks).ToList();
        var answers = tasks.Select(t =>
        {
            var k = Array.IndexOf(DiagnosticForms.Skills, t.Skill);
            var p = Math.Clamp(baseP[k] + (start - 0.9) * 0.15 + growth * gain[k], 0.05, 0.95);
            return rnd.NextDouble() < p ? t.Answer : (t.Answer + 1 + rnd.Next(t.Options.Length - 1)) % t.Options.Length;
        }).ToArray();
        return new Diagnostic
        {
            Id = Guid.NewGuid(), StudentId = studentId, Kind = kind, Form = form, Lang = "ru",
            Answers = JsonSerializer.Serialize(answers), Score = (short)DiagnosticForms.Score(form, "ru", answers)!.Total,
            StartedAt = takenAt.AddMinutes(-8), TakenAt = takenAt, ReceivedAt = takenAt,
        };
    }
}
