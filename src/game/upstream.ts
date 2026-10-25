// Polite access to third-party APIs: a circuit breaker per source, so that when a
// service refuses or fails we back off instead of retrying on every page load.
//
// Rules:
// - 429 with Retry-After            → wait exactly what the server asked
// - 429 "Daily ... limit exceeded"   → wait until 00:05 UTC (Open-Meteo resets daily quotas)
// - 429 "Hourly ... limit"           → wait until the next hour
// - 429 "Minutely ... limit" / other → wait 1 minute, doubling on repeats
// - 403 / 401                        → wait 6 hours (we're blocked or misidentified; hammering won't help)
// - 5xx, timeout, network error      → exponential backoff: 1, 2, 4, 8 ... capped at 30 minutes
// - any success                      → breaker closes, backoff resets
// While a breaker is open the source is skipped entirely: no request is sent.

const MIN = 60_000;
const HOUR = 60 * MIN;

export class Breaker {
  private until = 0;
  private failures = 0;
  private reason = "";
  private loggedSkip = false;

  constructor(readonly name: string) {}

  isOpen(now = Date.now()): boolean {
    return now < this.until;
  }

  status() {
    return { open: this.isOpen(), until: this.until ? new Date(this.until).toISOString() : null, reason: this.reason, failures: this.failures };
  }

  /** One log line per cooldown, not one per skipped request. */
  skipNote(): string {
    const note = `cooling down until ${new Date(this.until).toISOString().slice(11, 16)} UTC (${this.reason})`;
    if (!this.loggedSkip) {
      console.log(`[upstream] ${this.name} skipped: ${note}`);
      this.loggedSkip = true;
    }
    return note;
  }

  success() {
    if (this.failures || this.until) console.log(`[upstream] ${this.name} recovered`);
    this.failures = 0;
    this.until = 0;
    this.reason = "";
  }

  failure(status: number | null, retryAfter: string | null, body: string, now = Date.now()) {
    this.failures++;
    const backoff = Math.min(30 * MIN, MIN * 2 ** (this.failures - 1));
    let wait: number;
    let reason: string;
    const ra = parseRetryAfter(retryAfter, now);
    if (status === 429 && ra !== null) {
      wait = ra;
      reason = "rate limited (Retry-After)";
    } else if (status === 429 && /daily/i.test(body)) {
      const next = new Date(now);
      next.setUTCHours(24, 5, 0, 0);
      wait = next.getTime() - now;
      reason = "daily quota used up";
    } else if (status === 429 && /hourly/i.test(body)) {
      wait = HOUR - (now % HOUR) + MIN;
      reason = "hourly quota used up";
    } else if (status === 429) {
      wait = backoff;
      reason = "rate limited";
    } else if (status === 401 || status === 403) {
      wait = 6 * HOUR;
      reason = `refused (HTTP ${status})`;
    } else {
      wait = backoff;
      reason = status ? `HTTP ${status}` : "no response";
    }
    this.until = now + wait;
    this.reason = reason;
    this.loggedSkip = false;
    console.warn(`[upstream] ${this.name} breaker open for ${Math.round(wait / 1000)}s: ${reason}`);
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 24 * HOUR);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, Math.min(date - now, 24 * HOUR));
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
