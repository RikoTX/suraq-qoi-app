using SuraqQoi.Api.Features.Pilot;

namespace SuraqQoi.Tests;

public class PilotMetricsTests
{
    private static readonly DateTimeOffset Start = new(2026, 11, 26, 9, 0, 0, TimeSpan.FromHours(5));

    private static PilotStudent Student(string name, int[][] sessions, int? pre = null, int? post = null) => new(
        name,
        sessions.Select((levels, i) => new PilotSession(Start.AddMinutes(15 * i), levels, 0)).ToList(),
        pre, post, pre is null ? null : [1, 1, 0], post is null ? null : [2, 1, 1]);

    [Fact]
    public void Four_sessions_compare_first_two_with_last_two()
    {
        var m = PilotMetrics.Compute([Student("A", [[1, 1, 2], [1, 2, 2], [2, 3, 3], [3, 4, 2]])]);

        var d = Assert.Single(m.Depth);
        Assert.Equal(2, d.Window);
        Assert.Equal(0, d.EarlyDepth);
        Assert.Equal(4.0 / 6, d.LateDepth, 3);
        Assert.Equal(1, m.DepthUp);
    }

    [Fact]
    public void Three_sessions_compare_first_with_last_and_one_session_is_skipped()
    {
        var m = PilotMetrics.Compute([
            Student("A", [[1, 1, 1], [2, 2, 2], [3, 3, 1]]),
            Student("B", [[4, 4, 4]]),
        ]);

        var d = Assert.Single(m.Depth);
        Assert.Equal("A", d.Name);
        Assert.Equal(1, d.Window);
        Assert.Equal(2.0 / 3, d.LateDepth, 3);
        Assert.Equal(2, m.Active);
        Assert.Equal(4, m.Sessions);
    }

    [Fact]
    public void Window_is_at_most_three_sessions()
    {
        var sessions = Enumerable.Range(0, 10).Select(i => new[] { i < 5 ? 1 : 3 }).ToArray();
        var d = Assert.Single(PilotMetrics.Compute([Student("A", sessions)]).Depth);
        Assert.Equal(3, d.Window);
        Assert.Equal((0, 1), (d.EarlyDepth, d.LateDepth));
    }

    [Fact]
    public void Pooled_depth_counts_questions_of_all_students()
    {
        var m = PilotMetrics.Compute([
            Student("A", [[1, 1, 1], [3, 3, 3]]),
            Student("B", [[3, 3, 3], [3, 1, 1]]),
        ]);
        Assert.Equal(0.5, m.EarlyDepthPooled);
        Assert.Equal(4.0 / 6, m.LateDepthPooled!.Value, 3);
        Assert.Equal((1, 0, 1), (m.DepthUp, m.DepthSame, m.DepthDown));
    }

    [Fact]
    public void Ungraded_sessions_do_not_count_toward_depth()
    {
        var student = new PilotStudent("A", [new(Start, [1, 1, 1], 0), new(Start.AddMinutes(10), [], 3)], null, null, null, null);
        var m = PilotMetrics.Compute([student]);
        Assert.Empty(m.Depth);
        Assert.Equal(3, m.PendingQuestions);
    }

    [Fact]
    public void Diagnostic_uses_only_students_with_both_checks()
    {
        var m = PilotMetrics.Compute([
            Student("A", [], pre: 3, post: 5),
            Student("B", [], pre: 4, post: 4),
            Student("C", [], pre: 2),
        ]);
        Assert.Equal(2, m.Paired);
        Assert.Equal(3.5, m.PreAvg);
        Assert.Equal(4.5, m.PostAvg);
        Assert.Equal((1, 1, 0), (m.PostUp, m.PostSame, m.PostDown));
        Assert.Equal([1, 1, 0], m.PreSkills!);
    }
}
