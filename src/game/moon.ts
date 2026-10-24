// Moon phase from the mean synodic month. Accurate to within a few hours,
// which is plenty for a "full moon night" in a game.
const SYNODIC = 29.530588853; // days
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14); // 2000-01-06 18:14 UTC
const DAY = 864e5;

const NAMES = [
  "New moon", "Waxing crescent", "First quarter", "Waxing gibbous",
  "Full moon", "Waning gibbous", "Last quarter", "Waning crescent",
];

export interface MoonInfo {
  age: number; // days since new moon
  fraction: number; // 0..1 through the cycle
  name: string;
  isFull: boolean; // about a 2-day window around full
  isNew: boolean; // about a 2-day window around new
  cycle: string; // id of the current lunar cycle (date of its new moon)
  nextFull: string; // ISO timestamps
  nextNew: string;
}

export function moonAt(t = Date.now()): MoonInfo {
  const age = (((t - KNOWN_NEW_MOON) / DAY) % SYNODIC + SYNODIC) % SYNODIC;
  const fraction = age / SYNODIC;
  const dev = process.env.NODE_ENV !== "production" ? process.env.DEV_MOON : undefined; // local testing only
  const isFull = dev === "full" || (!dev && Math.abs(age - SYNODIC / 2) <= 1);
  const isNew = dev === "new" || (!dev && (age <= 1 || age >= SYNODIC - 1));
  // A new-moon window at the end of a cycle belongs to the next cycle.
  let start = t - age * DAY;
  if (age >= SYNODIC - 1) start += SYNODIC * DAY;
  const toFull = ((SYNODIC / 2 - age) + SYNODIC) % SYNODIC;
  const toNew = SYNODIC - age;
  return {
    age,
    fraction,
    name: NAMES[Math.round(fraction * 8) % 8],
    isFull,
    isNew,
    cycle: new Date(start).toISOString().slice(0, 10),
    nextFull: new Date(t + (toFull < 0.01 ? SYNODIC : toFull) * DAY).toISOString(),
    nextNew: new Date(t + toNew * DAY).toISOString(),
  };
}
