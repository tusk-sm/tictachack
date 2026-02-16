import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { registerBotChat } from '../../server/userRegistry';
import { getLeaders, getPlayerStats, type LeaderRow } from '../../server/gameHistory';
import { consumePendingRoomForUser, registerRoomInitiator } from '../../server/roomRegistry';

export const config = {
  api: {
    bodyParser: true,
  },
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  game_short_name?: string;
  inline_message_id?: string;
  from?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: {
      id: number;
    };
  };
};

type TelegramInlineQuery = {
  id: string;
  from?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  query?: string;
};

type TelegramChosenInlineResult = {
  from?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  inline_message_id?: string;
};

type TelegramMessage = {
  message_id: number;
  from?: {
    id: number;
  };
  chat: {
    id: number;
  };
  text?: string;
};

type TelegramUpdate = {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
  chosen_inline_result?: TelegramChosenInlineResult;
  message?: TelegramMessage;
};

const buildPublicOrigin = (req: NextApiRequest): string => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  if (!host) {
    return 'https://localhost';
  }
  return `${proto}://${host}`;
};

const normalizeBasePath = (basePath: string): string => {
  if (!basePath) return '';
  if (!basePath.startsWith('/')) return `/${basePath}`;
  return basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
};

const base64UrlEncode = (value: string): string =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const signAuthToken = (payload: object, secret: string): string => {
  const json = JSON.stringify(payload);
  const data = base64UrlEncode(json);
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64');
  const sigUrl = sig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${data}.${sigUrl}`;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (secret && headerSecret !== secret) {
    return res.status(401).json({ ok: false });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'missing_bot_token' });
  }

  const update = req.body as TelegramUpdate;

  const chosen = update?.chosen_inline_result;
  if (chosen?.inline_message_id && chosen.from?.id) {
    const from = chosen.from;
    const nickname = `${from.first_name || ''}${from.last_name ? ` ${from.last_name}` : ''}`.trim() || 'Игрок';
    registerRoomInitiator(chosen.inline_message_id, from.id, nickname);
    return res.status(200).json({ ok: true });
  }

  const inlineQuery = update?.inline_query;
  if (inlineQuery?.id) {
    await fetch(`https://api.telegram.org/bot${token}/answerInlineQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inline_query_id: inlineQuery.id,
        is_personal: true,
        cache_time: 0,
        switch_pm_text: 'Подключить уведомления',
        switch_pm_parameter: 'notifications',
        results: [
          {
            type: 'game',
            id: 'tictachack',
            game_short_name: 'tictachack',
          },
        ],
      }),
    });

    return res.status(200).json({ ok: true });
  }

  const message = update?.message;
  if (message?.chat?.id) {
    if (message.from?.id) {
      console.info('telegram message update: register bot chat', {
        fromId: message.from.id,
        chatId: message.chat.id,
        text: (message.text || '').slice(0, 64),
      });
      registerBotChat(message.from.id, String(message.chat.id));
    }

    const text = (message.text || '').trim();
    if (text === '/stats') {
      const telegramId = message.from?.id;
      if (!telegramId) {
        return res.status(200).json({ ok: true });
      }

      const stats = await getPlayerStats(telegramId);
      const reply = stats
        ? `Статистика:\nПобед: ${stats.wins}\nПоражений: ${stats.losses}\nВыходов: ${stats.leaves}\nДисконнектов: ${stats.disconnects}\nВсего игр: ${stats.total}`
        : 'Статистика недоступна (нет базы данных или нет сыгранных игр).';

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: reply,
        }),
      });

      return res.status(200).json({ ok: true });
    }

    if (text === '/leaders') {
      const leaders = await getLeaders(10);
      const reply = leaders && leaders.length
        ? `Лидеры (топ-10):\n${leaders.map((l: LeaderRow, i: number) => `${i + 1}. ${l.name}: ${l.wins} побед`).join('\n')}`
        : 'Лидеры недоступны (нет базы данных или нет сыгранных игр).';

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: reply,
        }),
      });

      return res.status(200).json({ ok: true });
    }

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: 'Я помогу начать матч. Нажми «Играть с другом», выбери чат — и отправь карточку игры сопернику.',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Играть с другом',
                switch_inline_query: '',
              },
            ],
          ],
        },
      }),
    });

    return res.status(200).json({ ok: true });
  }

  const cq = update?.callback_query;

  if (!cq || !cq.id) {
    return res.status(200).json({ ok: true });
  }

  const from = cq.from;

  if (!from?.id) {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: cq.id,
        text: 'Не удалось определить пользователя для запуска игры',
        show_alert: true,
      }),
    });

    return res.status(200).json({ ok: true });
  }

  const gameShortName = cq.game_short_name;
  const callbackData = (cq.data || '').trim();
  const isOpenGame = callbackData.startsWith('open_game:');
  if (!isOpenGame && gameShortName !== 'tictachack') {
    return res.status(200).json({ ok: true });
  }

  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const inlineMessageId = cq.inline_message_id;

  const roomIdFromOpen = isOpenGame ? callbackData.slice('open_game:'.length) : '';
  const pendingRoomId = !isOpenGame && from?.id ? consumePendingRoomForUser(from.id) : undefined;
  const roomId = roomIdFromOpen || pendingRoomId || inlineMessageId || (chatId && messageId ? `${chatId}_${messageId}` : '');

  if (!isOpenGame && gameShortName === 'tictachack' && from?.id && !pendingRoomId) {
    console.info('No pending roomId for sendGame callback, fallback to derived roomId', {
      fromId: from.id,
      hasInlineMessageId: Boolean(inlineMessageId),
      chatId,
      messageId,
    });
  }

  if (isOpenGame) {
    console.info('telegram open_game callback', {
      fromId: from.id,
      chatId,
      hasInlineMessageId: Boolean(inlineMessageId),
      roomId,
    });
  }

  if (!roomId) {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: cq.id,
        text: 'Не удалось определить идентификатор матча для запуска игры',
        show_alert: true,
      }),
    });

    return res.status(200).json({ ok: true });
  }

  const origin = process.env.PUBLIC_ORIGIN || buildPublicOrigin(req);
  const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_APP_URL || '');

  const authSecret = process.env.TELEGRAM_GAME_AUTH_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!authSecret) {
    return res.status(500).json({ ok: false, error: 'missing_auth_secret' });
  }

  const nickname = `${from.first_name || ''}${from.last_name ? ` ${from.last_name}` : ''}`.trim() || 'Игрок';
  const authToken = signAuthToken(
    {
      v: 1,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
      telegramId: from.id,
      nickname,
      username: from.username,
      roomId,
      chatId: chatId ? String(chatId) : undefined,
    },
    authSecret,
  );

  const url = chatId
    ? `${origin}${basePath}?room=${encodeURIComponent(roomId)}&chat_id=${encodeURIComponent(String(chatId))}&authToken=${encodeURIComponent(authToken)}`
    : `${origin}${basePath}?room=${encodeURIComponent(roomId)}&authToken=${encodeURIComponent(authToken)}`;

  const answerResp = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: cq.id,
      url,
    }),
  });

  if (!answerResp.ok) {
    const payload = await answerResp.text();
    console.error('answerCallbackQuery failed', { payload });

    // Попробуем показать пользователю явную ошибку.
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: cq.id,
        text: 'Не удалось открыть игру. Попробуй обновить чат с ботом и нажать кнопку ещё раз.',
        show_alert: true,
      }),
    });
  }

  if (isOpenGame) {
    return res.status(200).json({ ok: true });
  }

  return res.status(200).json({ ok: true });
}
