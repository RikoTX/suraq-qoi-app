using System.Net;
using SuraqQoi.Api.Features.Sessions;

namespace SuraqQoi.Tests.Integration;

/// <summary>
/// Повторная отправка сессий из очереди устройства (ТЗ, 7.1, критерий приёмки 7): не создаёт дублей,
/// не меняет уже принятое и оценённое, неоценённое дооценивает. Настоящий API и PostgreSQL.
/// </summary>
[Collection(ApiCollection.Name)]
[Trait("Category", "Integration")]
public sealed class SessionResendTests(ApiFactory factory) : IAsyncLifetime
{
    private readonly TestApi _api = new(factory);

    public Task InitializeAsync()
    {
        factory.Grader.Available = true;
        factory.Grader.Level = 3;
        return Task.CompletedTask;
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Same_batch_twice_changes_nothing_and_does_not_call_AI_again()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Айгерим");
        var session = TestApi.Session(c.TextId);

        var (first, firstBody) = await _api.UploadAsync(token, session);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var before = await _api.SnapshotAsync(session.Id);
        var calls = factory.Grader.Calls;

        var (second, secondBody) = await _api.UploadAsync(token, session);

        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(before, await _api.SnapshotAsync(session.Id));
        Assert.Equal(calls, factory.Grader.Calls);
        Assert.Equal(firstBody!.Sessions, secondBody!.Sessions);
        Assert.Equal(firstBody.Graded.OrderBy(g => g.QuestionId), secondBody.Graded.OrderBy(g => g.QuestionId));
        Assert.Equal(firstBody.Student, secondBody.Student);
        Assert.Empty(secondBody.Rejected);
    }

    [Fact]
    public async Task Resend_with_changed_content_keeps_what_was_received_first()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Ерлан");
        var session = TestApi.Session(c.TextId);
        await _api.UploadAsync(token, session);
        var before = await _api.SnapshotAsync(session.Id);

        var edited = session with
        {
            Conclusion = "Совсем другой вывод",
            Questions = session.Questions.Select(q => q with { Body = "Подменённый вопрос про автобус и расписание?" }).ToList(),
        };
        var (res, body) = await _api.UploadAsync(token, edited);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(before, await _api.SnapshotAsync(session.Id));
        Assert.Contains(body!.Sessions, s => s.Id == session.Id);
    }

    [Fact]
    public async Task Teacher_grade_survives_resend()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Дана");
        var session = TestApi.Session(c.TextId);
        await _api.UploadAsync(token, session);

        var questionId = session.Questions[0].Id;
        var patch = await _api.SendAsync(HttpMethod.Patch, $"/api/questions/{questionId}", new { levelTeacher = 4 }, c.TeacherToken);
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var before = await _api.SnapshotAsync(session.Id);

        var (_, body) = await _api.UploadAsync(token, session);

        Assert.Equal(before, await _api.SnapshotAsync(session.Id));
        var graded = Assert.Single(body!.Graded, g => g.QuestionId == questionId);
        Assert.Equal(4, graded.Level);
        Assert.True(graded.ByTeacher);
    }

    [Fact]
    public async Task Ungraded_session_is_graded_on_resend_then_left_alone()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Тимур");
        var session = TestApi.Session(c.TextId);

        factory.Grader.Available = false; // ИИ не ответил — сессия принята, но ждёт оценки
        var (_, first) = await _api.UploadAsync(token, session);
        Assert.True(Assert.Single(first!.Sessions).Pending);
        Assert.Empty(first.Graded);

        factory.Grader.Available = true; // устройство отправляет её снова — сервер дооценивает
        var (_, second) = await _api.UploadAsync(token, session);
        Assert.False(Assert.Single(second!.Sessions).Pending);
        Assert.Equal(3, second.Graded.Count);
        Assert.All(second.Graded, g => Assert.Equal(3, g.Level));
        var graded = await _api.SnapshotAsync(session.Id);
        var calls = factory.Grader.Calls;

        factory.Grader.Level = 1; // «ИИ» теперь оценил бы иначе — но оценённое не трогаем
        await _api.UploadAsync(token, session);
        Assert.Equal(graded, await _api.SnapshotAsync(session.Id));
        Assert.Equal(calls, factory.Grader.Calls);
    }

    [Fact]
    public async Task Another_students_session_id_is_rejected_and_left_untouched()
    {
        var c = await _api.CreateClassroomAsync();
        var owner = await _api.AddStudentAsync(c, "Асель");
        var other = await _api.AddStudentAsync(c, "Камила");
        var session = TestApi.Session(c.TextId);
        await _api.UploadAsync(owner, session);
        var before = await _api.SnapshotAsync(session.Id);

        var (res, body) = await _api.UploadAsync(other, session);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal([session.Id], body!.Rejected);
        Assert.Empty(body.Sessions);
        Assert.Equal(before, await _api.SnapshotAsync(session.Id));
    }

    [Fact]
    public async Task Same_session_twice_in_one_batch_is_stored_once()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Арман");
        var session = TestApi.Session(c.TextId);

        var (res, body) = await _api.UploadAsync(token, session, session);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Single(body!.Sessions);
        Assert.Equal(1, await _api.CountAsync(db => db.Sessions.Where(s => s.Id == session.Id)));
        Assert.Equal(3, await _api.CountAsync(db => db.Questions.Where(q => q.SessionId == session.Id)));
    }

    [Fact]
    public async Task New_session_reusing_taken_question_ids_is_rejected()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Санжар");
        var session = TestApi.Session(c.TextId);
        await _api.UploadAsync(token, session);

        var copy = session with { Id = Guid.NewGuid() }; // те же id вопросов
        var (_, body) = await _api.UploadAsync(token, copy);

        Assert.Equal([copy.Id], body!.Rejected);
        Assert.Equal(0, await _api.CountAsync(db => db.Sessions.Where(s => s.Id == copy.Id)));
    }

    /// <summary>
    /// Телефон не дождался ответа (8 с) и отправил ту же сессию снова, пока сервер ещё обрабатывает первую.
    /// Обе отправки должны закончиться без ошибки сервера и с одной сессией в базе.
    /// </summary>
    [Fact]
    public async Task Concurrent_sends_of_the_same_session_store_it_once()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Мадина");
        var session = TestApi.Session(c.TextId);

        var results = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => _api.UploadAsync(token, session)));

        Assert.All(results, r => Assert.Equal(HttpStatusCode.OK, r.Http.StatusCode));
        Assert.All(results, r => Assert.Empty(r.Body!.Rejected));
        Assert.Equal(1, await _api.CountAsync(db => db.Sessions.Where(s => s.Id == session.Id)));
        Assert.Equal(3, await _api.CountAsync(db => db.Questions.Where(q => q.SessionId == session.Id)));
    }
}
