import type { Db } from "../db.js";
import { localDay } from "./util.js";

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

/** Primary source: Open-Meteo (WMO codes). Shared hosting IPs can hit its rate limit. */
async function fromOpenMeteo(lat: number, lon: number): Promise<Reading | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      console.warn(`open-meteo forecast: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    if (typeof data.current?.weather_code !== "number") return null;
    return { weather: weatherFromCode(data.current.weather_code), code: data.current.weather_code, temp: data.current.temperature_2m ?? null, source: "open-meteo" };
  } catch (err) {
    console.warn("open-meteo forecast failed:", (err as Error).message);
    return null;
  }
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

/** Fallback source: MET Norway Locationforecast (global coverage). */
async function fromMetNo(lat: number, lon: number): Promise<Reading | null> {
  // MET asks for at most 4 decimals in coordinates.
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`met.no forecast: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as any;
    const first = data?.properties?.timeseries?.[0]?.data;
    const symbol: string | undefined = first?.next_1_hours?.summary?.symbol_code ?? first?.next_6_hours?.summary?.symbol_code;
    if (!symbol) return null;
    const temp = first?.instant?.details?.air_temperature;
    return { weather: weatherFromSymbol(symbol), code: null, temp: typeof temp === "number" ? temp : null, source: "met.no" };
  } catch (err) {
    console.warn("met.no forecast failed:", (err as Error).message);
    return null;
  }
}

async function fetchCurrent(lat: number, lon: number): Promise<Reading | null> {
  return (await fromOpenMeteo(lat, lon)) ?? (await fromMetNo(lat, lon));
}

type Place = { name: string; region: string; country: string; lat: number; lon: number };

async function searchOpenMeteo(q: string): Promise<Place[] | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      console.warn(`open-meteo geocoding: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { results?: any[] };
    return (data.results ?? []).map((r) => ({
      name: String(r.name), region: r.admin1 ? String(r.admin1) : "", country: r.country ? String(r.country) : "",
      lat: Number(r.latitude), lon: Number(r.longitude),
    }));
  } catch (err) {
    console.warn("open-meteo geocoding failed:", (err as Error).message);
    return null;
  }
}

/** Fallback geocoder: OpenStreetMap Nominatim (light personal use is within its policy). */
async function searchNominatim(q: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&addressdetails=1&accept-language=en&featureType=city`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`nominatim search: HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as any[];
    return data.map((r) => {
      const a = r.address ?? {};
      return {
        name: String(a.city ?? a.town ?? a.village ?? a.municipality ?? r.name ?? String(r.display_name).split(",")[0]),
        region: String(a.state ?? a.region ?? ""), country: String(a.country ?? ""),
        lat: Number(r.lat), lon: Number(r.lon),
      };
    });
  } catch (err) {
    console.warn("nominatim search failed:", (err as Error).message);
    return [];
  }
}

export async function searchPlaces(q: string): Promise<Place[]> {
  const primary = await searchOpenMeteo(q);
  if (primary && primary.length) return primary;
  return searchNominatim(q);
}

/** Names the town for a shared GPS position, so the map says "Castelfranco Veneto" rather than "Your location". */
export async function placeName(lat: number, lon: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&format=jsonv2&zoom=10&accept-language=en`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const a = ((await res.json()) as any)?.address ?? {};
    const name = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
    return name ? String(name).slice(0, 60) : null;
  } catch {
    return null;
  }
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
}

async function lookup(lat: number, lon: number): Promise<Reading | null> {
  const override = process.env.NODE_ENV !== "production" ? process.env.DEV_WEATHER : undefined;
  if (override && override in WEATHER_INFO) return { weather: override as Weather, code: null, temp: null, source: "dev" };
  return fetchCurrent(lat, lon);
}

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
  const w = await lookup(lat, lon);
  if (!w) {
    // Don't lock in a fake weather for the day if the API is down.
    return { day, weather: "cloudy", temp: null, place, challengeStatus: "none", encounters: 0, teleports: 0, live: false, needsLocation: false };
  }
  const ins = await db.query(
    `INSERT INTO daily_events (user_id, day, weather, code, temp, place) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, day) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *`,
    [userId, day, w.weather, w.code, w.temp, place],
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
  const w = await lookup(lat, lon);
  if (!w) throw new Error("WEATHER_DOWN");
  await db.query("UPDATE users SET lat = $2, lon = $3, place = $4 WHERE id = $1", [userId, lat, lon, place]);
  const day = localDay(tz);
  const row = await db.query(
    `INSERT INTO daily_events (user_id, day, weather, code, temp, place, teleports) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, day) DO UPDATE SET weather = EXCLUDED.weather, code = EXCLUDED.code, temp = EXCLUDED.temp,
       place = EXCLUDED.place, teleports = daily_events.teleports + EXCLUDED.teleports
     RETURNING *`,
    [userId, day, w.weather, w.code, w.temp, place, isTeleport ? 1 : 0],
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
    live: true,
    needsLocation: false,
  };
}
