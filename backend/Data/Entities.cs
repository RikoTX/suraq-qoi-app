namespace SuraqQoi.Api.Data;

// Таблицы из docs/TZ.md, раздел 6. Колонки в БД — snake_case.

public enum UserRole
{
    Student,
    Teacher,
    Admin,
}

/// <summary>Учётная запись. Роль определяет, что пользователь видит и может делать.</summary>
public sealed class User
{
    public Guid Id { get; set; }
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }
    public required string Name { get; set; }
    public UserRole Role { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public List<SchoolClass> Classes { get; set; } = []; // для учителя
}

public sealed class SchoolClass
{
    public Guid Id { get; set; }
    public Guid TeacherId { get; set; }
    public required string Name { get; set; }
    public required string JoinCode { get; set; }
    public required string Lang { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public User? Teacher { get; set; }
    public List<Student> Students { get; set; } = [];
}

/// <summary>Профиль ученика: класс и игровой прогресс. Один к одному с User (роль Student).</summary>
public sealed class Student
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? ClassId { get; set; } // заполняется на этапе 2, когда ученик вступает в класс
    public string[] Interests { get; set; } = [];
    public int Points { get; set; }
    public int Streak { get; set; }
    public DateOnly? LastActiveDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public User? User { get; set; }
    public SchoolClass? Class { get; set; }
    public List<Session> Sessions { get; set; } = [];
}

/// <summary>
/// Текст для чтения. ClassId = null — общая библиотека (шаблоны, сгенерированные командой generate-texts);
/// иначе — текст класса, за который отвечает учитель. Reviewed = опубликован для учеников класса.
/// </summary>
public sealed class ReadingText
{
    public Guid Id { get; set; }
    public Guid? ClassId { get; set; }
    public Guid? CreatedById { get; set; }
    public required string Lang { get; set; }
    public required string Topic { get; set; }
    public required string Kind { get; set; }
    public short Difficulty { get; set; }
    public required string Title { get; set; }
    public required string Body { get; set; }
    public required string ExampleQuestions { get; set; } // jsonb
    public required string Hints { get; set; }            // jsonb
    public bool Reviewed { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }

    public SchoolClass? Class { get; set; }
}

public sealed class Session
{
    public Guid Id { get; set; } // генерирует клиент
    public Guid StudentId { get; set; }
    public Guid TextId { get; set; }
    public string? Conclusion { get; set; }
    public short? ConclusionScore { get; set; }
    public int Points { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }

    public Student? Student { get; set; }
    public ReadingText? Text { get; set; }
    public List<Question> Questions { get; set; } = [];
}

public sealed class Question
{
    public Guid Id { get; set; } // генерирует клиент
    public Guid SessionId { get; set; }
    public short Position { get; set; }
    public required string Body { get; set; }
    public short? LevelLocal { get; set; }
    public short? LevelAi { get; set; }
    public string? AiComment { get; set; }
    public string? AiHint { get; set; }
    public short? LevelTeacher { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Session? Session { get; set; }
}
