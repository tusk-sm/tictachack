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
TELEGRAM_INITDATA_MAX_AGE_SECONDS=86400
DATABASE_URL=postgres://user:pass@host:5432/dbname
```

### Описание

- `NEXT_PUBLIC_APP_URL` — базовый префикс приложения (например, `/games/tictachack`).
- `TELEGRAM_BOT_TOKEN` — обязательный токен бота для валидации `initData` и отправки уведомлений.
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

## История игр (Postgres)

При наличии `DATABASE_URL` автоматически создается таблица `game_history`, куда сохраняются:

- игроки (telegram id + имена),
- итог (победа / выход / дисконнект),
- счет,
- время начала и окончания партии.
