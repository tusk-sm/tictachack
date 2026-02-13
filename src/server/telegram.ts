import crypto from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface TelegramAuthResult {
  isValid: boolean;
  user?: TelegramUser;
  authDate?: number;
  chatInstance?: string;
  startParam?: string;
  reason?: string;
}

const MAX_AUTH_AGE_SECONDS = Number(process.env.TELEGRAM_INITDATA_MAX_AGE_SECONDS || 86400);

function parseInitData(initData: string): Map<string, string> {
  const data = new URLSearchParams(initData);
  const map = new Map<string, string>();

  data.forEach((value, key) => {
    map.set(key, value);
  });

  return map;
}

export function validateTelegramInitData(initData: string): TelegramAuthResult {
  if (!initData) {
    return { isValid: false, reason: 'missing_init_data' };
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { isValid: false, reason: 'missing_bot_token' };
  }

  const parsed = parseInitData(initData);
  const receivedHash = parsed.get('hash');
  if (!receivedHash) {
    return { isValid: false, reason: 'missing_hash' };
  }

  parsed.delete('hash');

  const dataCheckString = Array.from(parsed.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  if (expectedHash !== receivedHash) {
    return { isValid: false, reason: 'invalid_hash' };
  }

  const authDateRaw = parsed.get('auth_date');
  const authDate = authDateRaw ? Number(authDateRaw) : undefined;
  if (!authDate || Number.isNaN(authDate)) {
    return { isValid: false, reason: 'invalid_auth_date' };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > MAX_AUTH_AGE_SECONDS) {
    return { isValid: false, reason: 'expired_auth_date' };
  }

  const userRaw = parsed.get('user');
  if (!userRaw) {
    return { isValid: false, reason: 'missing_user' };
  }

  try {
    const user = JSON.parse(userRaw) as TelegramUser;
    if (!user?.id || !user?.first_name) {
      return { isValid: false, reason: 'invalid_user' };
    }

    return {
      isValid: true,
      user,
      authDate,
      chatInstance: parsed.get('chat_instance') ?? undefined,
      startParam: parsed.get('start_param') ?? undefined,
    };
  } catch {
    return { isValid: false, reason: 'malformed_user' };
  }
}
