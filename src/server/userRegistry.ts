type UserChatInfo = {
  botChatId?: string;
};

const registry = new Map<number, UserChatInfo>();

type PgPoolLike = {
  query: (query: string, params?: unknown[]) => Promise<unknown>;
};

const runtimeImport = new Function('moduleName', 'return import(moduleName);') as (
  moduleName: string,
) => Promise<{ Pool: new (options: { connectionString: string }) => PgPoolLike }>;

let pgPoolPromise: Promise<PgPoolLike> | null = null;
let schemaReady = false;

const TABLE = 'telegram_user_chat';

const getPool = async (): Promise<PgPoolLike | null> => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn('DATABASE_URL is missing; bot chat registry will be in-memory only');
    return null;
  }

  try {
    // validate URL early
    new URL(databaseUrl);
  } catch (error) {
    console.error('Invalid DATABASE_URL for userRegistry', { error });
    return null;
  }

  if (!pgPoolPromise) {
    pgPoolPromise = (async () => {
      const pgModule = await runtimeImport('pg');
      const Pool = pgModule.Pool;
      return new Pool({ connectionString: databaseUrl });
    })();
  }

  try {
    return await pgPoolPromise;
  } catch (error) {
    console.error('Failed to initialize pg pool for userRegistry', error);
    return null;
  }
};

const ensureSchema = async (pool: PgPoolLike): Promise<void> => {
  if (schemaReady) return;
  await pool.query(
    `
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      telegram_id BIGINT PRIMARY KEY,
      bot_chat_id TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    `,
  );
  schemaReady = true;
};

export function registerBotChat(telegramId: number, botChatId: string): void {
  const existing = registry.get(telegramId) || {};
  registry.set(telegramId, { ...existing, botChatId });

  void (async () => {
    const pool = await getPool();
    if (!pool) return;
    try {
      await ensureSchema(pool);
      await pool.query(
        `
        INSERT INTO ${TABLE} (telegram_id, bot_chat_id)
        VALUES ($1, $2)
        ON CONFLICT (telegram_id)
        DO UPDATE SET bot_chat_id = EXCLUDED.bot_chat_id, updated_at = now()
        `,
        [telegramId, botChatId],
      );
      console.info('Persisted bot chat id', { telegramId, botChatId });
    } catch (error) {
      console.error('Failed to persist bot chat id', { telegramId, error });
    }
  })();
}

export function getBotChatId(telegramId: number): string | undefined {
  return registry.get(telegramId)?.botChatId;
}

export async function getBotChatIdAsync(telegramId: number): Promise<string | undefined> {
  const cached = getBotChatId(telegramId);
  if (cached) return cached;

  const pool = await getPool();
  if (!pool) return undefined;

  try {
    await ensureSchema(pool);
    const result = (await pool.query(
      `SELECT bot_chat_id FROM ${TABLE} WHERE telegram_id = $1 LIMIT 1`,
      [telegramId],
    )) as unknown;

    const row = (result as { rows?: Array<{ bot_chat_id?: string }> })?.rows?.[0];
    const botChatId = row?.bot_chat_id;
    if (botChatId) {
      registerBotChat(telegramId, botChatId);
      console.info('Loaded bot chat id from DB', { telegramId, botChatId });
      return botChatId;
    }
  } catch (error) {
    console.error('Failed to load bot chat id from DB', { telegramId, error });
  }

  return undefined;
}
