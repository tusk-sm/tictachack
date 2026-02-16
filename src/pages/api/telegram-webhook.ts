import type { NextApiRequest, NextApiResponse } from 'next';

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
  message?: {
    message_id: number;
    chat: {
      id: number;
    };
  };
};

type TelegramUpdate = {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
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
  const cq = update?.callback_query;

  if (!cq || !cq.id) {
    return res.status(200).json({ ok: true });
  }

  const gameShortName = cq.game_short_name;
  if (gameShortName !== 'tictachack') {
    return res.status(200).json({ ok: true });
  }

  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const inlineMessageId = cq.inline_message_id;

  const roomId = inlineMessageId || (chatId && messageId ? `${chatId}_${messageId}` : '');
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

  const url = chatId
    ? `${origin}${basePath}?room=${encodeURIComponent(roomId)}&chat_id=${encodeURIComponent(String(chatId))}`
    : `${origin}${basePath}?room=${encodeURIComponent(roomId)}`;

  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: cq.id,
      url,
    }),
  });

  return res.status(200).json({ ok: true });
}
