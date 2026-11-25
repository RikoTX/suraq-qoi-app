using SuraqQoi.Api.Data;
using SuraqQoi.Api.Services.Scoring;

namespace SuraqQoi.Tests;

public class PointsCalculatorTests
{
    private static Session Session(string? conclusion, short? conclusionScore, params (short? ai, short? teacher)[] questions)
    {
        var s = new Session { Id = Guid.NewGuid(), Conclusion = conclusion, ConclusionScore = conclusionScore };
        short pos = 1;
        foreach (var (ai, teacher) in questions)
            s.Questions.Add(new Question { Id = Guid.NewGuid(), Position = pos++, Body = "?", LevelAi = ai, LevelTeacher = teacher });
        return s;
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 10)]
    [InlineData(2, 20)]
    [InlineData(3, 30)]
    [InlineData(4, 50)]
    public void Level_points(int level, int points) => Assert.Equal(points, PointsCalculator.Points(level));

    [Fact]
    public void Graded_session_sums_levels_and_conclusion()
    {
        var s = Session("Вывод", 15, (1, null), (3, null), (4, null));
        Assert.False(PointsCalculator.IsPending(s));
        Assert.Equal(10 + 30 + 50 + 15, PointsCalculator.SessionPoints(s));
    }

    [Fact]
    public void Session_with_ungraded_question_is_pending_and_scores_zero()
    {
        var s = Session(null, null, (2, null), (null, null), (1, null));
        Assert.True(PointsCalculator.IsPending(s));
        Assert.Equal(0, PointsCalculator.SessionPoints(s));
    }

    [Fact]
    public void Conclusion_without_score_keeps_session_pending()
    {
        Assert.True(PointsCalculator.IsPending(Session("Мой вывод", null, (2, null))));
        Assert.False(PointsCalculator.IsPending(Session(null, null, (2, null))));
    }

    [Fact]
    public void Teacher_level_overrides_ai()
    {
        var s = Session(null, null, (4, 1), (null, 3));
        Assert.False(PointsCalculator.IsPending(s));
        Assert.Equal(10 + 30, PointsCalculator.SessionPoints(s));
    }

    [Theory]
    [InlineData(0, "novice")]
    [InlineData(199, "novice")]
    [InlineData(200, "sleuth")]
    [InlineData(600, "detective")]
    [InlineData(1499, "detective")]
    [InlineData(1500, "professor")]
    [InlineData(3000, "master")]
    public void Ranks(int points, string rank) => Assert.Equal(rank, PointsCalculator.Rank(points));

    [Theory]
    [InlineData(new[] { 0, -1, -2 }, 3)]
    [InlineData(new[] { -1 }, 1)]
    [InlineData(new[] { -2, -3 }, 0)]
    [InlineData(new[] { 0, -2, -3 }, 1)]
    [InlineData(new int[0], 0)]
    public void Streak(int[] offsets, int expected)
    {
        var today = new DateOnly(2026, 11, 26);
        Assert.Equal(expected, PointsCalculator.Streak(offsets.Select(o => today.AddDays(o)), today));
    }

    [Fact]
    public void Recalculate_counts_only_graded_sessions()
    {
        var student = new Student { Id = Guid.NewGuid() };
        var now = new DateTimeOffset(2026, 11, 26, 6, 0, 0, TimeSpan.Zero);
        var graded = Session(null, null, (3, null), (3, null), (3, null));
        graded.FinishedAt = now.AddDays(-1);
        var pending = Session(null, null, (null, null));
        pending.FinishedAt = now;

        PointsCalculator.Recalculate(student, [graded, pending], now);

        Assert.Equal(90, student.Points);
        Assert.Equal(2, student.Streak); // активность считается и по непроверенной сессии
        Assert.Equal(PointsCalculator.LocalDate(now), student.LastActiveDate);
    }
}
