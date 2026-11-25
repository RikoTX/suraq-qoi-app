using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;

namespace SuraqQoi.Api.Data.DevSeed;

/// <summary>
/// Только для локальной разработки: если таблица texts пуста, кладёт общую библиотеку
/// (Data/Library/library.json, 26 текстов kk/ru, reviewed = false) — работать можно без ключа ИИ.
/// На сервере библиотеку загружает команда import-texts (backend/deploy/README.md).
/// </summary>
public static class DevTextSeeder
{
    public static async Task SeedAsync(IServiceProvider services, IWebHostEnvironment env, ILogger logger)
    {
        if (!env.IsDevelopment()) return;

        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (await db.Texts.AnyAsync()) return;

        var path = Path.Combine(env.ContentRootPath, "Data", "Library", "library.json");
        if (!File.Exists(path)) return;

        var items = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsArray();
        foreach (var n in items)
        {
            db.Texts.Add(new ReadingText
            {
                Id = Guid.NewGuid(),
                Lang = (string)n!["lang"]!,
                Topic = (string)n["topic"]!,
                Kind = (string)n["kind"]!,
                Difficulty = (short)(int)n["difficulty"]!,
                Title = (string)n["title"]!,
                Body = (string)n["body"]!,
                ExampleQuestions = n["exampleQuestions"]!.ToJsonString(),
                Hints = n["hints"]!.ToJsonString(),
                Reviewed = (bool)n["reviewed"]!,
                UpdatedAt = DateTimeOffset.UtcNow,
            });
        }
        await db.SaveChangesAsync();
        logger.LogInformation("Dev seed: added {Count} sample texts", items.Count);
    }
}
