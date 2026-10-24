import type pg from "pg";
import { BLOCK_BY_ID, BLOCKS, CHAPTERS, RIVALS, getQuestion, questionRefs } from "../content/index.js";
import type { Question } from "../content/types.js";
import type { Weather } from "./weather.js";
import { moonAt } from "./moon.js";
import {
  blockCleared, blockUnlocked, chapterSummary, emptyReward, grant, loadState, studiedBlocks,
  type Reward, type UserState,
} from "./state.js";
import { perm, rand, sample, seeded } from "./util.js";

export class GameError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface RunQuestion {
  ref: string;
  order: number[];
  custom?: Question; // e.g. the wolf's shortcut questions, built at run creation
}

const qOf = (rq: RunQuestion): Question => rq.custom ?? getQuestion(rq.ref)!;

const HINT_COST = 20;
const STORM_SECONDS = 90;

function makeQuestions(runSeed: string, refs: string[], customs?: Question[]): RunQuestion[] {
  return refs.map((ref, i) => {
    const custom = customs?.[i];
    const q = custom ?? getQuestion(ref)!;
    return { ref, order: perm(`${runSeed}:${i}:${ref}`, q.options.length), ...(custom ? { custom } : {}) };
  });
}

/** The wolf's test: for a real quiz question, pick the memory anchor (shortcut) that cracks it. */
function wolfQuestions(studied: string[]): { refs: string[]; customs: Question[] } {
  const quizRefs = questionRefs(studied).filter((r) => r.includes(":quiz:"));
  const refs = sample(quizRefs, 5);
  const customs = refs.map((ref) => {
    const block = BLOCK_BY_ID.get(ref.split(":")[0])!;
    const q = getQuestion(ref)!;
    const others = BLOCKS.filter((b) => b.chapter !== block.chapter).map((b) => b.card.anchor);
    return {
      q: q.q,
      options: [block.card.anchor, ...sample(others, 3)],
      answer: 0,
      why: `The shortcut was "${block.card.anchor}" (${block.id} ${block.title}). Answer: ${q.options[q.answer]}.`,
    };
  });
  return { refs, customs };
}

export interface CreateOpts {
  blockId?: string;
  chapter?: number;
  rivalId?: string;
  encounterId?: number;
}

export async function createRun(
  c: pg.PoolClient, userId: number, kind: string, opts: CreateOpts, weather: Weather, day: string,
): Promise<number> {
  const s = await loadState(c, userId);
  let refs: string[] = [];
  let meta: Record<string, unknown> = {};
  let hearts: number | null = null;
  let customs: Question[] | undefined;

  switch (kind) {
    case "recall":
    case "quiz": {
      const b = opts.blockId ? BLOCK_BY_ID.get(opts.blockId) : undefined;
      if (!b || !blockUnlocked(s, b.id)) throw new GameError(403, "That building block is still locked.");
      if (kind === "quiz" && !s.progress.get(b.id)?.recall_done) throw new GameError(403, "Study the fundamental card first.");
      refs = kind === "recall" ? [`${b.id}:recall`] : b.quiz.map((_, i) => `${b.id}:quiz:${i}`);
      meta = { blockId: b.id };
      break;
    }
    case "boss": {
      const ch = chapterSummary(s).find((x) => x.id === opts.chapter);
      if (!ch || !ch.bossReady) throw new GameError(403, "Clear every building block in this chapter first.");
      const ids = BLOCKS.filter((b) => b.chapter === ch.id).map((b) => b.id);
      refs = sample(questionRefs(ids), 5);
      meta = { chapter: ch.id };
      hearts = 3;
      break;
    }
    case "storm":
    case "snow": {
      if (weather !== kind) throw new GameError(403, "Today's weather doesn't bring that challenge.");
      const ev = await c.query("SELECT challenge_status FROM daily_events WHERE user_id = $1 AND day = $2 FOR UPDATE", [userId, day]);
      if (!ev.rows[0] || ev.rows[0].challenge_status !== "none") throw new GameError(403, "You've already faced today's challenge.");
      const studied = studiedBlocks(s);
      if (studied.length < 2) throw new GameError(403, "Study at least two building blocks first.");
      refs = sample(questionRefs(studied), 5);
      meta = { day, seconds: kind === "storm" ? STORM_SECONDS : null };
      await c.query("UPDATE daily_events SET challenge_status = 'started' WHERE user_id = $1 AND day = $2", [userId, day]);
      break;
    }
    case "duel": {
      const rival = RIVALS.find((r) => r.id === opts.rivalId);
      if (!rival) throw new GameError(404, "No such rival.");
      const studied = studiedBlocks(s, rival.chapter);
      if (studied.length < 2) throw new GameError(403, `Study two building blocks of chapter ${rival.chapter} to challenge ${rival.name}.`);
      const today = await c.query(
        "SELECT 1 FROM runs WHERE user_id = $1 AND kind = 'duel' AND meta->>'rivalId' = $2 AND meta->>'day' = $3",
        [userId, rival.id, day],
      );
      if (today.rows[0]) throw new GameError(403, `${rival.name} has already duelled you today.`);
      refs = sample(questionRefs(studied), 5);
      const rivalAnswers = refs.map(() => ({
        correct: rand() < rival.accuracy,
        time: Math.round(rival.speed * (0.6 + rand() * 0.8) * 10) / 10,
      }));
      meta = { rivalId: rival.id, day, rival: rivalAnswers, encounterId: opts.encounterId ?? null };
      // A rival waiting on the road for you is answered by this duel too.
      await c.query(
        `UPDATE encounters SET status = 'fled' WHERE user_id = $1 AND status = 'pending' AND kind = 'rival'
         AND payload->>'rivalId' = $2 AND id <> $3`,
        [userId, rival.id, opts.encounterId ?? -1],
      );
      break;
    }
    case "beast":
    case "mystic": {
      const enc = await c.query("SELECT * FROM encounters WHERE id = $1 AND user_id = $2 FOR UPDATE", [opts.encounterId, userId]);
      const e = enc.rows[0];
      if (!e || e.status !== "pending" || e.kind !== kind) throw new GameError(404, "That encounter has wandered off.");
      refs = e.payload.refs;
      meta = { encounterId: e.id, name: e.payload.name, chapter: e.payload.chapter };
      hearts = kind === "beast" ? 2 : null;
      await c.query("UPDATE encounters SET status = 'fighting' WHERE id = $1", [e.id]);
      break;
    }
    case "wolf": {
      const moon = moonAt();
      if (!moon.isFull) throw new GameError(403, "The wolf only walks under a full moon.");
      const studied = studiedBlocks(s);
      if (studied.length < 2) throw new GameError(403, "Study at least two building blocks first.");
      const ins = await c.query(
        "INSERT INTO moon_events (user_id, cycle, kind) VALUES ($1, $2, 'wolf') ON CONFLICT DO NOTHING RETURNING cycle",
        [userId, moon.cycle],
      );
      if (!ins.rows[0]) throw new GameError(403, "You've already faced the wolf this full moon.");
      ({ refs, customs } = wolfQuestions(studied));
      meta = { cycle: moon.cycle };
      break;
    }
    default:
      throw new GameError(400, "Unknown run type.");
  }

  const seed = `${userId}:${Date.now()}:${rand()}`;
  const ins = await c.query(
    "INSERT INTO runs (user_id, kind, meta, questions, hearts) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [userId, kind, JSON.stringify(meta), JSON.stringify(makeQuestions(seed, refs, customs)), hearts],
  );
  return Number(ins.rows[0].id);
}

function hintRemoved(run: any): number | null {
  if (run.hint_idx !== run.idx) return null;
  const rq: RunQuestion = run.questions[run.idx];
  const q = qOf(rq);
  const wrongPositions = rq.order.map((orig, pos) => ({ orig, pos })).filter((x) => x.orig !== q.answer).map((x) => x.pos);
  return wrongPositions[Math.floor(seeded(`hint:${run.id}:${run.idx}`) * wrongPositions.length)];
}

function runHeader(run: any) {
  const rival = run.kind === "duel" ? RIVALS.find((r) => r.id === run.meta.rivalId) : undefined;
  const chapter = run.meta.chapter ? CHAPTERS.find((c) => c.id === run.meta.chapter) : undefined;
  const block = run.meta.blockId ? BLOCK_BY_ID.get(run.meta.blockId) : undefined;
  return {
    id: Number(run.id),
    kind: run.kind,
    status: run.status,
    idx: run.idx,
    total: run.questions.length,
    correct: run.correct,
    hearts: run.hearts,
    scoreYou: run.score_you,
    scoreRival: run.score_rival,
    seconds: run.meta.seconds ?? null,
    block: block ? { id: block.id, title: block.title, chapter: block.chapter } : null,
    boss: run.kind === "boss" && chapter ? { name: chapter.boss.name, taunt: chapter.boss.taunt, chapter: chapter.id } : null,
    foe: run.meta.name ? { name: run.meta.name, chapter: run.meta.chapter } : null,
    rival: rival ? { id: rival.id, name: rival.name, title: rival.title, chapter: rival.chapter, taunt: rival.taunt, colour: rival.colour } : null,
  };
}

/** Returns the current question. The first time it's served, the clock starts (for timed runs and duels). */
export async function serveRun(c: pg.PoolClient, userId: number, runId: number) {
  const r = await c.query("SELECT * FROM runs WHERE id = $1 AND user_id = $2 FOR UPDATE", [runId, userId]);
  const run = r.rows[0];
  if (!run) throw new GameError(404, "Run not found.");
  if (run.status !== "active") return { ...runHeader(run), question: null };
  if (run.served_idx !== run.idx) {
    await c.query("UPDATE runs SET served_idx = idx, served_at = now() WHERE id = $1", [runId]);
  }
  const rq: RunQuestion = run.questions[run.idx];
  const q = qOf(rq);
  return {
    ...runHeader(run),
    question: { text: q.q, options: rq.order.map((i) => q.options[i]), removed: hintRemoved(run), source: rq.ref.split(":")[0] },
  };
}

export async function useHint(c: pg.PoolClient, userId: number, runId: number, weather: Weather) {
  const r = await c.query("SELECT * FROM runs WHERE id = $1 AND user_id = $2 FOR UPDATE", [runId, userId]);
  const run = r.rows[0];
  if (!run || run.status !== "active") throw new GameError(404, "Run not found.");
  if (["duel", "storm", "wolf"].includes(run.kind)) throw new GameError(403, "No hints in duels, storms or the wolf's test.");
  if (weather === "fog") throw new GameError(403, "The fog is too thick for hints today.");
  if (run.hint_idx === run.idx) return { removed: hintRemoved(run) };
  const u = await c.query("UPDATE users SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold", [userId, HINT_COST]);
  if (!u.rows[0]) throw new GameError(403, `A hint costs ${HINT_COST} gold. Mint some gems first.`);
  await c.query("INSERT INTO ledger (user_id, kind, amount, reason) VALUES ($1, 'gold', $2, 'hint')", [userId, -HINT_COST]);
  await c.query("UPDATE runs SET hint_idx = idx WHERE id = $1", [runId]);
  run.hint_idx = run.idx;
  return { removed: hintRemoved(run) };
}

export async function saveProgress(
  c: pg.PoolClient, userId: number, blockId: string,
  p: { recall?: boolean; quizScore?: number; quizPassed?: boolean; scenario?: boolean },
) {
  await c.query(
    `INSERT INTO progress (user_id, block_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, blockId],
  );
  await c.query(
    `UPDATE progress SET
       recall_done   = recall_done OR $3,
       quiz_best     = GREATEST(quiz_best, $4),
       quiz_passed   = quiz_passed OR $5,
       scenario_done = scenario_done OR $6,
       updated_at    = now()
     WHERE user_id = $1 AND block_id = $2`,
    [userId, blockId, !!p.recall, p.quizScore ?? 0, !!p.quizPassed, !!p.scenario],
  );
}

/** Notes like "Block cleared!" and "Boss unlocked!" after progress changes. */
export function progressNotes(before: UserState, after: UserState, blockId: string): string[] {
  const notes: string[] = [];
  if (!blockCleared(before.progress.get(blockId)) && blockCleared(after.progress.get(blockId))) {
    notes.push(`Building block ${blockId} cleared!`);
    const ch = BLOCK_BY_ID.get(blockId)!.chapter;
    const sumB = chapterSummary(before).find((x) => x.id === ch);
    const sumA = chapterSummary(after).find((x) => x.id === ch);
    if (!sumB?.bossReady && sumA?.bossReady) notes.push(`The chapter ${ch} boss awaits!`);
  }
  return notes;
}

export async function answerRun(c: pg.PoolClient, userId: number, runId: number, choice: number, weather: Weather) {
  const r = await c.query("SELECT * FROM runs WHERE id = $1 AND user_id = $2 FOR UPDATE", [runId, userId]);
  const run = r.rows[0];
  if (!run) throw new GameError(404, "Run not found.");
  if (run.status !== "active") throw new GameError(409, "This run is already over.");
  if (run.served_idx !== run.idx) throw new GameError(409, "Load the question first.");

  const rq: RunQuestion = run.questions[run.idx];
  const q = qOf(rq);
  if (!Number.isInteger(choice) || choice < 0 || choice >= rq.order.length) throw new GameError(400, "Pick one of the options.");

  const elapsed = Math.min(600, (Date.now() - new Date(run.served_at).getTime()) / 1000);
  let correct = rq.order[choice] === q.answer;
  let timedOut = false;
  if (run.kind === "storm" && elapsed > STORM_SECONDS + 2) {
    correct = false;
    timedOut = true;
  }
  const correctPos = rq.order.indexOf(q.answer);

  let scoreYou = run.score_you;
  let scoreRival = run.score_rival;
  let rivalResult: { correct: boolean; time: number; points: number } | null = null;
  let yourPoints = 0;
  if (run.kind === "duel") {
    const ra = run.meta.rival[run.idx] as { correct: boolean; time: number };
    let rp = 0;
    if (correct && ra.correct) {
      if (elapsed <= ra.time) { yourPoints = 2; rp = 1; } else { yourPoints = 1; rp = 2; }
    } else if (correct) yourPoints = 2;
    else if (ra.correct) rp = 2;
    scoreYou += yourPoints;
    scoreRival += rp;
    rivalResult = { correct: ra.correct, time: ra.time, points: rp };
  }

  let hearts = run.hearts as number | null;
  if (!correct && hearts !== null) hearts -= 1;
  const nCorrect = run.correct + (correct ? 1 : 0);
  const nWrong = run.wrong + (correct ? 0 : 1);
  const nextIdx = run.idx + 1;
  const finished = nextIdx >= run.questions.length || hearts === 0;

  await c.query(
    `UPDATE runs SET idx = $2, correct = $3, wrong = $4, hearts = $5, score_you = $6, score_rival = $7,
       status = $8, finished_at = CASE WHEN $8 = 'active' THEN NULL ELSE now() END WHERE id = $1`,
    [runId, nextIdx, nCorrect, nWrong, hearts, scoreYou, scoreRival, finished ? "done" : "active"],
  );

  const result: any = {
    correct, timedOut, correctPos, why: q.why, elapsed: Math.round(elapsed * 10) / 10,
    rival: rivalResult, yourPoints, finished, hearts, scoreYou, scoreRival,
  };
  if (finished) {
    Object.assign(result, await finishRun(c, userId, { ...run, correct: nCorrect, wrong: nWrong, hearts, score_you: scoreYou, score_rival: scoreRival }, weather));
  }
  return result;
}

async function finishRun(c: pg.PoolClient, userId: number, run: any, weather: Weather): Promise<{ outcome: string; reward: Reward }> {
  const before = await loadState(c, userId);
  let reward = emptyReward();
  let outcome = "done";
  const day = run.meta.day;

  switch (run.kind) {
    case "recall": {
      const id = run.meta.blockId;
      if (run.correct === 1) {
        outcome = "win";
        if (!before.progress.get(id)?.recall_done) {
          await saveProgress(c, userId, id, { recall: true });
          reward = { ...reward, xp: 50, fundamental: 1 };
        } else reward.xp = 5;
      } else outcome = "lose";
      break;
    }
    case "quiz": {
      const id = run.meta.blockId;
      const passed = run.correct >= 2;
      outcome = passed ? "win" : "lose";
      await saveProgress(c, userId, id, { quizScore: run.correct, quizPassed: passed });
      if (passed && !before.progress.get(id)?.quiz_passed) {
        reward = { ...reward, xp: 40, quiz: weather === "fog" ? 2 : 1 };
        if (weather === "fog") reward.notes.push("Fog bonus: double quiz gem!");
      } else if (passed) reward.xp = 10;
      break;
    }
    case "boss": {
      const ch = run.meta.chapter as number;
      if (run.hearts > 0) {
        outcome = "win";
        await c.query("INSERT INTO chapter_clears (user_id, chapter) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, ch]);
        reward = { ...reward, xp: 200, fundamental: 1, scenario: 1, quiz: 1, items: [`gear-${ch}`] };
        reward.notes.push(`Chapter ${ch} cleared! You earned the ${CHAPTERS.find((x) => x.id === ch)!.gear.name}.`);
      } else outcome = "lose";
      break;
    }
    case "storm":
    case "snow": {
      const won = run.correct >= 4;
      outcome = won ? "win" : "lose";
      await c.query("UPDATE daily_events SET challenge_status = $3 WHERE user_id = $1 AND day = $2", [userId, day, won ? "won" : "lost"]);
      if (won && run.kind === "storm") reward = { ...reward, xp: 100, fundamental: 1, scenario: 1, quiz: 1, items: ["lightning-rod"] };
      if (won && run.kind === "snow") reward = { ...reward, xp: 80, fundamental: 1, quiz: 1, items: ["frost-scarf"] };
      break;
    }
    case "duel": {
      if (run.score_you > run.score_rival) {
        outcome = "win";
        reward = { ...reward, xp: 100, quiz: 2, items: ["rival-pennant"] };
        reward.notes.push("You took 100 gold off their weekly score.");
      } else if (run.score_you === run.score_rival) {
        outcome = "draw";
        reward.xp = 30;
      } else {
        outcome = "lose";
        reward.xp = 10;
      }
      if (run.meta.encounterId) {
        await c.query("UPDATE encounters SET status = $2 WHERE id = $1", [run.meta.encounterId, outcome === "win" ? "won" : "lost"]);
      }
      break;
    }
    case "beast": {
      const won = run.hearts > 0 && run.correct >= 2;
      outcome = won ? "win" : "lose";
      if (won) reward = { ...reward, xp: 60, scenario: 1, quiz: 1, items: ["wyrm-scale"] };
      await c.query("UPDATE encounters SET status = $2 WHERE id = $1", [run.meta.encounterId, won ? "won" : "lost"]);
      break;
    }
    case "wolf": {
      const won = run.correct >= 4;
      outcome = won ? "win" : "lose";
      if (won) {
        reward = { ...reward, xp: 250, fundamental: 3, items: ["wolf-pelt"] };
        reward.notes.push("The wolf howls in respect and leaves you its pelt.");
      } else if (run.correct >= 3) {
        reward.xp = 60;
        reward.notes.push("Close. The wolf grants you some XP and vanishes into the trees.");
      }
      await c.query("UPDATE moon_events SET status = $3 WHERE user_id = $1 AND cycle = $2 AND kind = 'wolf'", [userId, run.meta.cycle, won ? "won" : "lost"]);
      break;
    }
    case "mystic": {
      const won = run.correct === 1;
      outcome = won ? "win" : "lose";
      if (won) reward = { ...reward, xp: 80, fundamental: 1, items: ["mystic-orb"] };
      await c.query("UPDATE encounters SET status = $2 WHERE id = $1", [run.meta.encounterId, won ? "won" : "lost"]);
      break;
    }
  }

  const granted = await grant(c, userId, reward, `run:${run.kind}`, weather);
  if (run.meta.blockId) {
    const after = await loadState(c, userId);
    granted.notes.push(...progressNotes(before, after, run.meta.blockId));
  }
  return { outcome, reward: granted };
}

export { HINT_COST };
