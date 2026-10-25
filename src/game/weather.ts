import type { Db } from "../db.js";
import { localDay } from "./util.js";
import { Breaker, InFlight, Spacer, TtlCache, setBreakerPersistence, type BreakerState } from "./upstream.js";

export type Weather = "sunny" | "cloudy" | "rain" | "snow" | "storm" | "fog";

export const WEATHER_INFO: Record<Weather, { label: string; effect: string }> = {
  sunny: { label: "Sunny", effect: "+10% gold when you mint gems at the Royal Mint." },
  cloudy: { label: "Cloudy", effect: "Steady day: +10% XP on everything." },
  rain: { label: "Rainy", effect: "Gem drizzle: each gem you earn has a 20% chance to drop a bonus gem." },
  snow: { label: "Snowy", effect: "Frozen Cache: review 5 old questions for bonus gems." },
  storm: { label: "Storm", effect: "Storm challenge: 5 timed questions from every chapter you've studied." },
  fog: { label: "Fog", effect: "Mystery fog: quiz gems are doubled, but hints are disabled." },
};

export const TELEPORT_COST = 25;

/** WMO weather codes, as returned by Open-Meteo. */
export function weatherFromCode(code: number): Weather {
  if (code <= 1) return "sunny";
  if (code <= 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  return "cloudy";
}

// MET Norway and Nominatim both require an identifying User-Agent.
const UA = "data-quest/1.0 (github.com/ayaderaghul/data-quest)";

type Reading = { weather: Weather; code: number | null; temp: number | null; source: string };

export interface Attempt {
  source: string;
  ok: boolean;
  status: number | null; // HTTP status, null if the request never got a response
  ms: number;
  detail: string; // what came back, or why it failed
  skipped?: boolean; // true when the source was cooling down and no request was sent
}

const breakers = {
  openMeteo: new Breaker("open-meteo"),
  metNo: new Breaker("met.no"),
  openMeteoGeo: new Breaker("open-meteo-geocoding"),
  nominatim: new Breaker("nominatim"),
};
export const upstreamStatus = () => Object.fromEntries(Object.values(breakers).map((b) => [b.name, b.status()]));
export const blockedServices = () => Object.values(breakers).filter((b) => b.isBlocked()).map((b) => ({ name: b.name, ...b.status() }));
export function resetBreaker(name: string): boolean {
  const b = Object.values(breakers).find((x) => x.name === name);
  if (!b) return false;
  b.reset();
  return true;
}

type MetEntry = { reading: Reading; expires: number; lastModified: string | null };

/** Where breaker pauses and MET Norway cache entries are kept so they survive a restart. */
export interface UpstreamStore {
  loadBreakers(): Promise<BreakerState[]>;
  saveBreaker(s: BreakerState): Promise<void>;
  getMet(url: string): Promise<MetEntry | null>;
  putMet(url: string, e: MetEntry): Promise<void>;
}
let store: UpstreamStore | null = null;

/** Called once at startup: restores saved pauses and starts saving every change. */
export async function initUpstream(s: UpstreamStore) {
  store = s;
  const rows = await s.loadBreakers();
  for (const row of rows) Object.values(breakers).find((b) => b.name === row.name)?.load(row);
  const paused = rows.filter((r) => r.stopped || r.until > Date.now()).map((r) => `${r.name} (${r.reason})`);
  if (paused.length) console.log(`[upstream] restored pauses: ${paused.join(", ")}`);
  setBreakerPersistence((state) => {
    s.saveBreaker(state).catch((err) => console.error("[upstream] could not save breaker state:", err.message));
  });
}

const OPEN_METEO_TTL = 30 * 60_000; // Open-Meteo sends no Expires header; reuse a reading for 30 minutes
const FAILURE_TTL = 2 * 60_000; // after every source failed for a place, wait 2 minutes before trying again
const weatherCache = new TtlCache<Reading>();
const failureCache = new TtlCache<Attempt[]>();
const weatherInFlight = new InFlight<{ reading: Reading | null; attempts: Attempt[] }>();
const cellKey = (lat: number, lon: number) => `${lat.toFixed(1)},${lon.toFixed(1)}`;

interface CallResult {
  reading: Reading | null;
  attempt: Attempt;
  expires: number | null; // from the Expires header, as epoch ms
  lastModified: string | null;
}

/**
 * Every forecast call goes through here and is logged as one line, e.g.
 * [weather] open-meteo 429 312ms lat=45.7 lon=11.9 FAIL "Daily API request limit exceeded"
 * Coordinates are rounded to ~10 km so the logs don't pinpoint anyone.
 * If the source's breaker is open, nothing is sent at all.
 */
async function call(
  breaker: Breaker, url: string, lat: number, lon: number, parse: (data: any) => Reading | null,
  opts: { headers?: Record<string, string>; notModified?: () => Reading | null } = {},
): Promise<CallResult> {
  const source = breaker.name;
  if (breaker.isOpen()) {
    return {
      reading: null, expires: null, lastModified: null,
      attempt: { source, ok: false, status: null, ms: 0, detail: `skipped: ${breaker.skipNote()}`, skipped: true },
    };
  }
  const t0 = Date.now();
  let status: number | null = null;
  let reading: Reading | null = null;
  let detail = "";
  let retryAfter: string | null = null;
  let body = "";
  let expires: number | null = null;
  let lastModified: string | null = null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...opts.headers }, signal: AbortSignal.timeout(5000) });
    status = res.status;
    retryAfter = res.headers.get("retry-after");
    const exp = Date.parse(res.headers.get("expires") ?? "");
    expires = Number.isNaN(exp) ? null : exp;
    lastModified = res.headers.get("last-modified");
    body = await res.text();
    if (res.status === 304 && opts.notModified) {
      reading = opts.notModified();
      detail = reading ? `not modified, reusing ${reading.weather}` : "304 without a stored reading";
    } else if (res.status === 401 || res.status === 403) {
      detail = `you are blocked (HTTP ${res.status}): ${body.slice(0, 120).replace(/\s+/g, " ")}`;
    } else if (!res.ok) {
      detail = body.slice(0, 160).replace(/\s+/g, " ");
    } else {
      reading = parse(JSON.parse(body));
      detail = reading ? `${reading.weather}${reading.temp !== null ? ` ${Math.round(reading.temp)}°C` : ""}` : `unexpected body: ${body.slice(0, 120)}`;
    }
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    detail = e.name === "TimeoutError" ? "timed out after 5s" : `${e.message}${e.cause?.code ? ` (${e.cause.code})` : ""}`;
  }
  if (reading) breaker.success();
  else breaker.failure(status, retryAfter, body);
  const attempt = { source, ok: !!reading, status, ms: Date.now() - t0, detail };
  const until = expires ? ` expires=${new Date(expires).toISOString().slice(11, 16)}Z` : "";
  console.log(`[weather] ${source} ${status ?? "---"} ${attempt.ms}ms lat=${lat.toFixed(1)} lon=${lon.toFixed(1)} ${attempt.ok ? "OK" : "FAIL"}${until} ${JSON.stringify(detail)}`);
  return { reading, attempt, expires, lastModified };
}

/** Primary source: Open-Meteo (WMO codes). Shared hosting IPs can hit its rate limit. */
async function fromOpenMeteo(lat: number, lon: number): Promise<CallResult> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code`;
  const r = await call(breakers.openMeteo, url, lat, lon, (data) => {
    const code = data?.current?.weather_code;
    if (typeof code !== "number") return null;
    const temp = data.current.temperature_2m;
    return { weather: weatherFromCode(code), code, temp: typeof temp === "number" ? temp : null, source: "open-meteo" };
  });
  return { ...r, expires: r.reading ? Date.now() + OPEN_METEO_TTL : r.expires };
}

/** MET Norway symbol codes, e.g. "lightrainshowers_day", "heavysnowandthunder", "fog". */
export function weatherFromSymbol(symbol: string): Weather {
  const s = symbol.toLowerCase();
  if (s.includes("thunder")) return "storm";
  if (s.includes("snow") || s.includes("sleet")) return "snow";
  if (s.includes("rain") || s.includes("drizzle")) return "rain";
  if (s.includes("fog")) return "fog";
  if (s.startsWith("clearsky") || s.startsWith("fair")) return "sunny";
  return "cloudy";
}

/**
 * What MET Norway last sent for each URL. Their terms of service ask clients to:
 * - not request again before the Expires time of the previous response, and
 * - send If-Modified-Since with the previous Last-Modified, accepting 304 Not Modified.
 * Both are followed here. Entries are kept for a day so a stale-but-known reading can be revalidated.
 */
const metStore = new TtlCache<MetEntry>(200);

async function metGet(url: string): Promise<MetEntry | undefined> {
  const mem = metStore.get(url);
  if (mem || !store) return mem;
  try {
    const row = await store.getMet(url);
    if (row) metStore.set(url, row, 24 * 3600_000);
    return row ?? undefined;
  } catch (err) {
    console.error("[weather] could not read MET cache:", (err as Error).message);
    return undefined;
  }
}

function metPut(url: string, e: MetEntry) {
  metStore.set(url, e, 24 * 3600_000);
  store?.putMet(url, e).catch((err) => console.error("[weather] could not save MET cache:", err.message));
}
const MET_DEFAULT_TTL = 30 * 60_000;

/** Fallback source: MET Norway Locationforecast (global coverage; needs a real User-Agent). */
async function fromMetNo(lat: number, lon: number): Promise<CallResult> {
  // Two decimals (~1 km) keeps the URL stable for a place, so caching and If-Modified-Since actually match.
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;
  const stored = await metGet(url);
  if (stored && stored.expires > Date.now()) {
    const until = new Date(stored.expires).toISOString().slice(11, 16);
    return {
      reading: stored.reading, expires: stored.expires, lastModified: stored.lastModified,
      attempt: { source: "met.no", ok: true, status: null, ms: 0, detail: `${stored.reading.weather}, cached until Expires ${until} UTC (no request sent)` },
    };
  }
  const r = await call(breakers.metNo, url, lat, lon, (data) => {
    const first = data?.properties?.timeseries?.[0]?.data;
    const symbol: string | undefined = first?.next_1_hours?.summary?.symbol_code ?? first?.next_6_hours?.summary?.symbol_code;
    if (!symbol) return null;
    const temp = first?.instant?.details?.air_temperature;
    return { weather: weatherFromSymbol(symbol), code: null, temp: typeof temp === "number" ? temp : null, source: "met.no" };
  }, {
    headers: stored?.lastModified ? { "If-Modified-Since": stored.lastModified } : {},
    notModified: () => stored?.reading ?? null,
  });
  if (r.reading) {
    const expires = r.expires && r.expires > Date.now() ? r.expires : Date.now() + MET_DEFAULT_TTL;
    metPut(url, { reading: r.reading, expires, lastModified: r.lastModified ?? stored?.lastModified ?? null });
    return { ...r, expires };
  }
  return r;
}

/**
 * Cached reading → recent total failure (no calls) → Open-Meteo → MET Norway.
 * A reading is reused until its source says it expires. Identical requests arriving together share one call.
 */
function fetchCurrent(lat: number, lon: number): Promise<{ reading: Reading | null; attempts: Attempt[] }> {
  const key = cellKey(lat, lon);
  const cached = weatherCache.get(key);
  if (cached) return Promise.resolve({ reading: cached, attempts: [] });
  const failed = failureCache.get(key);
  if (failed) return Promise.resolve({ reading: null, attempts: failed });
  return weatherInFlight.run(key, async () => {
    const a = await fromOpenMeteo(lat, lon);
    const winner = a.reading ? a : await fromMetNo(lat, lon);
    const attempts = winner === a ? [a.attempt] : [a.attempt, winner.attempt];
    if (winner.reading) {
      const ttl = Math.max(60_000, (winner.expires ?? Date.now() + OPEN_METEO_TTL) - Date.now());
      weatherCache.set(key, winner.reading, ttl);
    } else {
      failureCache.set(key, attempts, FAILURE_TTL);
    }
    return { reading: winner.reading, attempts };
  });
}

/** Diagnostics: asks every source that isn't cooling down. MET Norway is still not asked before its Expires time. */
export async function checkSources(lat: number, lon: number): Promise<Attempt[]> {
  const [a, b] = await Promise.all([fromOpenMeteo(lat, lon), fromMetNo(lat, lon)]);
  return [a.attempt, b.attempt];
}

type Place = { name: string; region: string; country: string; lat: number; lon: number };

const searchCache = new TtlCache<Place[]>();
const nameCache = new TtlCache<string | null>();
const nominatimGap = new Spacer(1100); // Nominatim policy: at most 1 request per second

/** Geocoding helper with the same breaker rules as the forecasts. */
async function getJson(breaker: Breaker, url: string): Promise<any | null> {
  if (breaker.isOpen()) {
    breaker.skipNote();
    return null;
  }
  let status: number | null = null;
  let retryAfter: string | null = null;
  let body = "";
  try {
    if (breaker === breakers.nominatim) await nominatimGap.wait();
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
    status = res.status;
    retryAfter = res.headers.get("retry-after");
    body = await res.text();
    if (res.ok) {
      const data = JSON.parse(body);
      breaker.success();
      return data;
    }
  } catch (err) {
    body = (err as Error).message;
  }
  breaker.failure(status, retryAfter, body);
  console.warn(`[geo] ${breaker.name} ${status ?? "---"} FAIL ${JSON.stringify(body.slice(0, 120))}`);
  return null;
}

async function searchOpenMeteo(q: string): Promise<Place[] | null> {
  const data = await getJson(breakers.openMeteoGeo, `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  if (!data) return null;
  return ((data.results ?? []) as any[]).map((r) => ({
    name: String(r.name), region: r.admin1 ? String(r.admin1) : "", country: r.country ? String(r.country) : "",
    lat: Number(r.latitude), lon: Number(r.longitude),
  }));
}

/** Fallback geocoder: OpenStreetMap Nominatim (light personal use is within its policy). */
async function searchNominatim(q: string): Promise<Place[] | null> {
  const data = await getJson(breakers.nominatim, `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&addressdetails=1&accept-language=en&featureType=city`);
  if (!Array.isArray(data)) return null;
  return data.map((r: any) => {
    const a = r.address ?? {};
    return {
      name: String(a.city ?? a.town ?? a.village ?? a.municipality ?? r.name ?? String(r.display_name).split(",")[0]),
      region: String(a.state ?? a.region ?? ""), country: String(a.country ?? ""),
      lat: Number(r.lat), lon: Number(r.lon),
    };
  });
}

/** City search, cached for a day per query so the same search never hits the network twice. */
export async function searchPlaces(q: string): Promise<Place[]> {
  const key = q.trim().toLowerCase();
  const cached = searchCache.get(key);
  if (cached) return cached;
  let results = await searchOpenMeteo(q);
  if (!results || results.length === 0) results = (await searchNominatim(q)) ?? results;
  if (results) searchCache.set(key, results, 24 * 3600_000);
  return results ?? [];
}

/** Names the town for a shared GPS position, so the map says "Castelfranco Veneto" rather than "Your location". */
export async function placeName(lat: number, lon: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = nameCache.get(key);
  if (cached !== undefined) return cached;
  const data = await getJson(breakers.nominatim, `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&format=jsonv2&zoom=10&accept-language=en`);
  if (!data) return null; // not cached: a later try may succeed
  const a = data.address ?? {};
  const name = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
  const result = name ? String(name).slice(0, 60) : null;
  nameCache.set(key, result, 24 * 3600_000);
  return result;
}

export interface DailyEvent {
  day: string;
  weather: Weather;
  temp: number | null;
  place: string;
  challengeStatus: string;
  encounters: number;
  teleports: number;
  live: boolean;
  needsLocation: boolean;
  source?: string;
  error?: string;
}

async function lookup(lat: number, lon: number): Promise<{ reading: Reading | null; attempts: Attempt[] }> {
  const override = process.env.NODE_ENV !== "production" ? process.env.DEV_WEATHER : undefined;
  if (override && override in WEATHER_INFO) return { reading: { weather: override as Weather, code: null, temp: null, source: "dev" }, attempts: [] };
  return fetchCurrent(lat, lon);
}

const summarise = (attempts: Attempt[]) =>
  attempts.map((a) => `${a.source}: ${a.skipped ? a.detail : `${a.status ? `HTTP ${a.status}` : "no response"}${a.detail ? ` (${a.detail.slice(0, 60)})` : ""}`}`).join(" · ");

/**
 * The day's weather is fetched once for your location and then locked,
 * so it doesn't flip back and forth while you play. Teleporting refreshes it.
 */
export async function getDailyEvent(db: Db, userId: number, tz: string): Promise<DailyEvent> {
  const day = localDay(tz);
  const existing = await db.query("SELECT * FROM daily_events WHERE user_id = $1 AND day = $2", [userId, day]);
  if (existing.rows[0]) return toEvent(existing.rows[0]);

  const u = await db.query("SELECT lat, lon, place FROM users WHERE id = $1", [userId]);
  const { lat, lon, place } = u.rows[0];
  if (lat === null || lon === null) {
    return { day, weather: "cloudy", temp: null, place: "", challengeStatus: "none", encounters: 0, teleports: 0, live: false, needsLocation: true };
  }
  const { reading: w, attempts } = await lookup(lat, lon);
  if (!w) {
    // Don't lock in a fake weather for the day if every source is down; the next visit tries again.
    return { day, weather: "cloudy", temp: null, place, challengeStatus: "none", encounters: 0, teleports: 0, live: false, needsLocation: false, error: summarise(attempts) };
  }
  const ins = await db.query(
    `INSERT INTO daily_events (user_id, day, weather, code, temp, place, source) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, day) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *`,
    [userId, day, w.weather, w.code, w.temp, place, w.source],
  );
  return toEvent(ins.rows[0]);
}

/**
 * Moves the hero and re-reads the weather there. Today's challenge and encounter
 * counts stay with the day, so teleporting can't farm a second storm.
 */
export async function setLocation(
  db: Db, userId: number, tz: string, lat: number, lon: number, place: string, isTeleport: boolean,
): Promise<DailyEvent> {
  const { reading: w, attempts } = await lookup(lat, lon);
  if (!w) throw new Error(`WEATHER_DOWN: ${summarise(attempts)}`);
  await db.query("UPDATE users SET lat = $2, lon = $3, place = $4 WHERE id = $1", [userId, lat, lon, place]);
  const day = localDay(tz);
  const row = await db.query(
    `INSERT INTO daily_events (user_id, day, weather, code, temp, place, teleports, source) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, day) DO UPDATE SET weather = EXCLUDED.weather, code = EXCLUDED.code, temp = EXCLUDED.temp,
       place = EXCLUDED.place, teleports = daily_events.teleports + EXCLUDED.teleports, source = EXCLUDED.source
     RETURNING *`,
    [userId, day, w.weather, w.code, w.temp, place, isTeleport ? 1 : 0, w.source],
  );
  return toEvent(row.rows[0]);
}

function toEvent(row: any): DailyEvent {
  return {
    day: row.day,
    weather: row.weather,
    temp: row.temp,
    place: row.place,
    challengeStatus: row.challenge_status,
    encounters: row.encounters,
    teleports: row.teleports ?? 0,
    source: row.source ?? undefined,
    live: true,
    needsLocation: false,
  };
}
