import type pg from "pg";
import { BLOCK_BY_ID, BLOCKS, CHAPTERS, RIVALS, questionRefs } from "../content/index.js";
import type { DailyEvent, Weather } from "./weather.js";
import {
  ITEMS, blockStatus, blockUnlocked, chapterSummary, chapterUnlocked, emptyReward, grant, loadState, studiedBlocks,
} from "./state.js";
import { GameError, progressNotes, saveProgress } from "./runs.js";
import { levelFor, localDay, perm, pick, rand, rankFor, sample, seeded } from "./util.js";

// ---------- block & chapter views ----------

export async function chapterView(c: pg.PoolClient, userId: number, chapterId: number) {
  const s = await loadState(c, userId);
  const ch = CHAPTERS.find((x) => x.id === chapterId);
  if (!ch) throw new GameError(404, "No such chapter.");
  const summary = chapterSummary(s).find((x) => x.id === ch.id)!;
  const blocks = BLOCKS.filter((b) => b.chapter === ch.id).map((b) => {
    const p = s.progress.get(b.id);
    return {
      id: b.id, title: b.title, needs: b.needs, status: blockStatus(s, b.id),
      recall: !!p?.recall_done, quiz: !!p?.quiz_passed, scenario: !!p?.scenario_done,
    };
  });
  return {
    ...summary,
    boss: ch.boss,
    unlocked: chapterUnlocked(s, ch.id),
    needTitles: ch.needs.map((n) => CHAPTERS.find((x) => x.id === n)!.title),
    blocks,
    rivals: RIVALS.filter((r) => r.chapter === ch.id).map((r) => ({ id: r.id, name: r.name, title: r.title })),
  };
}

function scenarioOrder(userId: number, blockId: string, n: number) {
  return perm(`${userId}:${blockId}:scenario`, n);
}

export async function blockView(c: pg.PoolClient, userId: number, blockId: string) {
  const s = await loadState(c, userId);
  const b = BLOCK_BY_ID.get(blockId);
  if (!b) throw new GameError(404, "No such building block.");
  if (!blockUnlocked(s, b.id)) throw new GameError(403, "That building block is still locked.");
  const p = s.progress.get(b.id);
  const order = scenarioOrder(userId, b.id, b.scenario.choices.length);
  return {
    id: b.id, chapter: b.chapter, title: b.title, status: blockStatus(s, b.id),
    card: b.card,
    progress: { recall: !!p?.recall_done, quiz: !!p?.quiz_passed, quizBest: p?.quiz_best ?? 0, scenario: !!p?.scenario_done },
    unlocks: BLOCKS.filter((x) => x.needs.includes(b.id)).map((x) => ({ id: x.id, title: x.title })),
    scenario: p?.recall_done
      ? {
          title: b.scenario.title, npc: b.scenario.npc, scene: b.scenario.scene, story: b.scenario.story, ask: b.scenario.ask,
          choices: order.map((i) => b.scenario.choices[i].text),
        }
      : null,
  };
}

export async function answerScenario(c: pg.PoolClient, userId: number, blockId: string, choice: number, weather: Weather) {
  const before = await loadState(c, userId);
  const b = BLOCK_BY_ID.get(blockId);
  if (!b || !blockUnlocked(before, b.id)) throw new GameError(403, "That building block is still locked.");
  if (!before.progress.get(b.id)?.recall_done) throw new GameError(403, "Study the fundamental card first.");
  const order = scenarioOrder(userId, b.id, b.scenario.choices.length);
  if (!Number.isInteger(choice) || choice < 0 || choice >= order.length) throw new GameError(400, "Pick one of the choices.");
  const picked = b.scenario.choices[order[choice]];
  let reward = emptyReward();
  if (picked.correct) {
    if (!before.progress.get(b.id)?.scenario_done) {
      await saveProgress(c, userId, b.id, { scenario: true });
      reward = { ...reward, xp: 60, scenario: 1 };
    } else reward.xp = 5;
  }
  const granted = await grant(c, userId, reward, "scenario", weather);
  const after = await loadState(c, userId);
  granted.notes.push(...progressNotes(before, after, b.id));
  return { correct: picked.correct, feedback: picked.feedback, reward: granted };
}

// ---------- mint & shop ----------

export const MINT_RATES = { fundamental: 30, scenario: 20, quiz: 10 };

export async function mint(c: pg.PoolClient, userId: number, amounts: Record<string, unknown>, weather: Weather) {
  const f = Number(amounts.fundamental ?? 0), s = Number(amounts.scenario ?? 0), q = Number(amounts.quiz ?? 0);
  if (![f, s, q].every((n) => Number.isInteger(n) && n >= 0 && n <= 10_000)) throw new GameError(400, "Choose whole numbers of gems.");
  if (f + s + q === 0) throw new GameError(400, "Choose at least one gem.");
  const base = f * MINT_RATES.fundamental + s * MINT_RATES.scenario + q * MINT_RATES.quiz;
  const bonus = weather === "sunny" ? Math.round(base * 0.1) : 0;
  const gold = base + bonus;
  const u = await c.query(
    `UPDATE users SET gem_fundamental = gem_fundamental - $2, gem_scenario = gem_scenario - $3, gem_quiz = gem_quiz - $4, gold = gold + $5
     WHERE id = $1 AND gem_fundamental >= $2 AND gem_scenario >= $3 AND gem_quiz >= $4 RETURNING gold`,
    [userId, f, s, q, gold],
  );
  if (!u.rows[0]) throw new GameError(403, "You don't have that many gems.");
  const lines: [string, number][] = [["gem_fundamental", -f], ["gem_scenario", -s], ["gem_quiz", -q], ["gold", gold]];
  for (const [kind, amount] of lines) {
    if (amount !== 0) await c.query("INSERT INTO ledger (user_id, kind, amount, reason) VALUES ($1, $2, $3, 'mint')", [userId, kind, amount]);
  }
  return { gold, bonus };
}

export async function buy(c: pg.PoolClient, userId: number, itemId: string) {
  const item = ITEMS[itemId];
  if (!item || !item.price) throw new GameError(404, "That isn't for sale.");
  const owned = await c.query("SELECT 1 FROM inventory WHERE user_id = $1 AND item = $2", [userId, itemId]);
  if (owned.rows[0]) throw new GameError(409, "You already own it.");
  const u = await c.query("UPDATE users SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold", [userId, item.price]);
  if (!u.rows[0]) throw new GameError(403, `You need ${item.price} gold.`);
  await c.query("INSERT INTO ledger (user_id, kind, amount, reason) VALUES ($1, 'gold', $2, $3)", [userId, -item.price, `shop:${itemId}`]);
  await c.query("INSERT INTO inventory (user_id, item) VALUES ($1, $2)", [userId, itemId]);
  return { ok: true };
}

// ---------- rivals & leaderboard ----------

export async function rivalRoster(c: pg.PoolClient, userId: number, day: string) {
  const s = await loadState(c, userId);
  const duelled = await c.query(
    "SELECT meta->>'rivalId' AS rival FROM runs WHERE user_id = $1 AND kind = 'duel' AND meta->>'day' = $2",
    [userId, day],
  );
  const today = new Set(duelled.rows.map((r) => r.rival));
  return RIVALS.map((r) => {
    const unlocked = chapterUnlocked(s, r.chapter);
    const studied = studiedBlocks(s, r.chapter).length;
    let reason = "";
    if (!unlocked) reason = `Unlocks with chapter ${r.chapter}.`;
    else if (studied < 2) reason = `Study 2 blocks of chapter ${r.chapter} (${studied}/2).`;
    else if (today.has(r.id)) reason = "Already duelled today.";
    return {
      id: r.id, name: r.name, title: r.title, chapter: r.chapter, taunt: r.taunt, colour: r.colour,
      speed: Math.max(1, Math.min(4, Math.round(5 - r.speed / 3))),
      accuracy: Math.max(1, Math.min(4, Math.round(r.accuracy * 4 - 0.2))),
      available: reason === "",
      reason,
    };
  });
}

const RIVAL_RANK = (base: number) => (base > 850 ? "King" : base > 750 ? "Duke" : base > 650 ? "Count" : base > 500 ? "Baron" : base > 350 ? "Knight" : "Squire");

const WEEK = 7 * 864e5;

/** Gold that counts on the board: minted at the Royal Mint, plus gold the elves paid you. */
const EARNED = "kind = 'gold' AND amount > 0 AND reason IN ('mint', 'elf')";

/**
 * scope "week": this week's gold, resetting Monday 00:00 in your time zone.
 * scope "all": everything since you joined; rivals have been earning every week since then too.
 */
export async function leaderboard(c: pg.PoolClient, userId: number, tz: string, scope: "week" | "all" = "week") {
  const ws = await c.query(
    `SELECT (date_trunc('week', now() AT TIME ZONE $1) AT TIME ZONE $1) AS start,
            (date_trunc('week', u.created_at AT TIME ZONE $1) AT TIME ZONE $1) AS joined_week,
            now() AS now, u.username, u.xp
     FROM users u WHERE u.id = $2`,
    [tz, userId],
  );
  const { start: weekStart, joined_week: joinedWeek, now, username, xp } = ws.rows[0] as {
    start: Date; joined_week: Date; now: Date; username: string; xp: number;
  };
  const from = scope === "all" ? joinedWeek : weekStart;

  // A rival's score for one week, `frac` of the way through it.
  const rivalWeek = (id: string, base: number, wkStart: Date, frac: number) =>
    base * frac ** 0.9 * (0.85 + 0.3 * seeded(`${id}:${wkStart.toISOString().slice(0, 10)}`));

  async function board(at: Date) {
    const mine = await c.query(
      `SELECT COALESCE(SUM(amount), 0)::int AS g FROM ledger WHERE user_id = $1 AND ${EARNED} AND created_at >= $2 AND created_at <= $3`,
      [userId, from, at],
    );
    const wins = await c.query(
      `SELECT meta->>'rivalId' AS rival, count(*)::int AS n FROM runs
       WHERE user_id = $1 AND kind = 'duel' AND score_you > score_rival AND finished_at >= $2 AND finished_at <= $3 GROUP BY 1`,
      [userId, from, at],
    );
    const winMap = new Map(wins.rows.map((r) => [r.rival, r.n as number]));
    const rows = RIVALS.map((r) => {
      let total = 0;
      for (let wk = new Date(from); wk.getTime() <= at.getTime(); wk = new Date(wk.getTime() + WEEK)) {
        const frac = Math.max(0, Math.min(1, (at.getTime() - wk.getTime()) / WEEK));
        total += rivalWeek(r.id, r.weeklyBase, wk, frac);
      }
      return {
        id: r.id, name: r.name, title: r.title, rank: RIVAL_RANK(r.weeklyBase), colour: r.colour, you: false,
        gold: Math.max(0, Math.round(total) - 100 * (winMap.get(r.id) ?? 0)),
      };
    });
    rows.push({ id: "you", name: username, title: "", rank: rankFor(levelFor(xp)), colour: "#4f7cff", you: true, gold: mine.rows[0].g });
    rows.sort((a, b) => b.gold - a.gold || (a.you ? -1 : 1));
    return rows;
  }

  const current = await board(now);
  const yesterday = await board(new Date(now.getTime() - 864e5));
  const prevPos = new Map(yesterday.map((r, i) => [r.id, i]));
  return {
    scope,
    since: localDay(tz, from),
    weekStart: localDay(tz, weekStart),
    rows: current.map((r, i) => ({ ...r, pos: i + 1, move: (prevPos.get(r.id) ?? i) - i })),
  };
}

// ---------- wild encounters ----------

const MYSTICS = ["The Hermit of the Log", "The Oracle of Clocks", "The Seer of Segments", "The Quiet Archivist"];

function elfOffer(u: any) {
  const offers = [
    { id: "q2f", text: "Three quiz gems for one fundamental gem?", give: { quiz: 3 }, get: { fundamental: 1 }, ok: u.gem_quiz >= 3 },
    { id: "s2f", text: "Two scenario gems for one fundamental gem?", give: { scenario: 2 }, get: { fundamental: 1 }, ok: u.gem_scenario >= 2 },
    { id: "g2s", text: "Sixty gold for a shiny scenario gem?", give: { gold: 60 }, get: { scenario: 1 }, ok: u.gold >= 60 },
    { id: "f2g", text: "I'll pay 45 gold for one fundamental gem. Better than the Mint!", give: { fundamental: 1 }, get: { gold: 45 }, ok: u.gem_fundamental >= 1 },
  ].filter((o) => o.ok);
  if (offers.length === 0) {
    return { id: "gift", text: "You look like you need this. Take a quiz gem, for free.", give: {}, get: { quiz: 1 } };
  }
  const { ok: _ok, ...o } = pick(offers);
  return o;
}

export async function currentEncounter(c: pg.PoolClient, userId: number) {
  await c.query("UPDATE encounters SET status = 'fled' WHERE user_id = $1 AND status = 'pending' AND created_at < now() - interval '1 day'", [userId]);
  const e = await c.query("SELECT * FROM encounters WHERE user_id = $1 AND status = 'pending' ORDER BY id DESC LIMIT 1", [userId]);
  return e.rows[0] ? encounterView(e.rows[0]) : null;
}

function encounterView(e: any) {
  const p = e.payload;
  return {
    id: Number(e.id), kind: e.kind, name: p.name, chapter: p.chapter ?? null, line: p.line,
    offer: p.offer ? { text: p.offer.text, give: p.offer.give, get: p.offer.get } : null,
    rival: p.rivalId ? RIVALS.find((r) => r.id === p.rivalId) : null,
  };
}

/** Called when the map loads: sometimes a wild encounter appears. */
export async function maybeSpawn(c: pg.PoolClient, userId: number, ev: DailyEvent) {
  const existing = await currentEncounter(c, userId);
  if (existing) return existing;
  if (!ev.live) return null;
  const d = await c.query("SELECT encounters FROM daily_events WHERE user_id = $1 AND day = $2 FOR UPDATE", [userId, ev.day]);
  if (!d.rows[0] || d.rows[0].encounters >= 3) return null;
  const recent = await c.query("SELECT 1 FROM encounters WHERE user_id = $1 AND created_at > now() - interval '20 minutes'", [userId]);
  if (recent.rows[0]) return null;

  const s = await loadState(c, userId);
  const studied = studiedBlocks(s);
  if (studied.length === 0) return null;
  if (rand() > (ev.weather === "fog" ? 0.45 : 0.3)) return null;

  const roster = await rivalRoster(c, userId, ev.day);
  const rivals = roster.filter((r) => r.available);
  const kinds = ["mystic", "mystic", "beast", "beast", "beast", "elf", "elf", ...(rivals.length ? ["rival", "rival"] : [])];
  const kind = pick(kinds);

  let payload: Record<string, unknown>;
  if (kind === "mystic") {
    payload = { name: pick(MYSTICS), line: "Answer my riddle, traveller, and I will share my light.", refs: sample(questionRefs(studied), 1) };
  } else if (kind === "beast") {
    const chapter = BLOCK_BY_ID.get(pick(studied))!.chapter;
    const ch = CHAPTERS.find((x) => x.id === chapter)!;
    payload = {
      name: ch.beast, chapter, line: `A wild ${ch.beast} blocks the road! Land two hits to drive it off.`,
      refs: sample(questionRefs(studiedBlocks(s, chapter)), 3),
    };
  } else if (kind === "elf") {
    payload = { name: "Wandering Elf", line: "Psst. A trade, between friends?", offer: elfOffer(s.user) };
  } else {
    const r = pick(rivals);
    payload = { name: r.name, chapter: r.chapter, rivalId: r.id, line: r.taunt };
  }
  const ins = await c.query("INSERT INTO encounters (user_id, kind, payload) VALUES ($1, $2, $3) RETURNING *", [userId, kind, JSON.stringify(payload)]);
  await c.query("UPDATE daily_events SET encounters = encounters + 1 WHERE user_id = $1 AND day = $2", [userId, ev.day]);
  return encounterView(ins.rows[0]);
}

/** Elf trades and fleeing are resolved here; fights start runs (see server). */
export async function resolveEncounter(c: pg.PoolClient, userId: number, id: number, action: string) {
  const e = await c.query("SELECT * FROM encounters WHERE id = $1 AND user_id = $2 FOR UPDATE", [id, userId]);
  const enc = e.rows[0];
  if (!enc || enc.status !== "pending") throw new GameError(404, "That encounter has wandered off.");
  if (action === "flee" || action === "decline") {
    await c.query("UPDATE encounters SET status = 'fled' WHERE id = $1", [id]);
    return { ok: true };
  }
  if (action === "accept" && enc.kind === "elf") {
    const o = enc.payload.offer;
    const give = { fundamental: 0, scenario: 0, quiz: 0, gold: 0, ...o.give };
    const u = await c.query(
      `UPDATE users SET gem_fundamental = gem_fundamental - $2, gem_scenario = gem_scenario - $3, gem_quiz = gem_quiz - $4, gold = gold - $5
       WHERE id = $1 AND gem_fundamental >= $2 AND gem_scenario >= $3 AND gem_quiz >= $4 AND gold >= $5 RETURNING id`,
      [userId, give.fundamental, give.scenario, give.quiz, give.gold],
    );
    if (!u.rows[0]) throw new GameError(403, "You can't afford that trade any more.");
    const lines: [string, number][] = [["gem_fundamental", -give.fundamental], ["gem_scenario", -give.scenario], ["gem_quiz", -give.quiz], ["gold", -give.gold]];
    for (const [kind, amount] of lines) {
      if (amount !== 0) await c.query("INSERT INTO ledger (user_id, kind, amount, reason) VALUES ($1, $2, $3, 'elf')", [userId, kind, amount]);
    }
    const reward = { ...emptyReward(), fundamental: o.get.fundamental ?? 0, scenario: o.get.scenario ?? 0, quiz: o.get.quiz ?? 0, gold: o.get.gold ?? 0 };
    // Elf trades are not "earned" gems, so no weather bonus.
    const granted = await grant(c, userId, reward, "elf");
    await c.query("UPDATE encounters SET status = 'won' WHERE id = $1", [id]);
    return { ok: true, reward: granted };
  }
  throw new GameError(400, "You can't do that here.");
}

export { MYSTICS };
