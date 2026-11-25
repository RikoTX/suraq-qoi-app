using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SuraqQoi.Api.Auth;
using SuraqQoi.Api.Data;
using SuraqQoi.Api.Features.Classes;
using SuraqQoi.Api.Features.Sessions;
using SuraqQoi.Api.Features.Texts;

namespace SuraqQoi.Tests.Integration;

/// <summary>Сценарии через настоящий HTTP: учитель, класс, опубликованный текст, ученики.</summary>
public sealed class TestApi(ApiFactory factory)
{
    public const string TextBody =
        "С 1 декабря автобус № 12 ходит по новому расписанию. Утренний рейс продлён до школы. " +
        "Вечерний рейс отменён из-за ремонта дороги. Проезд стоит 100 тенге.";

    private readonly HttpClient _http = factory.CreateClient();

    public sealed record Classroom(string TeacherToken, Guid ClassId, string JoinCode, Guid TextId);

    public async Task<Classroom> CreateClassroomAsync()
    {
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var teacher = await PostAsync<AuthResponse>("/api/auth/register",
            new RegisterRequest("Учитель", $"t-{suffix}@test.kz", "test-password-1", "teacher"));
        var cls = await PostAsync<ClassDto>("/api/classes", new CreateClassRequest("8Т", "ru"), teacher.Token);
        var text = await PostAsync<TextDto>($"/api/classes/{cls.Id}/texts",
            new SaveTextRequest("Автобус № 12", TextBody, "local", "schedule", 2, null, null, true), teacher.Token);
        return new Classroom(teacher.Token, cls.Id, cls.JoinCode, text.Id);
    }

    public async Task<string> AddStudentAsync(Classroom c, string name) =>
        (await PostAsync<AuthResponse>("/api/auth/student/register", new StudentRegisterRequest(c.JoinCode, name, "1234"))).Token;

    public static SessionUpload Session(Guid textId, string? conclusion = "Главное: автобус ходит по новому расписанию, утренний рейс продлён.") => new(
        Guid.NewGuid(), textId, DateTimeOffset.UtcNow.AddMinutes(-7), DateTimeOffset.UtcNow.AddMinutes(-1), conclusion,
        [
            new(Guid.NewGuid(), 1, "Почему вечерний рейс автобуса отменён?", 2, DateTimeOffset.UtcNow.AddMinutes(-5)),
            new(Guid.NewGuid(), 2, "Сколько стоит проезд на автобусе?", 1, DateTimeOffset.UtcNow.AddMinutes(-4)),
            new(Guid.NewGuid(), 3, "Можно ли доверять новому расписанию автобуса?", 2, DateTimeOffset.UtcNow.AddMinutes(-2)),
        ]);

    public async Task<(HttpResponseMessage Http, UploadSessionsResponse? Body)> UploadAsync(string token, params SessionUpload[] sessions)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/student/sessions")
        {
            Content = JsonContent.Create(new UploadSessionsRequest([.. sessions])),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var res = await _http.SendAsync(req);
        return (res, res.IsSuccessStatusCode ? await res.Content.ReadFromJsonAsync<UploadSessionsResponse>() : null);
    }

    public async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object body, string token)
    {
        using var req = new HttpRequestMessage(method, url) { Content = JsonContent.Create(body) };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await _http.SendAsync(req);
    }

    public async Task<T> PostAsync<T>(string url, object body, string? token = null)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
        if (token is not null) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var res = await _http.SendAsync(req);
        Assert.True(res.IsSuccessStatusCode, $"{url}: {(int)res.StatusCode} {await res.Content.ReadAsStringAsync()}");
        return (await res.Content.ReadFromJsonAsync<T>())!;
    }

    /// <summary>Снимок того, что сервер хранит о сессии и ученике, — для сравнения «до» и «после» повтора.</summary>
    public async Task<string> SnapshotAsync(Guid sessionId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var s = await db.Sessions.AsNoTracking().Include(x => x.Questions).Include(x => x.Student).SingleOrDefaultAsync(x => x.Id == sessionId);
        if (s is null) return "нет сессии";
        var questions = string.Join("; ", s.Questions.OrderBy(q => q.Position)
            .Select(q => $"{q.Id}:{q.Position}:{q.Body}:{q.LevelLocal}/{q.LevelAi}/{q.LevelTeacher}:{q.AiComment}"));
        return $"student={s.StudentId} points={s.Points} concl={s.Conclusion}:{s.ConclusionScore} received={s.ReceivedAt:O} " +
               $"q=[{questions}] studentPoints={s.Student!.Points} streak={s.Student.Streak} sessions={await db.Sessions.CountAsync(x => x.StudentId == s.StudentId)}";
    }

    public async Task<int> CountAsync<T>(Func<AppDbContext, IQueryable<T>> query)
    {
        using var scope = factory.Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>()).CountAsync();
    }
}
