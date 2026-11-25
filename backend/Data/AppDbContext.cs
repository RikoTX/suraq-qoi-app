using Microsoft.EntityFrameworkCore;

namespace SuraqQoi.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<SchoolClass> Classes => Set<SchoolClass>();
    public DbSet<Student> Students => Set<Student>();
    public DbSet<ReadingText> Texts => Set<ReadingText>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<Question> Questions => Set<Question>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(16); // "Student" | "Teacher" | "Admin"
        });

        b.Entity<SchoolClass>(e =>
        {
            e.ToTable("classes");
            e.HasIndex(x => x.JoinCode).IsUnique();
            e.HasOne(x => x.Teacher).WithMany(x => x.Classes).HasForeignKey(x => x.TeacherId);
        });

        b.Entity<Student>(e =>
        {
            e.ToTable("students");
            e.HasIndex(x => x.UserId).IsUnique();
            e.HasOne(x => x.User).WithOne().HasForeignKey<Student>(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Class).WithMany(x => x.Students).HasForeignKey(x => x.ClassId);
        });

        b.Entity<ReadingText>(e =>
        {
            e.ToTable("texts");
            e.Property(x => x.ExampleQuestions).HasColumnType("jsonb");
            e.Property(x => x.Hints).HasColumnType("jsonb");
            e.HasIndex(x => new { x.Lang, x.Reviewed, x.UpdatedAt });
            e.HasIndex(x => new { x.ClassId, x.Reviewed, x.UpdatedAt });
            e.HasOne(x => x.Class).WithMany().HasForeignKey(x => x.ClassId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<Session>(e =>
        {
            e.ToTable("sessions");
            e.Property(x => x.Id).ValueGeneratedNever();
            e.HasOne(x => x.Student).WithMany(x => x.Sessions).HasForeignKey(x => x.StudentId);
            e.HasOne(x => x.Text).WithMany().HasForeignKey(x => x.TextId);
        });

        b.Entity<Question>(e =>
        {
            e.ToTable("questions");
            e.Property(x => x.Id).ValueGeneratedNever();
            e.HasOne(x => x.Session).WithMany(x => x.Questions)
                .HasForeignKey(x => x.SessionId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
