using SuraqQoi.Api.Data.Diagnostics;

namespace SuraqQoi.Tests;

public class DiagnosticFormsTests
{
    public static IEnumerable<object[]> FormsAndLangs() =>
        from f in DiagnosticForms.Forms from l in DiagnosticForms.Langs select new object[] { f, l };

    [Theory]
    [MemberData(nameof(FormsAndLangs))]
    public void Each_form_has_6_tasks_2_per_skill_with_valid_answers(string form, string lang)
    {
        var content = DiagnosticForms.Get(form, lang);
        Assert.NotNull(content);
        Assert.Equal(2, content.Texts.Length);
        var tasks = content.Texts.SelectMany(t => t.Tasks).ToList();
        Assert.Equal(DiagnosticForms.TaskCount, tasks.Count);
        foreach (var skill in DiagnosticForms.Skills) Assert.Equal(2, tasks.Count(t => t.Skill == skill));
        Assert.All(tasks, t =>
        {
            Assert.Equal(4, t.Options.Length);
            Assert.InRange(t.Answer, 0, t.Options.Length - 1);
            Assert.Equal(t.Options.Length, t.Options.Distinct().Count());
        });
    }

    [Theory]
    [InlineData("A")]
    [InlineData("B")]
    public void Kazakh_and_russian_versions_are_parallel(string form)
    {
        var kk = DiagnosticForms.Get(form, "kk")!.Texts.SelectMany(t => t.Tasks).ToList();
        var ru = DiagnosticForms.Get(form, "ru")!.Texts.SelectMany(t => t.Tasks).ToList();
        Assert.Equal(ru.Select(t => (t.Skill, t.Answer)), kk.Select(t => (t.Skill, t.Answer)));
    }

    [Fact]
    public void Score_counts_correct_answers_by_skill()
    {
        var tasks = DiagnosticForms.Get("A", "ru")!.Texts.SelectMany(t => t.Tasks).ToList();
        var allRight = tasks.Select(t => t.Answer).ToArray();
        Assert.Equal(new DiagnosticScore(6, [2, 2, 2]).Total, DiagnosticForms.Score("A", "ru", allRight)!.Total);
        Assert.Equal([2, 2, 2], DiagnosticForms.Score("A", "ru", allRight)!.Skills);

        var allWrong = tasks.Select(t => (t.Answer + 1) % t.Options.Length).ToArray();
        Assert.Equal(0, DiagnosticForms.Score("A", "ru", allWrong)!.Total);
    }

    [Theory]
    [InlineData(new[] { 0, 0, 0 })]
    [InlineData(new[] { 0, 0, 0, 0, 0, 9 })]
    [InlineData(new[] { -1, 0, 0, 0, 0, 0 })]
    public void Score_rejects_wrong_answer_lists(int[] answers)
    {
        Assert.Null(DiagnosticForms.Score("A", "ru", answers));
    }

    [Fact]
    public void Post_form_differs_from_pre_form()
    {
        var id = Guid.NewGuid();
        Assert.NotEqual(DiagnosticForms.PreFormFor(id), DiagnosticForms.Other(DiagnosticForms.PreFormFor(id)));
        Assert.Equal(DiagnosticForms.PreFormFor(id), DiagnosticForms.PreFormFor(id));
    }
}
