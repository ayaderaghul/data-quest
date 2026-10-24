import type { Db } from "../db.js";
import { localDay } from "./util.js";

export type Weather = "sunny" | "cloudy" | "rain" | "snow" | "storm" | "fog";

export const DEFAULT_PLACE = { lat: 45.6719, lon: 11.9272, name: "Castelfranco Veneto" };

export const WEATHER_INFO: Record<Weather, { label: string; effect: string }> = {
  sunny: { label: "Sunny", effect: "+10% gold when you mint gems at the Royal Mint." },
  cloudy: { label: "Cloudy", effect: "Steady day: +10% XP on everything." },
  rain: { label: "Rainy", effect: "Gem drizzle: each gem you earn has a 20% chance to drop a bonus gem." },
  snow: { label: "Snowy", effect: "Frozen Cache: review 5 old questions for bonus gems." },
  storm: { label: "Storm", effect: "Storm challenge: 5 timed questions from every chapter you've studied." },
  fog: { label: "Fog", effect: "Mystery fog: quiz gems are doubled, but hints are disabled." },
};

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

async function fetchCurrent(lat: number, lon: number): Promise<{ code: number; temp: number } | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    if (typeof data.current?.weather_code !== "number") return null;
    return { code: data.current.weather_code, temp: data.current.temperature_2m ?? 0 };
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
  live: boolean;
}

/**
 * The day's weather is fetched once and then locked for the whole day,
 * so the event doesn't flip back and forth while you play.
 */
export async function getDailyEvent(db: Db, userId: number, tz: string, lat?: number, lon?: number): Promise<DailyEvent> {
  const day = localDay(tz);
  const existing = await db.query("SELECT * FROM daily_events WHERE user_id = $1 AND day = $2", [userId, day]);
  if (existing.rows[0]) return toEvent(existing.rows[0], true);

  const useDefault = lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon);
  const la = useDefault ? DEFAULT_PLACE.lat : lat!;
  const lo = useDefault ? DEFAULT_PLACE.lon : lon!;
  const near = Math.abs(la - DEFAULT_PLACE.lat) < 0.15 && Math.abs(lo - DEFAULT_PLACE.lon) < 0.15;
  const place = near ? DEFAULT_PLACE.name : "Your location";

  let weather: Weather;
  let code: number | null = null;
  let temp: number | null = null;
  const override = process.env.NODE_ENV !== "production" ? process.env.DEV_WEATHER : undefined;
  if (override && override in WEATHER_INFO) {
    weather = override as Weather;
  } else {
    const cur = await fetchCurrent(la, lo);
    if (!cur) {
      // Don't lock in a fake weather for the day if the API is down.
      return { day, weather: "cloudy", temp: null, place, challengeStatus: "none", encounters: 0, live: false };
    }
    code = cur.code;
    temp = cur.temp;
    weather = weatherFromCode(cur.code);
  }

  const ins = await db.query(
    `INSERT INTO daily_events (user_id, day, weather, code, temp, place) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, day) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *`,
    [userId, day, weather, code, temp, place],
  );
  return toEvent(ins.rows[0], true);
}

function toEvent(row: any, live: boolean): DailyEvent {
  return {
    day: row.day,
    weather: row.weather,
    temp: row.temp,
    place: row.place,
    challengeStatus: row.challenge_status,
    encounters: row.encounters,
    live,
  };
}
