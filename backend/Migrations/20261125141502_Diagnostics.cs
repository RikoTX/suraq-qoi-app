using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SuraqQoi.Api.Migrations
{
    /// <inheritdoc />
    public partial class Diagnostics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "diagnostic_post_open",
                table: "classes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "diagnostics",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    student_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    form = table.Column<string>(type: "character varying(1)", maxLength: 1, nullable: false),
                    lang = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    answers = table.Column<string>(type: "jsonb", nullable: false),
                    score = table.Column<short>(type: "smallint", nullable: false),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    taken_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    received_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_diagnostics", x => x.id);
                    table.ForeignKey(
                        name: "fk_diagnostics_students_student_id",
                        column: x => x.student_id,
                        principalTable: "students",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_diagnostics_student_id_kind",
                table: "diagnostics",
                columns: new[] { "student_id", "kind" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "diagnostics");

            migrationBuilder.DropColumn(
                name: "diagnostic_post_open",
                table: "classes");
        }
    }
}
