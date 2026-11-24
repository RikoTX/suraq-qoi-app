# ТЗ: Сұрақ қой — Обыграй ИИ

Версия 1.0 · 25.11.2026 · Órleu Hack 2026, кейс 3 «Образование: читать и понимать»

Дедлайн сдачи: **27.11.2026 23:00 (Астана)**. Внутренний дедлайн: **27.11 19:00**.

---

## 1. Продукт

PWA для учеников 7–9 классов. Ученик читает короткий текст и сам формулирует к нему вопросы. ИИ классифицирует каждый вопрос по уровню понимания (4 уровня, привязаны к навыкам чтения PISA) и начисляет очки. Учитель видит прогресс класса в веб-панели.

Ключевые ограничения:

- Основной сценарий ученика работает **полностью офлайн**. Сеть нужна только для синхронизации.
- Языки интерфейса и контента: **kk**, **ru**.
- Целевое устройство: дешёвый Android, Chrome, экран от 360 px.
- Claude вызывается **только с сервера**. Ключ API на клиенте запрещён.

## 2. Объём работ

### 2.1 MVP (обязательно к 27.11)

| ID | Функция |
|---|---|
| S1 | Вход ученика по коду класса + имя, выбор языка |
| S2 | Загрузка пакета текстов в IndexedDB, работа без сети |
| S3 | Сессия «Обыграй ИИ»: выбор текста → чтение → 3 вопроса → вывод → итог |
| S4 | Локальная (эвристическая) оценка вопроса без сети |
| S5 | Синхронизация: отправка сессий, получение оценок Claude, пересчёт очков |
| S6 | Очки, ранг, стрик на главной |
| T1 | Вход учителя (email + пароль), создание класса, код класса |
| T2 | Список учеников класса: ранг, очки, последняя активность |
| T3 | Карта навыков класса: распределение вопросов по уровням за 7 и 28 дней |
| T4 | Профиль ученика: все вопросы с оценками, ручная правка уровня |
| C1 | Скрипт генерации 20–30 текстов (50% kk / 50% ru) через Claude + ручная проверка |
| D1 | Сид демо-данных: класс из 15 учеников, история за 14 дней |

### 2.2 Если успеваем (по приоритету)

| ID | Функция |
|---|---|
| T5 | Сигналы: «застрял», «пропал», «растёт» |
| S7 | Рейтинг класса за неделю, «Вопрос дня» |
| M1 | Режим «Есеп»: вопросы к условию текстовой задачи по математике (3–5 задач) |
| T6 | Генерация текста учителем по теме урока |
| T7 | Задание классу с дедлайном + печать в PDF |
| S8 | Режим «Журналист» (онлайн, чат с героем текста) |

### 2.3 Вне объёма

Telegram-бот для родителей, панель завуча и отдела образования, квесты, батлы, нативное Android-приложение.

## 3. Стек

| Слой | Технология |
|---|---|
| Язык | TypeScript |
| Клиент | React 18, Vite, React Router |
| UI | Tailwind CSS, shadcn/ui, Recharts |
| Офлайн | vite-plugin-pwa (Workbox), Dexie (IndexedDB) |
| i18n | i18next (`kk`, `ru`) |
| Backend | Supabase: Postgres, Auth (только учителя), Edge Functions (Deno) |
| ИИ | Claude API, `@anthropic-ai/sdk` |
| Хостинг | Vercel (клиент), Supabase (backend) |

Модели:

| Задача | Модель |
|---|---|
| Генерация текстов, примеров вопросов, подсказок | `claude-opus-5-5` |
| Оценка вопросов и вывода ученика | `claude-haiku-5-5` |

## 4. Структура репозитория

```
suraq-qoi-app/
├── src/
│   ├── app/                 # роутинг, провайдеры, i18n
│   ├── pages/
│   │   ├── student/         # Welcome, Join, Interests, Home, TextPick, Read, Ask, Conclude, Result
│   │   └── teacher/         # Login, Classes, ClassOverview, StudentProfile
│   ├── components/
│   ├── offline/
│   │   ├── db.ts            # схема Dexie
│   │   ├── sync.ts          # outbox + pull
│   │   └── pack.ts          # загрузка пакета текстов
│   ├── scoring/
│   │   ├── heuristic.ts     # локальная оценка уровня
│   │   └── points.ts        # очки, ранги, стрик
│   ├── api/                 # клиент Supabase, вызовы Edge Functions
│   └── locales/{kk,ru}.json
├── supabase/
│   ├── migrations/          # SQL-схема + RLS
│   ├── functions/
│   │   ├── join-class/
│   │   ├── content-pack/
│   │   ├── sync/
│   │   └── _shared/         # клиент Claude, промпты, JSON-схемы
│   └── seed.sql             # демо-данные
├── scripts/
│   └── generate-texts.ts    # генерация текстов через Claude
├── docs/TZ.md
└── README.md
```

## 5. Модель данных (Postgres)

Все `id` — `uuid`. Для сущностей, которые создаются офлайн (`sessions`, `questions`), `id` генерирует клиент (`crypto.randomUUID()`), чтобы синхронизация была идемпотентной.

```sql
create table teachers (
  id uuid primary key references auth.users(id),
  name text not null,
  school text
);

create table classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id),
  name text not null,                    -- '8А'
  join_code text not null unique,        -- '8A-4821'
  lang text not null check (lang in ('kk','ru')),
  created_at timestamptz not null default now()
);

create table students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id),
  name text not null,                    -- только имя, без фамилии
  device_token_hash text not null,       -- sha256 токена устройства
  interests text[] not null default '{}',
  points int not null default 0,
  streak int not null default 0,
  last_active_date date,
  created_at timestamptz not null default now()
);

create table texts (
  id uuid primary key default gen_random_uuid(),
  lang text not null check (lang in ('kk','ru')),
  topic text not null,                   -- sport | games | money | nature | history | tech | local
  kind text not null,                    -- article | table | notice | schedule | social_post | math_problem
  difficulty smallint not null check (difficulty between 1 and 5),
  title text not null,
  body text not null,                    -- markdown, 150–300 слов
  example_questions jsonb not null,      -- {"1": "...", "2": "...", "3": "...", "4": "..."}
  hints jsonb not null,                  -- ["Почему...", "Что будет, если..."]
  reviewed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  student_id uuid not null references students(id),
  text_id uuid not null references texts(id),
  conclusion text,
  conclusion_score smallint,             -- 0–20, от Claude
  points int not null default 0,
  started_at timestamptz not null,
  finished_at timestamptz,
  synced_at timestamptz not null default now()
);

create table questions (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  body text not null,
  level_local smallint,                  -- 0–4, эвристика на устройстве
  level_ai smallint,                     -- 0–4, Claude; null = ещё не оценено
  ai_comment text,
  ai_hint text,
  level_teacher smallint,                -- ручная правка учителя
  created_at timestamptz not null
);
```

Итоговый уровень вопроса: `coalesce(level_teacher, level_ai, level_local)`.

RLS:

- `texts`: чтение — всем с `reviewed = true`.
- `classes`, `students`, `sessions`, `questions`: чтение и обновление — только учителю-владельцу класса.
- Ученики в таблицы напрямую не ходят. Все операции ученика идут через Edge Functions с `service_role` и проверкой `device_token`.

## 6. Офлайн-хранилище (Dexie)

```ts
db.version(1).stores({
  texts:     'id, lang, difficulty, topic',
  sessions:  'id, textId, finishedAt',
  questions: 'id, sessionId',
  outbox:    '++seq, kind, entityId',   // что отправить при синхронизации
  meta:      'key'                      // studentId, deviceToken, packVersion, points, streak
});
```

## 7. API (Supabase Edge Functions)

Ученик передаёт заголовок `X-Device-Token`. Сервер сверяет `sha256(token)` с `students.device_token_hash`.

### `POST /join-class`

```json
// request
{ "joinCode": "8A-4821", "name": "Айгерим", "lang": "kk" }
// response 200
{ "studentId": "uuid", "deviceToken": "base64url-32-bytes", "className": "8А" }
// 404 — код не найден
```

### `GET /content-pack?lang=kk&since=2026-11-25T00:00:00Z`

Возвращает тексты с `reviewed = true` и `updated_at > since`.

```json
{ "version": "2026-11-26T10:00:00Z", "texts": [ { "id": "...", "title": "...", "body": "...", "kind": "...", "difficulty": 2, "topic": "local", "exampleQuestions": {...}, "hints": [...] } ] }
```

### `POST /sync`

Принимает пачку завершённых сессий. Upsert по `id` (повторная отправка безопасна). Неоценённые вопросы оценивает Claude Haiku. Ответ содержит итоговые оценки и пересчитанное состояние ученика.

```json
// request
{
  "sessions": [{
    "id": "uuid", "textId": "uuid",
    "startedAt": "...", "finishedAt": "...",
    "conclusion": "...",
    "questions": [{ "id": "uuid", "position": 1, "body": "...", "levelLocal": 2, "createdAt": "..." }]
  }]
}
// response 200
{
  "graded": [{ "questionId": "uuid", "level": 3, "comment": "...", "hint": "..." }],
  "sessions": [{ "id": "uuid", "points": 95, "conclusionScore": 15 }],
  "student": { "points": 640, "rank": "detective", "streak": 4 }
}
```

Ограничения: максимум 20 сессий за запрос; если Claude недоступен — сохранить сессии, вернуть `graded: []`, оценить при следующей синхронизации.

## 8. Оценка вопросов

### 8.1 Уровни

| Уровень | Код | Критерий | Очки |
|---|---|---|---|
| 0 | `off_text` | Не связан с текстом, повтор, бессмыслица | 0 |
| 1 | `locate` | Ответ прямо есть в тексте | 10 |
| 2 | `connect` | Нужно связать 2+ факта из текста | 20 |
| 3 | `infer` | Ответа в тексте нет, нужен вывод | 30 |
| 4 | `evaluate` | Оценка достоверности, позиции автора, качества аргумента | 50 |

Вывод (conclusion): 0–20 очков по оценке Claude.

### 8.2 Локальная эвристика (`src/scoring/heuristic.ts`)

Работает без сети, мгновенно. Результат — предварительный, помечается в UI как «предварительно».

1. Длина < 3 слов или совпадение с предыдущим вопросом сессии → 0.
2. Нет ни одного слова (длина ≥ 4) из текста → 0.
3. Маркеры (регистр игнорируется, проверка по началу слова):

| Уровень | ru | kk |
|---|---|---|
| 4 | можно ли доверять, прав ли, докажи, достоверн, убедительн | сенуге бола ма, дұрыс па, дәлелде, сенімді |
| 3 | что будет, если, как думаешь, успеет ли, хватит ли, что было бы | егер, қалай ойлайсың, үлгере ме, жете ме, не болар еді |
| 2 | почему, зачем, чем отличается, как связан | неліктен, неге, не үшін, айырмашылығы |
| 1 | кто, где, когда, сколько, что, какой | кім, қайда, қашан, қанша, не, қандай |

Приоритет — от высшего уровня к низшему. Нет маркеров → 1.

### 8.3 Оценка Claude (`supabase/functions/_shared/grade.ts`)

- Модель: `claude-haiku-5-5`.
- Ответ строго по JSON-схеме через structured outputs (`output_config.format`).
- Системный промпт на языке текста (kk или ru), содержит определения уровней из 8.1 и по 2 примера на каждый уровень.
- Вход: текст, 3 вопроса ученика, вывод ученика.
- Claude **не отвечает** на вопросы ученика и не даёт готовых ответов — только уровень, комментарий (≤ 25 слов, на «ты», доброжелательно) и подсказку, как спросить глубже.

```json
{
  "questions": [{ "position": 1, "level": 3, "comment": "string", "hint": "string" }],
  "conclusionScore": 15,
  "conclusionComment": "string"
}
```

## 9. Геймификация (`src/scoring/points.ts`)

Очки сессии = сумма очков вопросов + очки вывода. При расхождении локальной оценки и оценки Claude очки пересчитываются по оценке Claude.

| Ранг | Код | Очки от |
|---|---|---|
| Новичок | `novice` | 0 |
| Сыщик | `sleuth` | 200 |
| Детектив | `detective` | 600 |
| Профессор | `professor` | 1500 |
| Мастер вопросов | `master` | 3000 |

Стрик: +1 за календарный день (`Asia/Almaty`) с ≥ 1 завершённой сессией. Пропуск дня → 1. Считается на сервере при синхронизации и локально для отображения.

## 10. Аналитика учителя

| Метрика | Формула |
|---|---|
| Уровень класса | Средний итоговый уровень вопросов за 7 дней |
| Карта навыков | Доля вопросов уровней 0–4 за 7 / 28 дней |
| Глубина | Доля вопросов уровней 3–4 по неделям |
| Активность | Ученики с сессией за последние 7 дней / все ученики |

Сигналы (T5):

| Сигнал | Условие |
|---|---|
| `stuck` | ≥ 5 сессий за 14 дней и 0 вопросов уровня ≥ 3 |
| `inactive` | Нет сессий 7 дней |
| `rising` | Доля уровней 3–4 за 7 дней выше, чем за предыдущие 7, на ≥ 20 п.п. |

Расчёт — SQL-представлениями (`create view class_stats ...`), без отдельного бэкенда.

## 11. Генерация контента (`scripts/generate-texts.ts`)

- Модель: `claude-opus-5-5`, structured outputs, схема = поля таблицы `texts`.
- Параметры запуска: `--lang kk|ru --topic ... --kind ... --difficulty 1-5 --count N`.
- Требования к тексту: 150–300 слов, реалии Казахстана, без выдуманных фактов о реальных людях и организациях, интересно подростку 13–15 лет.
- Все тексты записываются с `reviewed = false`. Публикация — после проверки человеком (для kk — носителем языка).

## 12. Нефункциональные требования

| Требование | Значение |
|---|---|
| Первая загрузка | ≤ 2 МБ JS+CSS (gzip) |
| Пакет 30 текстов | ≤ 300 КБ |
| Офлайн | Все экраны ученика из S1–S6 открываются в режиме «самолёт» после первой загрузки |
| Время локальной оценки | < 50 мс |
| Данные детей | Только имя и класс. Без фамилии, телефона, email, фото |
| Секреты | `ANTHROPIC_API_KEY` только в секретах Supabase. В репозитории — `.env.example` без значений |

## 13. Переменные окружения

| Переменная | Где | Назначение |
|---|---|---|
| `VITE_SUPABASE_URL` | клиент | URL проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` | клиент | публичный ключ Supabase |
| `ANTHROPIC_API_KEY` | Supabase secrets, локально для `scripts/` | ключ Claude API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secrets | доступ Edge Functions к БД |

## 14. План работ

| Срок | Фронтенд (ученик) | Бэкенд + ИИ | Панель учителя + дизайн | Контент + питч |
|---|---|---|---|---|
| 25.11 | Каркас Vite + PWA + роутинг, экраны S1, Home, TextPick, Read | Миграции, RLS, `join-class`, `content-pack`, `generate-texts.ts` | Макеты в Figma, T1 | Темы текстов, проверка первых 10 текстов |
| 26.11 | Ask, Conclude, Result, Dexie, outbox, эвристика, очки | `sync` + оценка Claude, сид демо-данных | T2, T3, T4 | Тест на 5–10 школьниках, опрос |
| 27.11 | Багфиксы, проверка на реальных телефонах | Деплой, мониторинг ошибок | Презентация (≤ 10 слайдов) | Питч-видео (≤ 3 мин), описание, сдача формы |

Контрольные точки:

1. **25.11 23:00** — сайт задеплоен, 10 текстов в БД, ученик открывает текст.
2. **26.11 23:00** — полный цикл офлайн-сессия → синхронизация → учитель видит вопросы. **Code freeze**: дальше только багфиксы.
3. **27.11 17:00** — презентация и видео готовы.
4. **27.11 19:00** — форма на hackathon.kz отправлена.

## 15. Критерии приёмки MVP

- [ ] Ученик входит по коду класса, выбирает язык и интересы.
- [ ] После первой загрузки в режиме «самолёт» ученик проходит полную сессию и видит предварительные очки.
- [ ] После выхода в сеть сессия синхронизируется без дублей; оценки Claude заменяют локальные, очки пересчитываются.
- [ ] Повторная отправка той же сессии не меняет данные на сервере.
- [ ] Учитель видит новую сессию в профиле ученика ≤ 1 мин после синхронизации.
- [ ] Учитель меняет уровень вопроса — очки ученика пересчитываются.
- [ ] В БД ≥ 20 проверенных текстов, из них ≥ 10 на казахском.
- [ ] Ключ Claude отсутствует в бандле клиента и в истории git.
- [ ] Демо открывается по ссылке с телефона без установки.
