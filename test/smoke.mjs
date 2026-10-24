// End-to-end smoke test against a running server.
// Usage: BASE=http://localhost:3999 INVITE=DQ-... node test/smoke.mjs
import { BLOCKS, getQuestion } from "../dist/content/index.js";

const BASE = process.env.BASE ?? "http://localhost:3999";
let cookie = "";
let failures = 0;

async function call(path, body, { expect = 200, jar = true } = {}) {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(jar && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set && jar) cookie = set.split(";")[0];
  const data = await res.json().catch(() => ({}));
  if (res.status !== expect) {
    failures++;
    console.error(`✗ ${path} expected ${expect}, got ${res.status}`, data);
  }
  return data;
}
const ok = (cond, msg) => { if (!cond) { failures++; console.error("✗", msg); } else console.log("✓", msg); };

// Answer every question in a run correctly (or wrongly) using the content source of truth.
async function playRun(id, { wrong = false } = {}) {
  let last;
  for (;;) {
    const r = await call(`/api/runs/${id}`);
    if (!r.question) return last;
    const ref = findRef(r.question.text);
    const q = getQuestion(ref);
    const right = r.question.options.indexOf(q.options[q.answer]);
    const pick = wrong ? (right + 1) % r.question.options.length : right;
    last = await call(`/api/runs/${id}/answer`, { choice: pick });
    if (last.finished) return last;
  }
}
function findRef(text) {
  for (const b of BLOCKS) {
    if (b.recall.q === text) return `${b.id}:recall`;
    const i = b.quiz.findIndex((q) => q.q === text);
    if (i >= 0) return `${b.id}:quiz:${i}`;
  }
  throw new Error("unknown question " + text);
}

const status = await call("/api/auth/status", undefined, { jar: false });
ok(status.registrationOpen === true, "registration open before first user");

await call("/api/state", undefined, { expect: 401, jar: false });
ok(true, "state requires a session");

await call("/api/auth/register", { username: "chi", password: "correct horse battery", invite: "DQ-WRONG-WRONG-WRONG" }, { expect: 403, jar: false });
ok(true, "wrong invite rejected");

await call("/api/auth/register", { username: "chi", password: "correct horse battery", invite: process.env.INVITE.toLowerCase() });
ok(!!cookie, "registered with invite (case-insensitive) and got a session");

const cookieChi = cookie;
cookie = "";
await call("/api/auth/register", { username: "intruder", password: "another long password", invite: process.env.INVITE }, { expect: 403 });
ok(true, "second registration refused even with the right code");
cookie = cookieChi;

const st = await call("/api/state?tz=Europe/Rome");
ok(st.hero.level === 1 && st.hero.gold === 0, "fresh hero at level 1");
ok(st.chapters.find((c) => c.id === 1).status === "open", "chapter 1 open");
ok(st.chapters.find((c) => c.id === 2).status === "locked", "chapter 2 locked");
ok(!!st.weather.weather, `weather event: ${st.weather.weather}`);
const expectGold = st.weather.weather === "sunny" ? 66 : 60;

await call("/api/blocks/1.3", undefined, { expect: 403 });
ok(true, "block 1.3 locked until 1.2 cleared");

await call("/api/runs", { kind: "quiz", blockId: "1.1" }, { expect: 403 });
ok(true, "quiz locked before the recall check");

// Clear every block in chapter 1.
for (const b of BLOCKS.filter((x) => x.chapter === 1).sort((a, z) => a.id.localeCompare(z.id))) {
  const bad = await call("/api/runs", { kind: "recall", blockId: b.id });
  const lost = await playRun(bad.id, { wrong: true });
  ok(lost.outcome === "lose" && !lost.reward.fundamental, `${b.id} wrong recall gives no gem`);
  const { id } = await call("/api/runs", { kind: "recall", blockId: b.id });
  const rec = await playRun(id);
  ok(rec.outcome === "win" && rec.reward.fundamental >= 1, `${b.id} recall gem`);
  const quiz = await call("/api/runs", { kind: "quiz", blockId: b.id });
  const qr = await playRun(quiz.id);
  ok(qr.outcome === "win" && qr.reward.quiz >= 1, `${b.id} quiz gem`);
  const view = await call(`/api/blocks/${b.id}`);
  const correctText = b.scenario.choices.find((c) => c.correct).text;
  const sr = await call(`/api/blocks/${b.id}/scenario`, { choice: view.scenario.choices.indexOf(correctText) });
  ok(sr.correct && sr.reward.scenario >= 1, `${b.id} scenario gem`);
}

let ch1 = await call("/api/chapters/1");
ok(ch1.bossReady, "chapter 1 boss ready");
const boss = await call("/api/runs", { kind: "boss", chapter: 1 });
const br = await playRun(boss.id);
ok(br.outcome === "win" && br.reward.items.includes("gear-1"), "boss beaten, helm earned");
const st2 = await call("/api/state?tz=Europe/Rome");
ok(st2.chapters.find((c) => c.id === 2).status === "open", "chapter 2 unlocked after boss");
ok(st2.equipped.includes("gear-1"), "helm in inventory");

// Hint costs gold; mint first.
const hero = await call("/api/hero");
const g = hero.hero.gems;
const m = await call("/api/mint", { fundamental: 1, scenario: 1, quiz: 1 });
ok(m.gold === expectGold, `mint 1+1+1 gems = ${expectGold} gold`);
await call("/api/mint", { fundamental: 999 }, { expect: 403 });
ok(true, "can't mint gems you don't have");

const q2 = await call("/api/runs", { kind: "recall", blockId: "2.1" });
const served = await call(`/api/runs/${q2.id}`);
const hint = await call(`/api/runs/${q2.id}/hint`, {});
ok(typeof hint.removed === "number", "hint removes an option");
const hintedQ = getQuestion("2.1:recall");
ok(served.question.options[hint.removed] !== hintedQ.options[hintedQ.answer], "hint never removes the right answer");

const rivals = await call("/api/rivals");
const nines = rivals.rivals.find((r) => r.id === "nines");
ok(nines.available, "Lady Nines duel available");
const duel = await call("/api/runs", { kind: "duel", rivalId: "nines" });
const dr = await playRun(duel.id);
ok(["win", "lose", "draw"].includes(dr.outcome) && typeof dr.scoreYou === "number", `duel finished: ${dr.outcome} ${dr.scoreYou}-${dr.scoreRival}`);
await call("/api/runs", { kind: "duel", rivalId: "nines" }, { expect: 403 });
ok(true, "only one duel per rival per day");

const lb = await call("/api/leaderboard");
ok(lb.rows.length === 9 && lb.rows.some((r) => r.you && r.gold === expectGold), "leaderboard has 8 rivals + you with your minted gold");

await call("/api/shop/buy", { item: "plume" }, { expect: 403 });
ok(true, "can't afford the plume yet");

await call("/api/auth/logout", {});
await call("/api/hero", undefined, { expect: 401 });
ok(true, "logout ends the session");
await call("/api/auth/login", { username: "chi", password: "wrong password!!" }, { expect: 401 });
await call("/api/auth/login", { username: "chi", password: "correct horse battery" });
ok(true, "login works");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);
