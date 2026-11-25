using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using SuraqQoi.Api.Data;

namespace SuraqQoi.Api.Auth;

public sealed class JwtOptions
{
    public string Issuer { get; set; } = "suraq-qoi";
    public string Secret { get; set; } = "";
    public int LifetimeDays { get; set; } = 7;

    public SymmetricSecurityKey SigningKey() => new(Encoding.UTF8.GetBytes(Secret));
}

public static class Claims
{
    public const string Sub = "sub";
    public const string Email = "email";
    public const string Name = "name";
    public const string Role = "role";
}

public sealed class JwtTokenService(JwtOptions options)
{
    public string Create(User user)
    {
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = options.Issuer,
            Audience = options.Issuer,
            Expires = DateTime.UtcNow.AddDays(options.LifetimeDays),
            SigningCredentials = new SigningCredentials(options.SigningKey(), SecurityAlgorithms.HmacSha256),
            Subject = new ClaimsIdentity(
                new[]
                {
                    new Claim(Claims.Sub, user.Id.ToString()),
                    new Claim(Claims.Name, user.Name),
                    new Claim(Claims.Role, user.Role.ToApi()),
                }
                // У ученика email нет — в токен его не пишем.
                .Concat(user.Email is null ? [] : [new Claim(Claims.Email, user.Email)])),
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}

public static class UserRoleExtensions
{
    /// <summary>Роль в API и в JWT: "student" | "teacher" | "admin".</summary>
    public static string ToApi(this UserRole role) => role.ToString().ToLowerInvariant();
}
