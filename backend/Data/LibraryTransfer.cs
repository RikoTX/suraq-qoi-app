using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Unicode;
using Microsoft.EntityFrameworkCore;

namespace SuraqQoi.Api.Data;

/// <summary>
/// Перенос общей библиотеки текстов (class_id = null) между базами — например, с машины разработки на сервер.
/// dotnet run -- export-texts library.json · dotnet run -- import-texts library.json
/// Формат — как у Data/DevSeed/sample-texts.json. Тексты с тем же языком и заголовком не дублируются.
/// </summary>
public static class LibraryTransfer
{
    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.All),
    };

    public static async Task<int> ExportAsync(AppDbContext db, string path, CancellationToken ct)
    {
        var texts = await db.Texts.AsNoTracking().Where(t => t.ClassId == null)
            .OrderBy(t => t.Lang).ThenBy(t => t.Difficulty).ThenBy(t => t.Title).ToListAsync(ct);
        var items = new JsonArray();
        foreach (var t in texts)
        {
            items.Add(new JsonObject
            {
                ["lang"] = t.Lang, ["topic"] = t.Topic, ["kind"] = t.Kind, ["difficulty"] = t.Difficulty,
                ["title"] = t.Title, ["body"] = t.Body,
                ["exampleQuestions"] = JsonNode.Parse(t.ExampleQuestions), ["hints"] = JsonNode.Parse(t.Hints),
                ["reviewed"] = t.Reviewed,
            });
        }
        await File.WriteAllTextAsync(path, items.ToJsonString(Json), ct);
        return texts.Count;
    }

    public static async Task<(int Added, int Skipped)> ImportAsync(AppDbContext db, string path, CancellationToken ct)
    {
        var items = JsonNode.Parse(await File.ReadAllTextAsync(path, ct))!.AsArray();
        var existing = (await db.Texts.Where(t => t.ClassId == null).Select(t => new { t.Lang, t.Title }).ToListAsync(ct))
            .Select(t => (t.Lang, t.Title)).ToHashSet();
        int added = 0, skipped = 0;
        foreach (var n in items)
        {
            var lang = (string)n!["lang"]!;
            var title = (string)n["title"]!;
            if (!existing.Add((lang, title)))
            {
                skipped++;
                continue;
            }
            db.Texts.Add(new ReadingText
            {
                Id = Guid.NewGuid(), Lang = lang, Topic = (string)n["topic"]!, Kind = (string)n["kind"]!,
                Difficulty = (short)(int)n["difficulty"]!, Title = title, Body = (string)n["body"]!,
                ExampleQuestions = n["exampleQuestions"]!.ToJsonString(), Hints = n["hints"]!.ToJsonString(),
                Reviewed = (bool?)n["reviewed"] ?? false, UpdatedAt = DateTimeOffset.UtcNow,
            });
            added++;
        }
        await db.SaveChangesAsync(ct);
        return (added, skipped);
    }
}
