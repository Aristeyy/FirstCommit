# Сборка статики мини-приложения и раздача через Caddy (он же проксирует /api на backend)
FROM node:22-alpine AS build
WORKDIR /app
COPY miniapp/package.json miniapp/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY miniapp/ ./
RUN npm run build

FROM caddy:2-alpine
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv