using System.Net;
using System.Net.Http.Json;
using SuraqQoi.Api.Data.Diagnostics;
using SuraqQoi.Api.Features.Diagnostics;

namespace SuraqQoi.Tests.Integration;

/// <summary>Мини-диагностика тоже уходит через очередь (ТЗ, 11.1): повтор не создаёт второй записи.</summary>
[Collection(ApiCollection.Name)]
[Trait("Category", "Integration")]
public sealed class DiagnosticResendTests(ApiFactory factory)
{
    private readonly TestApi _api = new(factory);

    private static SubmitDiagnosticRequest Pre(int[] answers) =>
        new(Guid.NewGuid(), "pre", "A", "ru", answers, DateTimeOffset.UtcNow.AddMinutes(-9), DateTimeOffset.UtcNow.AddMinutes(-1));

    private static int[] RightAnswers() => DiagnosticForms.Get("A", "ru")!.Texts.SelectMany(t => t.Tasks).Select(t => t.Answer).ToArray();

    [Fact]
    public async Task Same_result_twice_is_stored_once_and_keeps_first_answers()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Ильяс");
        var pre = Pre(RightAnswers());

        var first = await (await _api.SendAsync(HttpMethod.Post, "/api/student/diagnostics", pre, token)).Content.ReadFromJsonAsync<DiagnosticResultDto>();
        var again = await _api.SendAsync(HttpMethod.Post, "/api/student/diagnostics", pre with { Answers = [0, 0, 0, 0, 0, 0] }, token);
        var second = await again.Content.ReadFromJsonAsync<DiagnosticResultDto>();

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(first! with { Skills = [] }, second! with { Skills = [] });
        Assert.Equal(first.Skills, second.Skills);
        Assert.Equal(6, second.Score);
        Assert.Equal(1, await _api.CountAsync(db => db.Diagnostics.Where(d => d.Id == pre.Id)));
    }

    [Fact]
    public async Task Second_entry_check_with_new_id_returns_the_first()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Томирис");
        var first = Pre(RightAnswers());
        await _api.SendAsync(HttpMethod.Post, "/api/student/diagnostics", first, token);

        var res = await _api.SendAsync(HttpMethod.Post, "/api/student/diagnostics", Pre([0, 0, 0, 0, 0, 0]), token);
        var body = await res.Content.ReadFromJsonAsync<DiagnosticResultDto>();

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(first.Id, body!.Id);
        Assert.Equal(1, await _api.CountAsync(db => db.Diagnostics.Where(d => d.Kind == "pre" && d.Student!.User!.Name == "Томирис")));
    }

    [Fact]
    public async Task Concurrent_sends_of_the_same_result_store_it_once()
    {
        var c = await _api.CreateClassroomAsync();
        var token = await _api.AddStudentAsync(c, "Жансая");
        var pre = Pre(RightAnswers());

        var results = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => _api.SendAsync(HttpMethod.Post, "/api/student/diagnostics", pre, token)));

        Assert.All(results, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(1, await _api.CountAsync(db => db.Diagnostics.Where(d => d.Id == pre.Id)));
    }
}
