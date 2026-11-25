# AGENTS.md — frontend

Клиент «Сұрақ қой — Обыграй ИИ» (Órleu Hack 2026, кейс 3). Полное ТЗ: [`../docs/TZ.md`](../docs/TZ.md).
**Перед работой прочитай раздел 0 ТЗ** (статус этапов) и **раздел 1.1** (дизайн).

## Стек

React 19 · Vite · TypeScript · Tailwind CSS v4 (`@tailwindcss/vite`) · React Router 7 (`react-router`).
Пакетный менеджер — npm.

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173, запросы /api проксируются на http://localhost:8080
```

Бэкенд должен быть запущен (см. `../backend/AGENTS.md`).

## Структура

| Путь | Что |
|---|---|
| `src/App.tsx` | Маршруты. `RequireAuth` — только вошедшие, `GuestOnly` — только гости |
| `src/auth/api.ts` | `authApi` (login / register / me), `ApiError` (сообщение + ошибки полей), типы `User`, `Role` |
| `src/auth/AuthContext.tsx` | `AuthProvider` (хранит токен, проверяет его при запуске) |
| `src/auth/useAuth.ts` | `useAuth()` → `user`, `token`, `loading`, `signIn`, `signOut` |
| `src/api/` | `classes.ts` (классы, ученик), `texts.ts` (тексты учителя, библиотека, пакет), `admin.ts` (обзор). Всё через `request()` из `auth/api.ts` |
| `src/offline/` | Dexie v3: `db.ts` (профили учеников, тексты по классам, сессии, вопросы, очередь, диагностика, meta), `diagnostics.ts` (мини-диагностика: что пройти, проверка, отправка), `pack.ts` (докачка по `since`), `outbox.ts` (очередь отправки сессий), `profiles.ts` («Кто занимается?», PIN без сети) |
| `src/scoring/` | `heuristic.ts` — правила оценки (копия `HeuristicGrader.cs`), `points.ts` — очки, уровни, ранги |
| `src/pages/admin/` | `AdminHomePage`: сводка проекта, учителя, ученики, классы (только просмотр) |
| `src/pages/student/` | Главная (прогресс, тексты), чтение `/texts/:id`, сессия `/texts/:id/ask`, итог `/results/:id`, мини-диагностика `/diagnostic/:kind` — всё работает офлайн |
| `src/pages/teacher/` | Классы; класс (вкладки «Ученики» / «Навыки» / «Тексты»); профиль ученика `/teacher/students/:id`; редактор текста; библиотека. Грузятся лениво |
| `src/components/` | `Logo`, `AuthLayout`, `TextField`, `Button` (`primary` / `secondary`, `loading`), `RoleSwitch` |
| `src/pages/` | `LoginPage` («Кто занимается?», ученик по коду + PIN, учитель по email), `RegisterPage` (только учитель), `HomePage` (экран по роли) |
| `src/index.css` | Tailwind + тема (токены цветов и шрифт) |

## Дизайн

- Основа — Queezy UI Kit (ссылки и таблица экранов в ТЗ, раздел 1.1).
- Цвета только через токены темы: `bg-primary`, `text-primary`, `bg-primary-soft`, `text-ink`, `text-muted`, `border-line`, `bg-pink`, `bg-pink-soft`, `text-danger`. Не писать hex-цвета в компонентах.
- Шрифт Rubik (подключён в `index.html`).
- Логотип — только компонент `<Logo />` (ТЗ, раздел 1.2). Не рисовать свой вариант.
- Мобайл-фёрст: контент в `max-w-md`, работает от 360 px. Поля и кнопки `rounded-2xl`, нижний белый лист `rounded-t-[32px]`.
- Переиспользовать готовые компоненты. Новый общий компонент — в `src/components/`.

## Роли

`user.role`: `student` | `teacher` | `admin`. Главная `/` должна показывать свой экран для каждой роли (этап 2+). Роль `admin` не выбирается при регистрации.

## Правила

- Все запросы к API — через функции в `src/auth/api.ts` (позже — общий `src/api/`), с таймаутом. В компонентах `fetch` напрямую не вызывать.
- Ошибки: `ApiError.fields` показывать под полями (`TextField error=...`), `ApiError.message` — общей плашкой.
- Тексты интерфейса ученика — только через `useI18n().t('ключ')`: строка добавляется в `src/i18n/ru.ts` и `kk.ts` (TypeScript не даст забыть перевод). Ошибки сервера — через `err(message)`, даты — через `date(iso)`. Экраны учителя — `useTeacherI18n()` (`tt` — строки из `src/pages/teacher/i18n/`, чтобы не попадать в первую загрузку ученика). Админ — только на русском.
- Никаких ключей API во фронтенде. ИИ (OpenAI) вызывается только с бэка.
- Делать только текущий этап из ТЗ.

## Проверка перед коммитом

```bash
npm run build            # tsc + vite build без ошибок
npm run lint             # oxlint без ошибок
npm run test:heuristic   # правила оценки совпадают с бэкендом
```

PWA (Service Worker) работает только в сборке: `npm run build && npm run preview` (http://localhost:4173, `/api` проксируется).

## Коммиты

Пушит владелец репозитория. Сообщение коммита сначала показать ему на проверку.
