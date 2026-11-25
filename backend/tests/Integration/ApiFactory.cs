using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SuraqQoi.Api.Services.Grading;

namespace SuraqQoi.Tests.Integration;

/// <summary>
/// Настоящий API (все эндпоинты, EF Core, миграции) на временной базе в локальном PostgreSQL:
/// docker compose up -d в backend/. Другой сервер — переменная TEST_POSTGRES (строка подключения без Database).
/// Оценку ИИ заменяет FakeGrader — без сети и ключа. База удаляется после тестов.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string DefaultServer = "Host=localhost;Port=5433;Username=suraqqoi;Password=dev-only-password";
    private readonly string _database = $"suraqqoi_test_{Guid.NewGuid():N}";

    public FakeGrader Grader { get; } = new();

    private static string PostgresServer => Environment.GetEnvironmentVariable("TEST_POSTGRES") ?? DefaultServer;

    public ApiFactory()
    {
        // Program читает строку подключения сразу при создании builder — до ConfigureWebHost, поэтому переменная окружения.
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", $"{PostgresServer};Database={_database}");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureTestServices(s =>
        {
            s.AddSingleton<IGradingService>(Grader);
        });
    }

    public async Task InitializeAsync()
    {
        await using var conn = new NpgsqlConnection($"{PostgresServer};Database=postgres;Timeout=3");
        try
        {
            await conn.OpenAsync();
        }
        catch (Exception e)
        {
            throw new InvalidOperationException(
                $"Интеграционным тестам нужен PostgreSQL ({PostgresServer}): cd backend && docker compose up -d. " +
                "Только модульные тесты: dotnet test tests --filter Category!=Integration", e);
        }
        // Сама база создаётся миграциями при старте API (первый CreateClient).
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        NpgsqlConnection.ClearAllPools();
        await using var conn = new NpgsqlConnection($"{PostgresServer};Database=postgres");
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_database}\" WITH (FORCE)", conn);
        await cmd.ExecuteNonQueryAsync();
    }
}

[CollectionDefinition(Name)]
public sealed class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}

/// <summary>
/// Оценщик вместо ИИ: Available = false — «ИИ недоступен» (null, как при таймауте);
/// иначе каждый вопрос получает Level. Calls — сколько раз сервер обращался к «ИИ».
/// </summary>
public sealed class FakeGrader : IGradingService
{
    private int _calls;
    public volatile bool Available = true;
    public int Level = 3;
    public int Calls => _calls;

    public Task<GradeResult?> GradeAsync(GradeInput input, TimeSpan budget, CancellationToken ct)
    {
        Interlocked.Increment(ref _calls);
        if (!Available) return Task.FromResult<GradeResult?>(null);
        var questions = input.Questions.Select(q => new GradedQuestion(q.Position, Level, $"Уровень {Level}", "Подсказка")).ToList();
        return Task.FromResult<GradeResult?>(new GradeResult(questions, input.Conclusion is null ? 0 : 12, "Вывод оценён"));
    }
}
