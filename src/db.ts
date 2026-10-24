import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates.
pg.types.setTypeParser(1082, (v: string) => v);

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes("host=/");

export const pool = new pg.Pool({
  connectionString: url,
  ssl: isLocal ? undefined : { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 30_000,
});

export type Db = pg.Pool | pg.PoolClient;

/** Runs fn inside a transaction and always releases the client. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  xp              INT NOT NULL DEFAULT 0,
  gold            INT NOT NULL DEFAULT 0,
  gem_fundamental INT NOT NULL DEFAULT 0,
  gem_scenario    INT NOT NULL DEFAULT 0,
  gem_quiz        INT NOT NULL DEFAULT 0,
  tz              TEXT NOT NULL DEFAULT 'Europe/Rome',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (gold >= 0 AND gem_fundamental >= 0 AND gem_scenario >= 0 AND gem_quiz >= 0)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  block_id      TEXT NOT NULL,
  recall_done   BOOLEAN NOT NULL DEFAULT false,
  quiz_passed   BOOLEAN NOT NULL DEFAULT false,
  quiz_best     INT NOT NULL DEFAULT 0,
  scenario_done BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, block_id)
);

CREATE TABLE IF NOT EXISTS chapter_clears (
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter    INT NOT NULL,
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chapter)
);

CREATE TABLE IF NOT EXISTS inventory (
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item        TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item)
);

CREATE TABLE IF NOT EXISTS ledger (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  amount     INT NOT NULL,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_user_time ON ledger (user_id, created_at);

CREATE TABLE IF NOT EXISTS daily_events (
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day              DATE NOT NULL,
  weather          TEXT NOT NULL,
  code             INT,
  temp             REAL,
  place            TEXT NOT NULL,
  challenge_status TEXT NOT NULL DEFAULT 'none',
  encounters       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS runs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  questions   JSONB NOT NULL,
  idx         INT NOT NULL DEFAULT 0,
  correct     INT NOT NULL DEFAULT 0,
  wrong       INT NOT NULL DEFAULT 0,
  hearts      INT,
  score_you   INT NOT NULL DEFAULT 0,
  score_rival INT NOT NULL DEFAULT 0,
  hint_idx    INT,
  served_idx  INT,
  served_at   TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS runs_user_kind ON runs (user_id, kind, created_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lon DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS place TEXT;
ALTER TABLE daily_events ADD COLUMN IF NOT EXISTS teleports INT NOT NULL DEFAULT 0;
ALTER TABLE daily_events ADD COLUMN IF NOT EXISTS source TEXT;

CREATE TABLE IF NOT EXISTS moon_events (
  user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle     TEXT NOT NULL,
  kind      TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'started',
  attempts  INT NOT NULL DEFAULT 0,
  puzzle_id TEXT,
  PRIMARY KEY (user_id, cycle, kind)
);

CREATE TABLE IF NOT EXISTS encounters (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
}
