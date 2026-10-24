import { createHash, randomInt } from "node:crypto";

/** Deterministic number in [0, 1) from a string seed. */
export function seeded(seed: string): number {
  const h = createHash("sha256").update(seed).digest();
  return h.readUInt32BE(0) / 2 ** 32;
}

/** Deterministic permutation of [0..n-1] from a seed. */
export function perm(seed: string, n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(seeded(`${seed}:${i}`) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rand(): number {
  return randomInt(0, 1_000_000) / 1_000_000;
}

export function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length)];
}

/** Sample k items without replacement; if arr is short, repeats are allowed. */
export function sample<T>(arr: T[], k: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < k && arr.length > 0) {
    if (pool.length === 0) pool.push(...arr);
    out.push(pool.splice(randomInt(0, pool.length), 1)[0]);
  }
  return out;
}

export function localDay(tz: string, d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: safeTz(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function safeTz(tz: string | undefined): string {
  if (!tz) return "Europe/Rome";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "Europe/Rome";
  }
}

export function levelFor(xp: number): number {
  return Math.floor(Math.sqrt(xp / 20)) + 1;
}
export function xpForLevel(level: number): number {
  return 20 * (level - 1) ** 2;
}

export const RANKS = [
  { min: 1, name: "Peasant" },
  { min: 5, name: "Squire" },
  { min: 10, name: "Knight" },
  { min: 15, name: "Baron" },
  { min: 20, name: "Count" },
  { min: 25, name: "Duke" },
  { min: 30, name: "King" },
];

export function rankFor(level: number): string {
  let r = RANKS[0].name;
  for (const x of RANKS) if (level >= x.min) r = x.name;
  return r;
}
