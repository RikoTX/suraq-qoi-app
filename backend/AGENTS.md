# AGENTS.md — backend

API для «Сұрақ қой — Обыграй ИИ» (Órleu Hack 2026, кейс 3). Полное ТЗ: [`../docs/TZ.md`](../docs/TZ.md).
**Перед работой прочитай раздел 0 ТЗ** — там статус этапов, что готово и что делать следующим.

## Стек

ASP.NET Core **.NET 9** (Minimal APIs) · EF Core 9 + Npgsql · PostgreSQL 17 · JWT Bearer · BCrypt · `EFCore.NamingConventions` (snake_case в БД).
Версию .NET не повышать без согласования с командой (локально установлен SDK 9).

## Запуск

```bash
docker compose up -d          # PostgreSQL: localhost:5433 (не 5432 — там может быть системный Postgres)
dotnet ef database update     # миграции
dotnet run                    # http://localhost:8080
```

Проверка: `curl http://localhost:8080/health` → `{"status":"ok"}`.

## Структура

| Путь | Что |
|---|---|
| `Program.cs` | DI, JWT, ProblemDetails, `/health`, подключение эндпоинтов |
| `Auth/` | `AuthEndpoints` (`/api/auth/register`, `/login`, `/me`), `JwtTokenService`, `AdminSeeder` |
| `Data/Entities.cs` | Все сущности: `User` (+ `UserRole`), `SchoolClass`, `Student`, `ReadingText`, `Session`, `Question` |
| `Data/AppDbContext.cs` | Таблицы, индексы, связи |
| `Migrations/` | Миграции EF Core |
| `Features/<Фича>/` | Новые эндпоинты — по папке на фичу (этап 2: `Features/Classes/`) |

## Роли и авторизация

- Роли: `Student`, `Teacher`, `Admin` (enum `UserRole`, в БД строкой). В API и JWT — нижним регистром: `student` / `teacher` / `admin` (`role.ToApi()`).
- JWT claims: `sub`, `email`, `name`, `role`. `MapInboundClaims = false`, `RoleClaimType = "role"`.
- Ограничение по роли: `.RequireAuthorization(p => p.RequireRole("teacher"))`. Id пользователя: `Guid.Parse(principal.FindFirstValue(Claims.Sub))`.
- Админ не регистрируется через API. Создаётся при старте из `Admin:Email` / `Admin:Password`.
- У ученика две записи: `users` (учётка) и `students` (класс, очки, стрик), связь 1:1 по `user_id`.

## Правила

- Ответы ошибок: `TypedResults.ValidationProblem(...)` для полей, `TypedResults.Problem(...)` для остального. Тексты ошибок — на русском, понятные пользователю.
- Email всегда приводить к нижнему регистру.
- Изменил сущности → `dotnet ef migrations add <ИмяНаАнглийском>` → `dotnet ef database update`. Применённые миграции не редактировать.
- Секреты (`Jwt:Secret`, `ANTHROPIC_API_KEY`, пароли) — только в `appsettings.Development.json` для локалки или в переменных окружения на сервере. Не коммитить реальные ключи.
- Claude API — только с сервера, только модели `claude-opus-5-5` (генерация текстов) и `claude-haiku-5-5` (оценка), с таймаутами (раздел 9 ТЗ).
- Не логировать тексты вопросов и имена учеников.
- Делать только текущий этап. Не добавлять функции будущих этапов «заодно».

## Проверка перед коммитом

```bash
dotnet build                  # без ошибок
```

Ручная проверка эндпоинтов — через curl или фронтенд. Для кириллицы в curl на Windows отправляй JSON в UTF-8 (Git Bash шлёт cp1251).

## Коммиты

Пушит владелец репозитория. Сообщение коммита сначала показать ему на проверку.
