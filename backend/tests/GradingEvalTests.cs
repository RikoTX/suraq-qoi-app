using SuraqQoi.Api.Services.Grading.Eval;

namespace SuraqQoi.Tests;

public class GradingEvalTests
{
    private static string File(string name) => Path.Combine(AppContext.BaseDirectory, "grading-eval", name);

    [Fact]
    public void Dataset_has_20_questions_per_language_and_4_per_level()
    {
        var d = GradingEval.LoadDataset(File("dataset.json"));
        Assert.Equal(40, d.Questions.Count);
        foreach (var lang in new[] { "kk", "ru" })
        {
            var qs = d.Questions.Where(q => q.Lang == lang).ToList();
            Assert.Equal(20, qs.Count);
            for (var level = 0; level <= 4; level++) Assert.Equal(4, qs.Count(q => q.Draft == level));
            Assert.All(qs, q => Assert.Equal(lang, d.Texts.Single(t => t.Id == q.Text).Lang));
        }
        Assert.Equal(d.Questions.Count, d.Questions.Select(q => q.Id).Distinct().Count());
    }

    [Fact]
    public void Kazakh_and_russian_halves_are_parallel()
    {
        var d = GradingEval.LoadDataset(File("dataset.json"));
        var kk = d.Questions.Where(q => q.Lang == "kk").Select(q => (q.Text.Replace("-kk", ""), q.Draft));
        var ru = d.Questions.Where(q => q.Lang == "ru").Select(q => (q.Text.Replace("-ru", ""), q.Draft));
        Assert.Equal(ru, kk);
    }

    [Fact]
    public void Labels_sheet_lists_every_question_without_draft_levels()
    {
        var d = GradingEval.LoadDataset(File("dataset.json"));
        var rows = GradingEval.ParseCsv(System.IO.File.ReadAllText(File("labels.csv")));
        Assert.Equal(["id", "текст", "вопрос", "уровень_учителя", "комментарий"], rows[0]);
        Assert.Equal(d.Questions.Select(q => q.Id), rows.Skip(1).Select(r => r[0]));
        Assert.Equal(d.Questions.Select(q => q.Q), rows.Skip(1).Select(r => r[2]));
    }

    [Fact]
    public void Csv_from_excel_or_google_sheets_is_read()
    {
        var comma = GradingEval.ParseCsv("﻿id,вопрос,уровень_учителя\r\nru-01,\"Почему «так», а не иначе?\",3\r\nru-02,\"Он сказал \"\"да\"\"\",1\r\n");
        Assert.Equal(["ru-01", "Почему «так», а не иначе?", "3"], comma[1]);
        Assert.Equal("Он сказал \"да\"", comma[2][1]);

        var semicolon = GradingEval.ParseCsv("id;вопрос;уровень_учителя\nkk-01;Неге?;2\n");
        Assert.Equal(["kk-01", "Неге?", "2"], semicolon[1]);
    }

    [Fact]
    public void Labels_skip_empty_and_invalid_levels()
    {
        var path = Path.GetTempFileName();
        System.IO.File.WriteAllText(path, "id,текст,вопрос,уровень_учителя,комментарий\nru-01,т,в,3,\nru-02,т,в,,\nru-03,т,в,7,\nru-04,т,в, 0 ,сомневаюсь\n");
        var labels = GradingEval.LoadLabels(path);
        System.IO.File.Delete(path);
        Assert.Equal(new Dictionary<string, int> { ["ru-01"] = 3, ["ru-04"] = 0 }, labels);
    }

    [Fact]
    public void Score_counts_exact_within_one_and_no_answer_as_a_miss()
    {
        var s = GradingEval.Score([(3, 3), (3, 4), (4, 2), (0, null)]);
        Assert.Equal(4, s.Total);
        Assert.Equal(3, s.Answered);
        Assert.Equal(1, s.Exact);
        Assert.Equal(2, s.Within1);
        Assert.Equal(1, s.Confusion[3, 4]);
        Assert.Equal(1, s.Unanswered[0]);
        Assert.Equal(0.25, s.ExactShare);
    }
}
