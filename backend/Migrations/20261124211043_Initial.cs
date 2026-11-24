using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SuraqQoi.Api.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "texts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    lang = table.Column<string>(type: "text", nullable: false),
                    topic = table.Column<string>(type: "text", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    difficulty = table.Column<short>(type: "smallint", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    body = table.Column<string>(type: "text", nullable: false),
                    example_questions = table.Column<string>(type: "jsonb", nullable: false),
                    hints = table.Column<string>(type: "jsonb", nullable: false),
                    reviewed = table.Column<bool>(type: "boolean", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_texts", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "text", nullable: false),
                    password_hash = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    role = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "classes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    teacher_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    join_code = table.Column<string>(type: "text", nullable: false),
                    lang = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_classes", x => x.id);
                    table.ForeignKey(
                        name: "fk_classes_users_teacher_id",
                        column: x => x.teacher_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "students",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    class_id = table.Column<Guid>(type: "uuid", nullable: true),
                    interests = table.Column<string[]>(type: "text[]", nullable: false),
                    points = table.Column<int>(type: "integer", nullable: false),
                    streak = table.Column<int>(type: "integer", nullable: false),
                    last_active_date = table.Column<DateOnly>(type: "date", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_students", x => x.id);
                    table.ForeignKey(
                        name: "fk_students_classes_class_id",
                        column: x => x.class_id,
                        principalTable: "classes",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "fk_students_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    student_id = table.Column<Guid>(type: "uuid", nullable: false),
                    text_id = table.Column<Guid>(type: "uuid", nullable: false),
                    conclusion = table.Column<string>(type: "text", nullable: true),
                    conclusion_score = table.Column<short>(type: "smallint", nullable: true),
                    points = table.Column<int>(type: "integer", nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_sessions", x => x.id);
                    table.ForeignKey(
                        name: "fk_sessions_students_student_id",
                        column: x => x.student_id,
                        principalTable: "students",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_sessions_texts_text_id",
                        column: x => x.text_id,
                        principalTable: "texts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "questions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<short>(type: "smallint", nullable: false),
                    body = table.Column<string>(type: "text", nullable: false),
                    level_local = table.Column<short>(type: "smallint", nullable: true),
                    level_ai = table.Column<short>(type: "smallint", nullable: true),
                    ai_comment = table.Column<string>(type: "text", nullable: true),
                    ai_hint = table.Column<string>(type: "text", nullable: true),
                    level_teacher = table.Column<short>(type: "smallint", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_questions", x => x.id);
                    table.ForeignKey(
                        name: "fk_questions_sessions_session_id",
                        column: x => x.session_id,
                        principalTable: "sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_classes_join_code",
                table: "classes",
                column: "join_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_classes_teacher_id",
                table: "classes",
                column: "teacher_id");

            migrationBuilder.CreateIndex(
                name: "ix_questions_session_id",
                table: "questions",
                column: "session_id");

            migrationBuilder.CreateIndex(
                name: "ix_sessions_student_id",
                table: "sessions",
                column: "student_id");

            migrationBuilder.CreateIndex(
                name: "ix_sessions_text_id",
                table: "sessions",
                column: "text_id");

            migrationBuilder.CreateIndex(
                name: "ix_students_class_id",
                table: "students",
                column: "class_id");

            migrationBuilder.CreateIndex(
                name: "ix_students_user_id",
                table: "students",
                column: "user_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_texts_lang_reviewed_updated_at",
                table: "texts",
                columns: new[] { "lang", "reviewed", "updated_at" });

            migrationBuilder.CreateIndex(
                name: "ix_users_email",
                table: "users",
                column: "email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "questions");

            migrationBuilder.DropTable(
                name: "sessions");

            migrationBuilder.DropTable(
                name: "students");

            migrationBuilder.DropTable(
                name: "texts");

            migrationBuilder.DropTable(
                name: "classes");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
