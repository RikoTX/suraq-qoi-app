using Microsoft.EntityFrameworkCore;
using SuraqQoi.Api.Data;

namespace SuraqQoi.Api.Auth;

/// <summary>
/// Создаёт администратора из настроек Admin:Email / Admin:Password, если такого пользователя ещё нет.
/// Админ не может зарегистрироваться через форму.
/// </summary>
public static class AdminSeeder
{
    public static async Task SeedAsync(IServiceProvider services, IConfiguration config, ILogger logger)
    {
        var email = config["Admin:Email"]?.Trim().ToLowerInvariant();
        var password = config["Admin:Password"];
        if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(password)) return;

        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (await db.Users.AnyAsync(u => u.Email == email)) return;

        db.Users.Add(new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Name = "Admin",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = UserRole.Admin,
            CreatedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync();
        logger.LogInformation("Admin user created");
    }
}
