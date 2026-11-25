using SuraqQoi.Api.Features.Teacher;

namespace SuraqQoi.Tests;

public class SignalsTests
{
    private static readonly DateOnly Today = new(2026, 11, 25);

    private static string? Of(DateOnly? lastActive = null, int joinedDaysAgo = 30, int sessions14 = 0, bool deep14 = false,
        int graded7 = 0, double depth7 = 0, double? depthPrev7 = null) =>
        Signals.Of(Today, lastActive, Today.AddDays(-joinedDaysAgo), sessions14, deep14, graded7, depth7, depthPrev7);

    [Theory]
    [InlineData(0)]
    [InlineData(3)]
    [InlineData(7)]
    public void New_student_without_sessions_is_not_missing_in_the_first_week(int joinedDaysAgo)
    {
        Assert.Null(Of(lastActive: null, joinedDaysAgo: joinedDaysAgo));
    }

    [Fact]
    public void Student_without_sessions_for_more_than_a_week_since_joining_is_missing()
    {
        Assert.Equal("inactive", Of(lastActive: null, joinedDaysAgo: 8));
    }

    [Theory]
    [InlineData(8, "inactive")]
    [InlineData(7, null)]
    [InlineData(0, null)]
    public void Missing_means_no_sessions_for_7_days(int daysSinceLastSession, string? expected)
    {
        Assert.Equal(expected, Of(lastActive: Today.AddDays(-daysSinceLastSession)));
    }

    [Fact]
    public void Five_sessions_without_deep_questions_is_stuck()
    {
        Assert.Equal("stuck", Of(lastActive: Today, sessions14: 5, deep14: false));
        Assert.Null(Of(lastActive: Today, sessions14: 5, deep14: true));
        Assert.Null(Of(lastActive: Today, sessions14: 4, deep14: false));
    }

    [Fact]
    public void Depth_up_by_20_points_is_rising()
    {
        Assert.Equal("rising", Of(lastActive: Today, sessions14: 3, deep14: true, graded7: 6, depth7: 0.5, depthPrev7: 0.3));
        Assert.Null(Of(lastActive: Today, sessions14: 3, deep14: true, graded7: 6, depth7: 0.45, depthPrev7: 0.3));
        Assert.Null(Of(lastActive: Today, sessions14: 3, deep14: true, graded7: 6, depth7: 0.9, depthPrev7: null));
    }
}
