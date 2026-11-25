using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SuraqQoi.Api.Migrations
{
    /// <inheritdoc />
    public partial class SessionConclusionComment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "conclusion_comment",
                table: "sessions",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "conclusion_comment",
                table: "sessions");
        }
    }
}
