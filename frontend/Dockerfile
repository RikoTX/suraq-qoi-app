# Фронтенд «Сұрақ қой»: сборка PWA и Caddy, который отдаёт её и пересылает /api на бэкенд (ТЗ, 13).
# Caddyfile подключается из backend/deploy/Caddyfile.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /src/dist /srv
