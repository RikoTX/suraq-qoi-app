# Деплой на сервер (ТЗ, 13)

Три контейнера: **Caddy** (HTTPS, фронтенд, `/api` → API), **API** (.NET 9), **PostgreSQL 17**.
Наружу открыты только 80 и 443. Миграции базы применяются сами при старте API.

## 1. Сервер

VPS 2 vCPU / 4 GB / Ubuntu 22.04+. От имени root:

```bash
curl -fsSL https://get.docker.com | sh
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
git clone https://github.com/RikoTX/suraq-qoi-app.git && cd suraq-qoi-app
```

## 2. Настройки

```bash
cp backend/deploy/.env.example backend/deploy/.env
nano backend/deploy/.env
```

- `DOMAIN` — без своего домена: IP через дефис + `.sslip.io` (сервер `1.2.3.4` → `1-2-3-4.sslip.io`).
- `POSTGRES_PASSWORD`, `JWT_SECRET` — `openssl rand -hex 24` и `openssl rand -hex 32`.
- `OPENAI_API_KEY` — ключ Groq. Без него вопросы остаются «ждут проверки ИИ».
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — администратор, создаётся при первом запуске.

## 3. Запуск

```bash
docker compose -f backend/deploy/docker-compose.yml up -d --build
curl https://$DOMAIN/health          # {"status":"ok"}
```

Первая сборка — 3–5 минут. Сертификат Let's Encrypt Caddy получает сам за несколько секунд
(порты 80 и 443 должны быть открыты, домен — указывать на сервер).

## 4. Данные

Команды API запускаются так же, как `dotnet run -- …` локально:

```bash
C="docker compose -f backend/deploy/docker-compose.yml"

# Библиотека текстов: выгрузить с машины, где она есть (локально: cd backend && dotnet run -- export-texts library.json),
# и загрузить на сервер. Повторная загрузка не создаёт дублей.
$C run --rm -v "$PWD/library.json:/tmp/library.json:ro" api import-texts /tmp/library.json

# Или сгенерировать на сервере (нужен ключ):
$C run --rm api generate-texts --lang kk --topic local --kind schedule --difficulty 2 --count 5

# Демо-класс «8А (демо)» для показа жюри (нужны русские тексты в библиотеке):
$C run --rm api seed-demo
```

## Обновление и обслуживание

```bash
git pull && $C up -d --build                                    # новая версия
$C logs -f api                                                  # логи (без текста вопросов и имён)
$C exec postgres pg_dump -U suraqqoi suraqqoi > backup-$(date +%F).sql   # резервная копия
```

Ученики получат новую версию приложения при следующем открытии: `index.html` и Service Worker
отдаются с `Cache-Control: no-cache`, файлы из `/assets/` кешируются навсегда (в имени — хеш).

## Проверка на своей машине

`DOMAIN=localhost` в `.env` — Caddy выдаст собственный сертификат (`curl -k https://localhost/health`).
Порты 80 и 443 должны быть свободны.
