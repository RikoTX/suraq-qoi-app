using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SuraqQoi.Api.Migrations
{
    /// <inheritdoc />
    public partial class TextOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "class_id",
                table: "texts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "created_by_id",
                table: "texts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_texts_class_id_reviewed_updated_at",
                table: "texts",
                columns: new[] { "class_id", "reviewed", "updated_at" });

            migrationBuilder.CreateIndex(
                name: "ix_texts_created_by_id",
                table: "texts",
                column: "created_by_id");

            migrationBuilder.AddForeignKey(
                name: "fk_texts_classes_class_id",
                table: "texts",
                column: "class_id",
                principalTable: "classes",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "fk_texts_users_created_by_id",
                table: "texts",
                column: "created_by_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_texts_classes_class_id",
                table: "texts");

            migrationBuilder.DropForeignKey(
                name: "fk_texts_users_created_by_id",
                table: "texts");

            migrationBuilder.DropIndex(
                name: "ix_texts_class_id_reviewed_updated_at",
                table: "texts");

            migrationBuilder.DropIndex(
                name: "ix_texts_created_by_id",
                table: "texts");

            migrationBuilder.DropColumn(
                name: "class_id",
                table: "texts");

            migrationBuilder.DropColumn(
                name: "created_by_id",
                table: "texts");
        }
    }
}
