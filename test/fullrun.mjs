// Plays the whole game: every block of every chapter, in prerequisite order, then every boss.
// Run against a fresh database after smoke.mjs has registered "chi".
import { BLOCKS, CHAPTERS, getQuestion } from "../dist/content/index.js";

const B = process.env.BASE ?? "http://localhost:3999";
let cookie = "";
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error("✗", m); } else console.log("✓", m); };
async function call(p, b, expect = 200) {
  const r = await fetch(B + p, {
    method: b === undefined ? "GET" : "POST",
    headers: { ...(b !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
  const s = r.headers.get("set-cookie");
  if (s) cookie = s.split(";")[0];
  const d = await r.json().catch(() => ({}));
  if (r.status !== expect) { failures++; console.error(`✗ ${p} expected ${expect} got ${r.status}`, d.error); }
  return d;
}
const refOf = (text) => {
  for (const b of BLOCKS) {
    if (b.recall.q === text) return `${b.id}:recall`;
    const i = b.quiz.findIndex((q) => q.q === text);
    if (i >= 0) return `${b.id}:quiz:${i}`;
  }
  throw new Error("unknown question " + text);
};
async function play(id) {
  let last;
  for (;;) {
    const r = await call(`/api/runs/${id}`);
    if (!r.question) return last;
    const q = getQuestion(refOf(r.question.text));
    last = await call(`/api/runs/${id}/answer`, { choice: r.question.options.indexOf(q.options[q.answer]) });
    if (last.finished) return last;
  }
}

await call("/api/auth/login", { username: "chi", password: "correct horse battery" });

const cleared = new Set();
let progress = true;
while (progress) {
  progress = false;
  const st = await call("/api/state?tz=Europe/Rome");
  for (const ch of st.chapters) {
    if (ch.status === "cleared" || ch.status === "locked" || ch.status === "soon") continue;
    const view = await call(`/api/chapters/${ch.id}`);
    for (const blk of view.blocks.filter((x) => x.status !== "cleared" && x.status !== "locked")) {
      const b = BLOCKS.find((x) => x.id === blk.id);
      if (!blk.recall) await play((await call("/api/runs", { kind: "recall", blockId: b.id })).id);
      if (!blk.quiz) await play((await call("/api/runs", { kind: "quiz", blockId: b.id })).id);
      if (!blk.scenario) {
        const v = await call(`/api/blocks/${b.id}`);
        await call(`/api/blocks/${b.id}/scenario`, { choice: v.scenario.choices.indexOf(b.scenario.choices.find((c) => c.correct).text) });
      }
      progress = true;
    }
    const again = await call(`/api/chapters/${ch.id}`);
    if (again.bossReady) {
      const res = await play((await call("/api/runs", { kind: "boss", chapter: ch.id })).id);
      ok(res.outcome === "win" && res.reward.items.includes(`gear-${ch.id}`), `chapter ${ch.id} boss beaten → ${CHAPTERS.find((c) => c.id === ch.id).gear.name}`);
      cleared.add(ch.id);
      progress = true;
    }
  }
}

const st = await call("/api/state?tz=Europe/Rome");
ok(st.chapters.every((c) => c.status === "cleared"), "all 12 chapters cleared");
const hero = await call("/api/hero");
ok(hero.gear.every((g) => g.owned), "all 12 pieces of gear owned");
console.log(`hero: LV ${hero.hero.level} ${hero.hero.rank}, ${hero.hero.xp} XP, gems ${JSON.stringify(hero.hero.gems)}`);
const rivals = await call("/api/rivals");
ok(rivals.rivals.length === 12 && rivals.rivals.every((r) => r.available || r.reason === "Already duelled today."), "all 12 rivals can be challenged (except any already duelled today)");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);
