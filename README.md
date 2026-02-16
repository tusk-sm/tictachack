# Tic-Tac-Toe Infinite (Telegram Games)

Игра «5 в ряд» (крестики-нолики на бесконечном поле) для платформы Telegram Games.

## Что реализовано

- Авторизация через `Telegram WebApp initData` с серверной валидацией подписи.
- Реальные профили игроков (имя/username/аватар) из Telegram.
- Матч создается автоматически по `roomId`, который передает бот в URL запуска.
- Уведомление в чат бота при подключении соперника (если передан `chat_id`).
- Сохранение истории игр в Postgres (если есть `DATABASE_URL`).
- Локальный запуск без Postgres работает (история просто не сохраняется).

## Переменные окружения

Пример значений:

```bash
NEXT_PUBLIC_APP_URL=
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
TELEGRAM_WEBHOOK_SECRET=some-random-secret
PUBLIC_ORIGIN=https://ai.nnov.ru
TELEGRAM_INITDATA_MAX_AGE_SECONDS=86400
DATABASE_URL=postgres://user:pass@host:5432/dbname
```

### Описание

- `NEXT_PUBLIC_APP_URL` — базовый префикс приложения (например, `/games/tictachack`).
- `TELEGRAM_BOT_TOKEN` — обязательный токен бота для валидации `initData` и отправки уведомлений.
- `TELEGRAM_WEBHOOK_SECRET` — секрет для проверки запросов Telegram webhook (заголовок `X-Telegram-Bot-Api-Secret-Token`).
- `PUBLIC_ORIGIN` — публичный origin, который бот будет отдавать в `answerCallbackQuery.url` (например `https://ai.nnov.ru`).
- `TELEGRAM_INITDATA_MAX_AGE_SECONDS` — срок жизни `auth_date` для Telegram initData.
- `DATABASE_URL` — опционально; если не задан, запись истории игр отключается.

## Запуск

```bash
npm install
npm run dev
```

Приложение запускается на `http://localhost:3001`.

## Флоу Telegram Games

1. Бот открывает игру по URL вида:

   `https://your-domain/<base>?room=<roomId>&chat_id=<telegramChatId>`

2. Первый игрок попадает в ожидание соперника.
3. Второй игрок открывает тот же `roomId`, игра стартует автоматически.
4. Сервер отправляет `sendMessage` в чат о подключении соперника (если есть `chat_id`).

## Telegram Game: настройка Play-кнопки (обязательно)

Для Telegram HTML5 Games кнопка `Play` **не открывает URL сама**. Telegram отправляет боту `callback_query` с `game_short_name`, а бот должен ответить `answerCallbackQuery` и передать `url`.

В этом проекте это реализовано webhook-эндпоинтом:

`POST <PUBLIC_ORIGIN><NEXT_PUBLIC_APP_URL>/api/telegram-webhook`

### Настройка webhook

1. Убедись, что заданы env:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `PUBLIC_ORIGIN`

2. Вызови `setWebhook`:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://ai.nnov.ru/games/tictachack_tg/api/telegram-webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

После этого нажатие `Play` по игре с `game_short_name=tictachack` будет открывать:

`<PUBLIC_ORIGIN><NEXT_PUBLIC_APP_URL>?room=<chatId>_<messageId>&chat_id=<chatId>`

## История игр (Postgres)

При наличии `DATABASE_URL` автоматически создается таблица `game_history`, куда сохраняются:

- игроки (telegram id + имена),
- итог (победа / выход / дисконнект),
- счет,
- время начала и окончания партии.
