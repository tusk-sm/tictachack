import crypto from 'crypto';
import { getBotChatId } from './userRegistry';

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

export async function notifyOpponentJoined(roomChatId: string | undefined, nickname: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !roomChatId) {
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: roomChatId,
        text: `Соперник (${nickname}) присоединился к игре. Можно начинать!`,
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      console.error('Failed to send Telegram notification:', payload);
    }
  } catch (error) {
    console.error('Telegram notification error:', error);
  }
}

export async function sendOpenGameButtonToUser(telegramId: number, roomId: string, nickname: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = getBotChatId(telegramId);
  if (!token || !chatId) {
    return;
  }

  const origin = process.env.PUBLIC_ORIGIN;
  if (!origin) {
    return;
  }

  const basePathRaw = process.env.NEXT_PUBLIC_APP_URL || '';
  const basePath = basePathRaw.endsWith('/') && basePathRaw !== '/' ? basePathRaw.slice(0, -1) : basePathRaw;

  const authSecret = process.env.TELEGRAM_GAME_AUTH_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!authSecret) {
    return;
  }

  const authToken = signAuthToken(
    {
      v: 1,
      exp: Math.floor(Date.now() / 1000) + 10 * 60,
      telegramId,
      nickname,
      roomId,
    },
    authSecret,
  );

  const url = `${origin}${basePath}?room=${encodeURIComponent(roomId)}&authToken=${encodeURIComponent(authToken)}`;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'Соперник присоединился. Открой игру, чтобы начать матч:',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Открыть игру',
                url,
              },
            ],
          ],
        },
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      console.error('Failed to send open-game button:', payload);
    }
  } catch (error) {
    console.error('Telegram open-game error:', error);
  }
}
