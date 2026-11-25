# AGENTS.md — backend

API для «Сұрақ қой — Обыграй ИИ» (Órleu Hack 2026, кейс 3). Полное ТЗ: [`../docs/TZ.md`](../docs/TZ.md).
**Перед работой прочитай раздел 0 ТЗ** — там статус этапов, что готово и что делать следующим.

## Стек

ASP.NET Core **.NET 9** (Minimal APIs) · EF Core 9 + Npgsql · PostgreSQL 17 · JWT Bearer · BCrypt · `EFCore.NamingConventions` (snake_case в БД).
Версию .NET не повышать без согласования с командой (локально установлен SDK 9).

## Запуск

```bash
docker compose up -d          # PostgreSQL: localhost:5433 (не 5432 — там может быть системный Postgres)
dotnet ef database update     # миграции (на сервере применяются сами при старте)
dotnet run                    # http://localhost:8080
```

Проверка: `curl http://localhost:8080/health` → `{"status":"ok"}`.

## Структура

| Путь | Что |
|---|---|
| `Program.cs` | DI, JWT, ProblemDetails, `/health`, подключение эндпоинтов |
| `Auth/` | `AuthEndpoints` (учитель: `/api/auth/register`, `/login`, `/me`), `StudentAuthEndpoints` (ученик: `/api/auth/student/class`, `/register`, `/login` по коду + имени + PIN; сброс PIN учителем), `JwtTokenService`, `AdminSeeder` |
| `Data/Entities.cs` | Все сущности: `User` (+ `UserRole`), `SchoolClass`, `Student`, `ReadingText`, `Session`, `Question` |
| `Data/AppDbContext.cs` | Таблицы, индексы, связи |
| `Migrations/` | Миграции EF Core |
| `Features/Classes/` | Этап 2: классы учителя, вступление по коду, `GET /api/student/me` |
| `Features/Texts/` | Этап 3: тексты класса учителя (создать, ИИ, из библиотеки, править, опубликовать), `/api/library`, `GET /api/student/pack` |
| `Features/Admin/` | Обзор для админа: `/api/admin/stats`, `/users`, `/classes` (только чтение) |
| `Features/Sessions/` | `POST /api/student/sessions` — приём сессий из очереди устройства, идемпотентно, оценка ИИ в бюджете 6,5 с |
| `Features/Teacher/` | `/api/classes/{id}/overview` (карта навыков, сигналы, диагностика), `/api/students/{id}`, `PATCH /api/questions/{id}` |
| `Features/Diagnostics/`, `Data/Diagnostics/` | Мини-диагностика (ТЗ, 11.1): `GET /api/student/diagnostic`, `POST /api/student/diagnostics`, `PUT /api/classes/{id}/diagnostic`; задания — `forms.json` (встроен в сборку, черновик — проверяет учитель) |
| `Services/Grading/` | `OpenAiGradingService` (Groq/OpenAI, строгая схема; без ключа в Development — правилами), `GradingPrompts`, `HeuristicGrader` (копия — `frontend/src/scoring/heuristic.ts`) |
| `Services/Scoring/PointsCalculator.cs` | Очки, ранги, стрик, «предварительные» сессии |
| `tests/` | xUnit (`dotnet test tests`); `heuristic-cases.json` — общие примеры с фронтендом. `tests/Integration/` — настоящий API (`WebApplicationFactory`) на временной базе в Postgres из `docker compose` (или `TEST_POSTGRES`), ИИ заменён `FakeGrader`; без базы — `--filter Category!=Integration` |
| `Services/Content/TextGenerator.cs` | Генерация текстов через Groq/OpenAI (команда `generate-texts`) |
| `Data/Library/` | Общая библиотека: `library.json` (26 текстов kk/ru), `REVIEW.md` — что проверить перед публикацией |
| `Data/DevSeed/` | Только Development: библиотека из `Data/Library/library.json`, если таблица `texts` пуста. `DemoSeeder` — `dotnet run -- seed-demo`: учитель `demo-teacher@suraqqoi.kz` / `demo-teacher-2026`, класс «8А (демо)», 15 учеников с PIN `1234`, история за 14 дней, диагностика до/после |
| `Services/Grading/Eval/`, `tests/grading-eval/` | Q2 (ТЗ, 9.4): `dotnet run -- eval-grading [--lang kk] [--out отчёт.md]` — точность ИИ против разметки учителя (`labels.csv`, лист для печати — `LABELING.md`) |
| `Features/Pilot/` | `dotnet run -- pilot-report <код> [--since 2026-11-26] [--names]` — отчёт по пилоту в markdown (ТЗ, 11; сценарий — `docs/PILOT.md`) |
| `Data/LibraryTransfer.cs` | `export-texts` / `import-texts file.json` — перенос общей библиотеки между базами (без дублей) |
| `Dockerfile`, `deploy/` | Сервер: Caddy + API + PostgreSQL (`deploy/docker-compose.yml`, `deploy/Caddyfile`, `.env.example`), инструкция — `deploy/README.md` |
| `Features/<Фича>/` | Новые эндпоинты — по папке на фичу |

## Генерация текстов

Ключ Groq (`gsk_…`, console.groq.com) хранится в user-secrets (вне репозитория):

```bash
dotnet user-secrets set "OpenAI:ApiKey" "<ключ>"     # или переменная OPENAI_API_KEY
dotnet run -- generate-texts --lang kk --topic local --kind schedule --difficulty 2 --count 5
```

Темы: `sport games money nature history tech local`. Типы: `article table notice schedule social_post math_problem`.
Команда пополняет **общую библиотеку** (`class_id = null`). Учитель добавляет оттуда тексты в класс черновиками или генерирует свои кнопкой «ИИ»; публикует сам. Админ тексты не проверяет.

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
- Секреты (`Jwt:Secret`, `OpenAI:ApiKey`, пароли) — локально в user-secrets (`dotnet user-secrets set`), на сервере в переменных окружения. Не коммитить реальные ключи.
- ИИ — только с сервера, через пакет `OpenAI` (OpenAI-совместимый API; сервер — `OpenAI:Endpoint`, сейчас Groq). Модели из настроек: `OpenAI:TextModel` (тексты), `OpenAI:GradingModel` (оценка). Всегда с таймаутами (раздел 9 ТЗ).
- Не логировать тексты вопросов и имена учеников.
- Делать только текущий этап. Не добавлять функции будущих этапов «заодно».

## Проверка перед коммитом

```bash
dotnet build                  # без ошибок
dotnet test tests             # xUnit; интеграционным нужен docker compose up -d
```

Ручная проверка эндпоинтов — через curl или фронтенд. Для кириллицы в curl на Windows отправляй JSON в UTF-8 (Git Bash шлёт cp1251).

## Коммиты

Пушит владелец репозитория. Сообщение коммита сначала показать ему на проверку.
