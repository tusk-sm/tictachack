import crypto from 'crypto';

type CacheEntry = {
  url: string | null;
  expiresAt: number;
};

const cache = new Map<number, CacheEntry>();

type TelegramApiResponse<T> = {
  ok: boolean;
  result: T;
};

type TelegramUserProfilePhotos = {
  total_count: number;
  photos: Array<Array<{ file_id: string }>>;
};

type TelegramFile = {
  file_path?: string;
};

const base64UrlEncode = (value: string): string =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

export async function getTelegramAvatarUrl(telegramId: number): Promise<string | undefined> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return undefined;

  const now = Date.now();
  const cached = cache.get(telegramId);
  if (cached && cached.expiresAt > now) {
    return cached.url || undefined;
  }

  try {
    const photosResp = await fetch(`https://api.telegram.org/bot${token}/getUserProfilePhotos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: telegramId, limit: 1 }),
    });

    if (!photosResp.ok) {
      cache.set(telegramId, { url: null, expiresAt: now + 10 * 60 * 1000 });
      return undefined;
    }

    const photosJson = (await photosResp.json()) as unknown;
    const photosPayload = photosJson as Partial<TelegramApiResponse<TelegramUserProfilePhotos>>;
    const fileId: string | undefined = photosPayload.result?.photos?.[0]?.slice(-1)?.[0]?.file_id;
    if (!fileId) {
      cache.set(telegramId, { url: null, expiresAt: now + 10 * 60 * 1000 });
      return undefined;
    }

    const fileResp = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });

    if (!fileResp.ok) {
      cache.set(telegramId, { url: null, expiresAt: now + 10 * 60 * 1000 });
      return undefined;
    }

    const fileJson = (await fileResp.json()) as unknown;
    const filePayload = fileJson as Partial<TelegramApiResponse<TelegramFile>>;
    const filePath: string | undefined = filePayload.result?.file_path;
    if (!filePath) {
      cache.set(telegramId, { url: null, expiresAt: now + 10 * 60 * 1000 });
      return undefined;
    }

    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;

    const ttl = 60 * 60 * 1000;
    cache.set(telegramId, { url, expiresAt: now + ttl });

    return url;
  } catch {
    cache.set(telegramId, { url: null, expiresAt: now + 5 * 60 * 1000 });
    return undefined;
  }
}

export function makeRoomToken(roomId: string): string {
  const secret = process.env.TELEGRAM_GAME_AUTH_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const data = base64UrlEncode(JSON.stringify({ roomId, t: Date.now() }));
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${data}.${sig}`;
}
