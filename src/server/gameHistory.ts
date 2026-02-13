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

async function getPool(): Promise<PgPoolLike | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
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
