using System.Net.Http.Headers;
using System.Net.Http.Json;
using SuraqQoi.Api.Features.Teacher;

namespace SuraqQoi.Tests.Integration;

[Collection(ApiCollection.Name)]
[Trait("Category", "Integration")]
public sealed class TeacherOverviewTests(ApiFactory factory)
{
    private readonly TestApi _api = new(factory);

    [Fact]
    public async Task Student_who_just_joined_has_no_signal()
    {
        var c = await _api.CreateClassroomAsync();
        await _api.AddStudentAsync(c, "Новенький");

        using var http = factory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", c.TeacherToken);
        var overview = await http.GetFromJsonAsync<ClassOverviewDto>($"/api/classes/{c.ClassId}/overview");

        var student = Assert.Single(overview!.Students);
        Assert.Null(student.Signal);
    }
}
