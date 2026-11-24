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
| `src/components/` | `Logo`, `AuthLayout`, `TextField`, `Button` (`primary` / `secondary`, `loading`), `RoleSwitch` |
| `src/pages/` | `LoginPage`, `RegisterPage`, `HomePage` (заглушка «Вы вошли как …») |
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
- Тексты интерфейса — на русском (казахский через i18n позже).
- Никаких ключей API во фронтенде. Claude вызывается только с бэка.
- Делать только текущий этап из ТЗ.

## Проверка перед коммитом

```bash
npm run build      # tsc + vite build без ошибок
npm run lint       # oxlint без ошибок
```

## Коммиты

Пушит владелец репозитория. Сообщение коммита сначала показать ему на проверку.
