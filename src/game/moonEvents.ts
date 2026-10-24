import type pg from "pg";
import { FAIRY_PUZZLES, type FairyPuzzle } from "../content/fairy.js";
import { moonAt } from "./moon.js";
import { chapterUnlocked, emptyReward, grant, loadState, studiedBlocks, type UserState } from "./state.js";
import { GameError } from "./runs.js";
import { perm, seeded } from "./util.js";
import type { Weather } from "./weather.js";

const FAIRY_TRIES = 3;

function puzzleFor(s: UserState, userId: number, cycle: string): FairyPuzzle {
  const open = FAIRY_PUZZLES.filter((p) => chapterUnlocked(s, p.chapter));
  const pool = open.length ? open : FAIRY_PUZZLES.filter((p) => p.chapter === 1);
  return pool[Math.floor(seeded(`fairy:${userId}:${cycle}`) * pool.length)];
}

const stepOrder = (userId: number, cycle: string, p: FairyPuzzle) => perm(`fairy-steps:${userId}:${cycle}:${p.id}`, p.steps.length);

export async function moonView(c: pg.PoolClient, userId: number) {
  const moon = moonAt();
  const s = await loadState(c, userId);
  const studied = studiedBlocks(s).length;
  const ev = await c.query("SELECT * FROM moon_events WHERE user_id = $1 AND cycle = $2", [userId, moon.cycle]);
  const wolfRow = ev.rows.find((r) => r.kind === "wolf");
  const fairyRow = ev.rows.find((r) => r.kind === "fairy");

  let wolf = null;
  if (moon.isFull) {
    wolf = {
      status: wolfRow?.status ?? "waiting",
      ready: studied >= 2,
      reason: studied >= 2 ? "" : "Study at least two building blocks first.",
    };
  }

  let fairy = null;
  if (moon.isNew) {
    const p = puzzleFor(s, userId, moon.cycle);
    const order = stepOrder(userId, moon.cycle, p);
    const status = fairyRow?.status ?? "waiting";
    fairy = {
      status,
      triesLeft: FAIRY_TRIES - (fairyRow?.attempts ?? 0),
      puzzle: { id: p.id, chapter: p.chapter, title: p.title, prompt: p.prompt, steps: order.map((i) => p.steps[i]) },
      proverb: status === "won" || status === "lost" ? p.proverb : null,
      solution: status === "lost" ? p.steps : null,
    };
  }

  return { moon, wolf, fairy };
}

/** order: the displayed step indexes, in the order the player arranged them. */
export async function solveFairy(c: pg.PoolClient, userId: number, order: unknown, weather: Weather) {
  const moon = moonAt();
  if (!moon.isNew) throw new GameError(403, "The fairy only appears at the new moon.");
  const s = await loadState(c, userId);
  const p = puzzleFor(s, userId, moon.cycle);
  const shown = stepOrder(userId, moon.cycle, p);
  if (!Array.isArray(order) || order.length !== p.steps.length || new Set(order).size !== order.length ||
      !order.every((x) => Number.isInteger(x) && x >= 0 && x < p.steps.length)) {
    throw new GameError(400, "Arrange every step exactly once.");
  }

  await c.query(
    "INSERT INTO moon_events (user_id, cycle, kind, puzzle_id) VALUES ($1, $2, 'fairy', $3) ON CONFLICT DO NOTHING",
    [userId, moon.cycle, p.id],
  );
  const row = (await c.query(
    "SELECT * FROM moon_events WHERE user_id = $1 AND cycle = $2 AND kind = 'fairy' FOR UPDATE", [userId, moon.cycle],
  )).rows[0];
  if (row.status === "won" || row.status === "lost") throw new GameError(409, "The fairy has already shared her wisdom this new moon.");

  // Map displayed positions back to the original step indexes; correct means 0,1,2,3...
  const original = (order as number[]).map((pos) => shown[pos]);
  const inPlace = original.filter((orig, i) => orig === i).length;
  const solved = inPlace === p.steps.length;
  const attempts = row.attempts + 1;
  const status = solved ? "won" : attempts >= FAIRY_TRIES ? "lost" : "started";
  await c.query("UPDATE moon_events SET attempts = $3, status = $4 WHERE user_id = $1 AND cycle = $2 AND kind = 'fairy'", [userId, moon.cycle, attempts, status]);

  let reward = null;
  if (solved) {
    reward = await grant(c, userId, { ...emptyReward(), xp: 150, scenario: 2, items: ["fairy-lantern"] }, "fairy", weather);
  }
  return {
    solved,
    inPlace,
    total: p.steps.length,
    triesLeft: FAIRY_TRIES - attempts,
    proverb: status === "started" ? null : p.proverb,
    solution: status === "lost" ? p.steps : null,
    reward,
  };
}
