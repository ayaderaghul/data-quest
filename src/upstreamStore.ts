import { pool } from "./db.js";
import type { UpstreamStore } from "./game/weather.js";

/** Postgres-backed storage for API pauses and MET Norway cache entries. */
export const pgUpstreamStore: UpstreamStore = {
  async loadBreakers() {
    const { rows } = await pool.query("SELECT name, until, failures, strikes, stopped, reason FROM upstream_state");
    return rows.map((r) => ({
      name: r.name, until: r.until ? new Date(r.until).getTime() : 0,
      failures: r.failures, strikes: r.strikes, stopped: r.stopped, reason: r.reason,
    }));
  },
  async saveBreaker(s) {
    await pool.query(
      `INSERT INTO upstream_state (name, until, failures, strikes, stopped, reason, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (name) DO UPDATE SET until = EXCLUDED.until, failures = EXCLUDED.failures, strikes = EXCLUDED.strikes,
         stopped = EXCLUDED.stopped, reason = EXCLUDED.reason, updated_at = now()`,
      [s.name, s.until ? new Date(s.until) : null, s.failures, s.strikes, s.stopped, s.reason],
    );
  },
  async getMet(url) {
    const { rows } = await pool.query("SELECT reading, expires, last_modified FROM met_cache WHERE url = $1", [url]);
    if (!rows[0]) return null;
    return { reading: rows[0].reading, expires: new Date(rows[0].expires).getTime(), lastModified: rows[0].last_modified };
  },
  async putMet(url, e) {
    await pool.query(
      `INSERT INTO met_cache (url, reading, expires, last_modified, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (url) DO UPDATE SET reading = EXCLUDED.reading, expires = EXCLUDED.expires,
         last_modified = EXCLUDED.last_modified, updated_at = now()`,
      [url, JSON.stringify(e.reading), new Date(e.expires), e.lastModified],
    );
  },
};
