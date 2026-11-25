using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace SuraqQoi.Api.Data;

public static class DbErrors
{
    /// <summary>Запись с таким ключом уже вставил параллельный запрос (PostgreSQL 23505).</summary>
    public static bool IsUniqueViolation(DbUpdateException e) =>
        e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
}
