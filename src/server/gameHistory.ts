import { GameState } from '../types/game';

type PgPoolLike = {
  query: (query: string, params?: unknown[]) => Promise<unknown>;
};

let pgPoolPromise: Promise<PgPoolLike> | null = null;
let schemaReady = false;

const HISTORY_TABLE = 'game_history';

const runtimeImport = new Function('moduleName', 'return import(moduleName);') as (
  moduleName: string,
) => Promise<{ Pool: new (options: { connectionString: string }) => PgPoolLike }>;

const maskDatabaseUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = '*****';
    }
    return url.toString();
  } catch {
    return 'invalid-url';
  }
};

async function getPool(): Promise<PgPoolLike | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  try {
    // Ранняя проверка на корректность URL (в т.ч. percent-encoding пароля).
    // pg внутри использует URL-парсер Node.js и упадёт с TypeError: Invalid URL.
    // Пример частой ошибки: пароль содержит символ '%' не в формате '%25' или '%XX'.
    // postgres://user:pa%ss@host:5432/db  -> INVALID
    // postgres://user:pa%25ss@host:5432/db -> OK
    new URL(databaseUrl);
  } catch (error) {
    console.error('Invalid DATABASE_URL for Postgres:', {
      databaseUrl: maskDatabaseUrl(databaseUrl),
      hint: 'Проверь URL-encoding пароля: символ % должен быть %25, @ -> %40, : -> %3A, / -> %2F и т.д.',
      error,
    });
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
    console.error('Failed to create PG pool:', error);
    return null;
  }
}

async function ensureSchema(pool: PgPoolLike): Promise<void> {
  if (schemaReady) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      room_id TEXT NOT NULL,
      attacker_telegram_id BIGINT,
      defender_telegram_id BIGINT,
      attacker_name TEXT,
      defender_name TEXT,
      winner_symbol TEXT,
      end_reason TEXT NOT NULL,
      attacker_score INTEGER NOT NULL DEFAULT 0,
      defender_score INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  schemaReady = true;
}

export async function saveGameHistory(game: GameState, roomId: string, endReason: string): Promise<void> {
  if (game.historySaved) {
    return;
  }

  const pool = await getPool();
  if (!pool) {
    return;
  }

  try {
    await ensureSchema(pool);

    await pool.query(
      `
      INSERT INTO ${HISTORY_TABLE} (
        room_id,
        attacker_telegram_id,
        defender_telegram_id,
        attacker_name,
        defender_name,
        winner_symbol,
        end_reason,
        attacker_score,
        defender_score,
        started_at,
        finished_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        roomId,
        game.players.attacker?.telegramId ?? null,
        game.players.defender?.telegramId ?? null,
        game.players.attacker?.nickname ?? null,
        game.players.defender?.nickname ?? null,
        game.winner,
        endReason,
        game.players.attacker?.score ?? 0,
        game.players.defender?.score ?? 0,
        game.createdAt ? new Date(game.createdAt) : null,
        game.finishedAt ? new Date(game.finishedAt) : new Date(),
      ],
    );

    game.historySaved = true;
  } catch (error) {
    console.error('Failed to save game history:', error);
  }
}

export type PlayerStats = {
  wins: number;
  losses: number;
  leaves: number;
  disconnects: number;
  total: number;
};

type PlayerStatsRow = {
  wins: string | number | null;
  losses: string | number | null;
  leaves: string | number | null;
  disconnects: string | number | null;
  total: string | number | null;
};

export async function getPlayerStats(telegramId: number): Promise<PlayerStats | null> {
  const pool = await getPool();
  if (!pool) {
    return null;
  }

  try {
    await ensureSchema(pool);
    const result = (await pool.query(
      `
      SELECT
        SUM(CASE WHEN end_reason = 'win' AND winner_symbol IS NOT NULL
          AND (
            (winner_symbol = 'X' AND attacker_telegram_id = $1) OR
            (winner_symbol = 'O' AND defender_telegram_id = $1)
          ) THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN end_reason = 'win' AND winner_symbol IS NOT NULL
          AND (
            (winner_symbol = 'X' AND attacker_telegram_id = $1) OR
            (winner_symbol = 'O' AND defender_telegram_id = $1)
          ) THEN 0
          WHEN end_reason = 'win' AND (attacker_telegram_id = $1 OR defender_telegram_id = $1) THEN 1
          ELSE 0 END) AS losses,
        SUM(CASE WHEN end_reason = 'leave' AND (attacker_telegram_id = $1 OR defender_telegram_id = $1) THEN 1 ELSE 0 END) AS leaves,
        SUM(CASE WHEN end_reason = 'disconnect' AND (attacker_telegram_id = $1 OR defender_telegram_id = $1) THEN 1 ELSE 0 END) AS disconnects,
        SUM(CASE WHEN attacker_telegram_id = $1 OR defender_telegram_id = $1 THEN 1 ELSE 0 END) AS total
      FROM ${HISTORY_TABLE}
      `,
      [telegramId],
    )) as unknown;

    const row = (result as { rows?: PlayerStatsRow[] })?.rows?.[0];
    if (!row) return null;
    return {
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
      leaves: Number(row.leaves || 0),
      disconnects: Number(row.disconnects || 0),
      total: Number(row.total || 0),
    };
  } catch (error) {
    console.error('Failed to get player stats:', error);
    return null;
  }
}

export type LeaderRow = {
  telegramId: number;
  name: string;
  wins: number;
};

type LeaderDbRow = {
  telegram_id: string | number;
  name: string;
  wins: string | number | null;
};

export async function getLeaders(limit: number): Promise<LeaderRow[] | null> {
  const pool = await getPool();
  if (!pool) {
    return null;
  }

  try {
    await ensureSchema(pool);
    const result = (await pool.query(
      `
      WITH wins AS (
        SELECT attacker_telegram_id AS telegram_id, COALESCE(attacker_name, 'Игрок') AS name, COUNT(*) AS wins
        FROM ${HISTORY_TABLE}
        WHERE end_reason = 'win' AND winner_symbol = 'X' AND attacker_telegram_id IS NOT NULL
        GROUP BY attacker_telegram_id, attacker_name
        UNION ALL
        SELECT defender_telegram_id AS telegram_id, COALESCE(defender_name, 'Игрок') AS name, COUNT(*) AS wins
        FROM ${HISTORY_TABLE}
        WHERE end_reason = 'win' AND winner_symbol = 'O' AND defender_telegram_id IS NOT NULL
        GROUP BY defender_telegram_id, defender_name
      )
      SELECT telegram_id, name, SUM(wins) AS wins
      FROM wins
      GROUP BY telegram_id, name
      ORDER BY SUM(wins) DESC
      LIMIT $1
      `,
      [limit],
    )) as unknown;

    const rows = (result as { rows?: LeaderDbRow[] })?.rows || [];
    return rows.map((r) => ({
      telegramId: Number(r.telegram_id),
      name: String(r.name),
      wins: Number(r.wins || 0),
    }));
  } catch (error) {
    console.error('Failed to get leaders:', error);
    return null;
  }
}
