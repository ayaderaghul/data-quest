// Tests weather challenges and wild encounters. Run with DEV_WEATHER=storm and a seeded beast encounter.
import { BLOCKS, getQuestion } from "../dist/content/index.js";

const B = process.env.BASE ?? "http://localhost:3999";
let cookie = "";
async function call(p, b) {
  const r = await fetch(B + p, {
    method: b === undefined ? "GET" : "POST",
    headers: { ...(b !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
  const s = r.headers.get("set-cookie");
  if (s) cookie = s.split(";")[0];
  const d = await r.json().catch(() => ({}));
  if (!r.ok) console.log("ERR", p, r.status, d.error);
  return d;
}
function ref(t) {
  for (const b of BLOCKS) {
    if (b.recall.q === t) return `${b.id}:recall`;
    const i = b.quiz.findIndex((q) => q.q === t);
    if (i >= 0) return `${b.id}:quiz:${i}`;
  }
}
async function play(id) {
  let l;
  for (;;) {
    const r = await call(`/api/runs/${id}`);
    if (!r.question) return l;
    const q = getQuestion(ref(r.question.text));
    l = await call(`/api/runs/${id}/answer`, { choice: r.question.options.indexOf(q.options[q.answer]) });
    if (l.finished) return l;
  }
}

await call("/api/auth/login", { username: "chi", password: "correct horse battery" });
const st = await call("/api/state?tz=Europe/Rome");
console.log("weather:", st.weather.weather, "| challenge:", JSON.stringify(st.challenge), "| encounter:", st.encounter?.name);
const c = await call("/api/runs", { kind: "storm" });
const cr = await play(c.id);
console.log("storm:", cr.outcome, JSON.stringify(cr.reward));
console.log("second storm attempt (should be refused):");
await call("/api/runs", { kind: "storm" });
const e = await call("/api/encounter");
if (e.encounter) {
  const f = await call(`/api/encounter/${e.encounter.id}`, { action: "fight" });
  const fr = await play(f.runId);
  console.log("beast:", fr.outcome, JSON.stringify(fr.reward));
}
const h = await call("/api/hero");
console.log("items:", h.inventory.map((i) => i.id).join(","), "| gems:", JSON.stringify(h.hero.gems), "| xp:", h.hero.xp, "lvl", h.hero.level, h.hero.rank);
