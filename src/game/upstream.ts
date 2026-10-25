// Polite access to third-party APIs: a circuit breaker per service, so that when a
// service refuses or fails we pause it instead of retrying on every page load.
// Breaker state is saved to the database, so a Render restart doesn't forget a pause.
//
// Rules (each service has its own breaker):
// - 429 "Daily ... limit exceeded"  → pause until 00:05 UTC, just after the daily quota resets
// - Retry-After header (any status) → wait exactly what the service asked, up to 24 hours
// - 429 "Hourly ... limit"          → pause until just after the next hour
// - 401 / 403 "you are blocked"     → 1st time: 1 hour; 2nd in a row: 1 day; 3rd: stop calling entirely
// - 5xx, other 429, timeouts, network errors → 1, 2, 4, 8 ... up to 60 minutes
// - 400 / 404 (bad request for one place) → no pause; the service itself is fine
// - any success → the breaker closes and every counter resets
// While a breaker is open, no request is sent to that service.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export interface BreakerState {
  name: string;
  until: number; // epoch ms; 0 = closed
  failures: number; // consecutive errors, drives exponential backoff
  strikes: number; // consecutive 401/403 refusals
  stopped: boolean; // after 3 refusals: no more calls until someone resets it
  reason: string;
}

type Persist = (s: BreakerState) => void;
let persist: Persist = () => {};
/** The weather module plugs in a database writer here. */
export function setBreakerPersistence(fn: Persist) {
  persist = fn;
}

export class Breaker {
  private until = 0;
  private failures = 0;
  private strikes = 0;
  private stopped = false;
  private reason = "";
  private loggedSkip = false;

  constructor(readonly name: string) {}

  load(s: Partial<BreakerState>) {
    this.until = s.until ?? 0;
    this.failures = s.failures ?? 0;
    this.strikes = s.strikes ?? 0;
    this.stopped = s.stopped ?? false;
    this.reason = s.reason ?? "";
  }

  state(): BreakerState {
    return { name: this.name, until: this.until, failures: this.failures, strikes: this.strikes, stopped: this.stopped, reason: this.reason };
  }

  isOpen(now = Date.now()): boolean {
    return this.stopped || now < this.until;
  }

  /** True while the service has refused us (401/403), so the UI can say "you are blocked". */
  isBlocked(now = Date.now()): boolean {
    return this.strikes > 0 && this.isOpen(now);
  }

  status(now = Date.now()) {
    return {
      open: this.isOpen(now),
      blocked: this.isBlocked(now),
      stopped: this.stopped,
      until: this.stopped ? null : this.until > now ? new Date(this.until).toISOString() : null,
      reason: this.reason,
      failures: this.failures,
      strikes: this.strikes,
    };
  }

  /** Human sentence for skipped calls. Logged once per pause, not once per skipped request. */
  skipNote(): string {
    if (!this.loggedSkip) {
      const when = this.stopped ? "calls stopped until reset" : `paused until ${new Date(this.until).toISOString().slice(11, 16)} UTC`;
      console.log(`[upstream] ${this.name} skipped: ${this.reason}; ${when}`);
      this.loggedSkip = true;
    }
    // The UI shows the resume time in your own time zone, so the note itself has no clock time.
    return this.stopped ? `${this.reason}; calls stopped` : `${this.reason}; paused`;
  }

  private changed() {
    this.loggedSkip = false;
    persist(this.state());
  }

  success() {
    if (this.failures || this.until || this.strikes || this.stopped) {
      console.log(`[upstream] ${this.name} recovered`);
      this.failures = 0;
      this.strikes = 0;
      this.until = 0;
      this.stopped = false;
      this.reason = "";
      this.changed();
    }
  }

  /** Owner-triggered reset (e.g. after a block has been lifted). */
  reset() {
    this.failures = 0;
    this.strikes = 0;
    this.until = 0;
    this.stopped = false;
    this.reason = "";
    console.log(`[upstream] ${this.name} reset by the player`);
    this.changed();
  }

  /** Returns false when the failure doesn't pause the service (400/404 for one place). */
  failure(status: number | null, retryAfter: string | null, body: string, now = Date.now()): boolean {
    if (status === 400 || status === 404) {
      console.warn(`[upstream] ${this.name} HTTP ${status}: bad request for this place; service not paused`);
      return false;
    }
    let wait: number;
    let reason: string;
    const ra = parseRetryAfter(retryAfter, now);
    if (status === 401 || status === 403) {
      this.strikes++;
      reason = `you are blocked (HTTP ${status})`;
      if (this.strikes >= 3) {
        this.stopped = true;
        wait = 0;
      } else {
        wait = this.strikes === 1 ? HOUR : DAY;
      }
      if (ra !== null && !this.stopped) wait = Math.max(wait, ra);
    } else if (status === 429 && /daily/i.test(body)) {
      const next = new Date(now);
      next.setUTCHours(24, 5, 0, 0);
      wait = next.getTime() - now;
      reason = "daily quota used up";
    } else if (ra !== null) {
      wait = ra;
      reason = `asked to come back later (HTTP ${status}, Retry-After)`;
    } else if (status === 429 && /hourly/i.test(body)) {
      wait = HOUR - (now % HOUR) + MIN;
      reason = "hourly quota used up";
    } else {
      this.failures++;
      wait = Math.min(60 * MIN, MIN * 2 ** (this.failures - 1));
      reason = status === 429 ? "rate limited" : status ? `server error (HTTP ${status})` : "no response";
    }
    this.until = this.stopped ? 0 : now + wait;
    this.reason = reason;
    console.warn(
      this.stopped
        ? `[upstream] ${this.name} ${reason} for the 3rd time in a row: calls stopped until reset`
        : `[upstream] ${this.name} paused for ${Math.round(wait / 1000)}s: ${reason}`,
    );
    this.changed();
    return true;
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (value.trim() !== "" && Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, DAY);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.min(date - now, DAY));
  return null;
}

/** Small TTL cache; also used as a negative cache for recent failures. */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  constructor(private max = 500) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V, ttlMs: number) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
  }
}

/** Collapses identical concurrent requests into one upstream call. */
export class InFlight<V> {
  private map = new Map<string, Promise<V>>();
  run(key: string, fn: () => Promise<V>): Promise<V> {
    const existing = this.map.get(key);
    if (existing) return existing;
    const p = fn().finally(() => this.map.delete(key));
    this.map.set(key, p);
    return p;
  }
}

/** Enforces a minimum gap between calls (Nominatim allows at most 1 request per second). */
export class Spacer {
  private next = 0;
  constructor(private gapMs: number) {}
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.gapMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}
