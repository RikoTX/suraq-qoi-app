using System.Text.Json;
using SuraqQoi.Api.Services.Grading;

namespace SuraqQoi.Tests;

public class HeuristicGraderTests
{
    /// <summary>Те же примеры проверяет frontend: npm run test:heuristic.</summary>
    public static IEnumerable<object[]> SharedCases()
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "heuristic-cases.json")));
        var texts = doc.RootElement.GetProperty("texts").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString()!);
        foreach (var c in doc.RootElement.GetProperty("cases").EnumerateArray())
        {
            var previous = c.TryGetProperty("previous", out var p) ? p.EnumerateArray().Select(x => x.GetString()!).ToArray() : [];
            yield return [c.GetProperty("q").GetString()!, texts[c.GetProperty("text").GetString()!], previous, c.GetProperty("level").GetInt32(), c.GetProperty("why").GetString()!];
        }
    }

    [Theory]
    [MemberData(nameof(SharedCases))]
    public void Level_matches_shared_cases(string question, string text, string[] previous, int expected, string why)
    {
        Assert.True(expected == HeuristicGrader.Level(question, text, previous), why);
    }

    [Fact]
    public void Never_above_level_2_even_with_evaluate_markers()
    {
        const string text = "Автор пишет, что новое расписание автобуса удобнее старого и доверять ему можно.";
        var level = HeuristicGrader.Level("Можно ли доверять автору, что новое расписание автобуса удобнее старого?", text, []);
        Assert.Equal(HeuristicGrader.MaxLevel, level);
    }

    [Theory]
    [InlineData("", 0)]
    [InlineData("Автобус ходит.", 0)]
    [InlineData("Главное: автобус будет ходить по новому расписанию.", 5)]
    [InlineData("Главное в тексте: автобус ходит по новому расписанию, утренний рейс продлён до школы, а вечерний отменён из-за ремонта.", 10)]
    public void Conclusion_score_is_at_most_10_offline(string conclusion, int expected)
    {
        const string text = "С 1 декабря автобус № 12 ходит по новому расписанию. Утренний рейс продлён до школы. Вечерний рейс отменён из-за ремонта дороги.";
        Assert.Equal(expected, HeuristicGrader.ConclusionScore(conclusion, text));
    }
}
