# Развёртывание «Первый коммит»

## 0. Что нужно

- Токен бота MAX (от организаторов).
- Для постоянной работы — VPS в России: Ubuntu 22.04/24.04, 1 vCPU, 1 ГБ RAM, 10 ГБ диска, публичный IP, открытые порты 80 и 443.
- Домен не нужен: адрес вида `https://1-2-3-4.sslip.io` работает с бесплатным сертификатом Let's Encrypt.

> Cloudflare-туннель (`--profile tunnel`) из России открывается только через VPN — для жюри и пользователей он не подходит. Используйте только для отладки.

---

## A. Развёртывание на VPS (основной вариант)

### 1. Установить Docker

```bash
ssh root@<IP>
curl -fsSL https://get.docker.com | sh
docker compose version        # должна быть v2.x
```

Если `get.docker.com` недоступен, используйте пакет из репозитория Ubuntu: `apt update && apt install -y docker.io docker-compose-v2`.

### 2. Открыть порты

```bash
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

В панели хостинга проверить, что 80 и 443 не закрыты внешним файрволом.

### 3. Загрузить проект

```bash
mkdir -p /opt && cd /opt
# вариант 1: из репозитория
git clone <URL репозитория> firstcommit
# вариант 2: из архива (с локального компьютера)
#   scp firstcommit-<hash>.zip root@<IP>:/opt/  →  apt install -y unzip && unzip firstcommit-<hash>.zip -d firstcommit
cd firstcommit
```

### 4. Настроить окружение

```bash
cp .env.example .env
nano .env
```

Обязательно: `MAX_BOT_TOKEN=<токен>`. Желательно: `POSTGRES_PASSWORD=<случайный пароль>`, `SESSION_SECRET=<случайная строка>` (`openssl rand -hex 32`). `ALLOW_DEV_AUTH` оставить `false`.

### 5. Запустить

```bash
export SITE_ADDRESS=$(curl -s https://ipv4.icanhazip.com | tr . -).sslip.io
echo $SITE_ADDRESS                                   # например 1-2-3-4.sslip.io
echo "SITE_ADDRESS=$SITE_ADDRESS" >> .env            # чтобы переживало перезапуски
docker compose -f compose.yaml -f compose.vps.yaml up -d --build
```

Сборка занимает около минуты.

### 6. Проверить

```bash
docker compose ps                                    # api — healthy, остальные — running
curl -s https://$SITE_ADDRESS/api/health             # {"ok":true}
docker compose logs bot | grep "Бот запущен"         # ник бота
docker compose logs worker | grep "сохранено"        # 3 источника (trudvsem — через 1–2 мин)
docker compose logs web | grep -i certificate        # сертификат получен
```

Открыть `https://<SITE_ADDRESS>` в браузере телефона без VPN. Вне MAX приложение покажет «Откройте приложение из чат-бота в MAX» — это правильно.

### 7. Привязать мини-приложение к боту

Передать организаторам (или сделать самим при доступе): платформа MAX для партнёров → «Чат-боты» → бот → ⋮ → «Настройки» → URL мини-приложения = `https://<SITE_ADDRESS>` → вид кнопки «Открыть» → «Сохранить».

### 8. Проверить в MAX (мобильная и веб-версия)

1. Открыть бота → «Начать» → пройти 3 шага.
2. «🔥 Топ-3 прямо здесь» → «⭐ Отслеживать».
3. «🚀 Открыть подборку» → откроется мини-приложение.
4. `docker compose restart worker` → в чат придёт напоминание о дедлайне отслеживаемой программы (если до дедлайна ≤ 7 дней) → «Открыть карточку» откроет её в мини-приложении.

---

## B. Локальный запуск (разработка)

```bash
cp .env.example .env            # MAX_BOT_TOKEN, ALLOW_DEV_AUTH=true для входа в браузере
docker compose up -d --build
```

- Мини-приложение: http://localhost:8080 (демо-пользователь).
- Карточка по диплинку: http://localhost:8080/?startapp=i1
- Тесты: `cd backend && npm ci && npm test`
- Без Docker: `docker compose up -d db`, затем в `backend/`: `npm ci && npm run dev:api` (и `dev:bot`, `dev:worker` в других терминалах); в `miniapp/`: `npm ci && npm run dev` (http://localhost:5173, `/api` проксируется на 3000). Для этого в `compose.yaml` временно пробросьте порт БД `5432:5432`.

---

## C. Обслуживание

| Задача | Команда (на VPS добавлять `-f compose.yaml -f compose.vps.yaml`) |
|---|---|
| Логи | `docker compose logs -f api bot worker` |
| Обновить код | `git pull && docker compose ... up -d --build` |
| Перезапуск | `docker compose ... restart` |
| Остановить | `docker compose ... stop` |
| Удалить с данными | `docker compose ... down -v` |
| Принудительно собрать данные | `docker compose ... exec worker node dist/main.js parse-once` |
| Бэкап БД | `docker compose exec db pg_dump -U firstcommit firstcommit > backup.sql` |

---

## D. Частые проблемы

| Симптом | Причина и решение |
|---|---|
| `bot` перезапускается, в логах `MAX_BOT_TOKEN не задан` | Не заполнен `.env` |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` при запросах к MAX | Нет сертификата Минцифры — он в `infra/certs`, проверьте, что образ собран из этого репозитория (`NODE_EXTRA_CA_CERTS`) |
| Кнопка «Открыть подборку» ничего не делает | URL мини-приложения не привязан к боту (шаг A.7) |
| Мини-приложение: «Откройте приложение из чат-бота в MAX» | Открыто в браузере, а не в MAX — ожидаемо. Для отладки — `ALLOW_DEV_AUTH=true` |
| Мини-приложение: «Неверная подпись initData» | Токен в `.env` не от того бота, к которому привязано мини-приложение |
| Сертификат не выпускается | Закрыты порты 80/443 или `SITE_ADDRESS` не совпадает с IP сервера |
| «Работа России: 0 записей» в первые минуты | Их API отвечает 10–15 с на запрос; сбор занимает 1–2 минуты. При недоступности берётся снимок |
| Порт 8080 занят (локально) | `WEB_PORT=8081` в `.env` |
