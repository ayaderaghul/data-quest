import type { Db } from "../db.js";
import { BLOCKS, CHAPTERS } from "../content/index.js";
import type { Weather } from "./weather.js";
import { levelFor, pick, rand, rankFor, xpForLevel } from "./util.js";

export interface Progress {
  recall_done: boolean;
  quiz_passed: boolean;
  quiz_best: number;
  scenario_done: boolean;
}

export interface UserState {
  user: any;
  progress: Map<string, Progress>;
  clears: Set<number>;
  inventory: Set<string>;
}

export async function loadState(db: Db, userId: number): Promise<UserState> {
  // Sequential on purpose: inside a transaction these share one client, which can't run queries in parallel.
  const u = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
  const p = await db.query("SELECT * FROM progress WHERE user_id = $1", [userId]);
  const c = await db.query("SELECT chapter FROM chapter_clears WHERE user_id = $1", [userId]);
  const i = await db.query("SELECT item FROM inventory WHERE user_id = $1", [userId]);
  return {
    user: u.rows[0],
    progress: new Map(p.rows.map((r) => [r.block_id, r])),
    clears: new Set(c.rows.map((r) => r.chapter)),
    inventory: new Set(i.rows.map((r) => r.item)),
  };
}

export const blockCleared = (p?: Progress) => !!p && p.recall_done && p.quiz_passed && p.scenario_done;

export function chapterUnlocked(s: UserState, chapterId: number): boolean {
  const ch = CHAPTERS.find((c) => c.id === chapterId);
  return !!ch && ch.available && ch.needs.every((n) => s.clears.has(n));
}

export function blockUnlocked(s: UserState, blockId: string): boolean {
  const b = BLOCKS.find((x) => x.id === blockId);
  if (!b || !chapterUnlocked(s, b.chapter)) return false;
  return b.needs.every((n) => blockCleared(s.progress.get(n)));
}

export function blockStatus(s: UserState, blockId: string): "locked" | "open" | "progress" | "cleared" {
  const p = s.progress.get(blockId);
  if (blockCleared(p)) return "cleared";
  if (!blockUnlocked(s, blockId)) return "locked";
  if (p && (p.recall_done || p.quiz_passed || p.scenario_done)) return "progress";
  return "open";
}

export function chapterSummary(s: UserState) {
  return CHAPTERS.map((ch) => {
    const blocks = BLOCKS.filter((b) => b.chapter === ch.id);
    const cleared = blocks.filter((b) => blockCleared(s.progress.get(b.id))).length;
    const unlocked = chapterUnlocked(s, ch.id);
    const done = s.clears.has(ch.id);
    return {
      id: ch.id,
      title: ch.title,
      region: ch.region,
      needs: ch.needs,
      available: ch.available,
      status: done ? "cleared" : !ch.available ? "soon" : unlocked ? (cleared > 0 ? "progress" : "open") : "locked",
      blocksCleared: cleared,
      blocksTotal: blocks.length,
      bossReady: unlocked && !done && blocks.length > 0 && cleared === blocks.length,
      gear: ch.gear,
    };
  });
}

/** Blocks whose fundamental card has been studied: the pool for reviews and encounters. */
export function studiedBlocks(s: UserState, chapter?: number): string[] {
  return BLOCKS.filter((b) => (chapter === undefined || b.chapter === chapter) && s.progress.get(b.id)?.recall_done).map((b) => b.id);
}

export function heroSummary(u: any) {
  const level = levelFor(u.xp);
  return {
    name: u.username,
    xp: u.xp,
    level,
    rank: rankFor(level),
    levelStart: xpForLevel(level),
    levelNext: xpForLevel(level + 1),
    gold: u.gold,
    gems: { fundamental: u.gem_fundamental, scenario: u.gem_scenario, quiz: u.gem_quiz },
  };
}

export interface Reward {
  xp: number;
  gold: number;
  fundamental: number;
  scenario: number;
  quiz: number;
  items: string[];
  notes: string[];
}

export const emptyReward = (): Reward => ({ xp: 0, gold: 0, fundamental: 0, scenario: 0, quiz: 0, items: [], notes: [] });

/**
 * Applies a reward inside a transaction, with the day's weather effects:
 * cloudy = +10% XP, rain = 20% chance of a bonus gem when gems are earned.
 */
export async function grant(db: Db, userId: number, r: Reward, reason: string, weather?: Weather): Promise<Reward> {
  const out = { ...r, items: [...r.items], notes: [...r.notes] };
  if (weather === "cloudy" && out.xp > 0) {
    const bonus = Math.round(out.xp * 0.1);
    if (bonus > 0) {
      out.xp += bonus;
      out.notes.push(`Cloudy day: +${bonus} XP`);
    }
  }
  const gemsEarned = out.fundamental + out.scenario + out.quiz;
  if (weather === "rain" && gemsEarned > 0 && rand() < 0.2) {
    const kind = pick(["fundamental", "scenario", "quiz", "quiz"] as const);
    out[kind] += 1;
    out.notes.push(`Rain drop! A bonus ${kind} gem fell from the sky.`);
  }
  await db.query(
    `UPDATE users SET xp = xp + $2, gold = gold + $3, gem_fundamental = gem_fundamental + $4,
       gem_scenario = gem_scenario + $5, gem_quiz = gem_quiz + $6 WHERE id = $1`,
    [userId, out.xp, out.gold, out.fundamental, out.scenario, out.quiz],
  );
  const lines: [string, number][] = [
    ["xp", out.xp], ["gold", out.gold], ["gem_fundamental", out.fundamental], ["gem_scenario", out.scenario], ["gem_quiz", out.quiz],
  ];
  for (const [kind, amount] of lines) {
    if (amount !== 0) await db.query("INSERT INTO ledger (user_id, kind, amount, reason) VALUES ($1, $2, $3, $4)", [userId, kind, amount, reason]);
  }
  for (const item of out.items) {
    await db.query("INSERT INTO inventory (user_id, item) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, item]);
  }
  return out;
}

export const ITEMS: Record<string, { name: string; kind: "gear" | "cosmetic" | "trophy"; price?: number; desc: string }> = {
  "gear-1": { name: "Reliability Helm", kind: "gear", desc: "Won from the Cascade Gremlin (ch 1)." },
  "gear-2": { name: "Schema Gloves", kind: "gear", desc: "Won from the Join Hydra (ch 2)." },
  "gear-3": { name: "B-Tree Boots", kind: "gear", desc: "Won from the Compaction Golem (ch 3)." },
  "gear-4": { name: "Encoding Belt", kind: "gear", desc: "Won from the Schema Basilisk (ch 4)." },
  "gear-5": { name: "Follower's Pauldrons", kind: "gear", desc: "Won from the Lagging Follower (ch 5)." },
  plume: { name: "Red Plume", kind: "cosmetic", price: 200, desc: "A proud feather for your helm." },
  "gold-trim": { name: "Gold Trim", kind: "cosmetic", price: 400, desc: "Gilds the edges of your armour." },
  "royal-cape": { name: "Royal Cape", kind: "cosmetic", price: 600, desc: "A crimson cape fit for a Count." },
  "lightning-rod": { name: "Lightning Rod", kind: "trophy", desc: "Survived a storm challenge." },
  "frost-scarf": { name: "Frost Scarf", kind: "trophy", desc: "Thawed a Frozen Cache." },
  "wyrm-scale": { name: "Wyrm Scale", kind: "trophy", desc: "Defeated a wild beast." },
  "mystic-orb": { name: "Mystic Orb", kind: "trophy", desc: "Answered a mystic's riddle." },
  "rival-pennant": { name: "Rival's Pennant", kind: "trophy", desc: "Won a duel against a rival knight." },
};
