// Tests location, teleport, the full-moon wolf and the new-moon fairy.
// Run after smoke.mjs against a server started with DEV_MOON=full (or DEV_MOON=new with MODE=new).
import { BLOCKS, getQuestion } from "../dist/content/index.js";
import { FAIRY_PUZZLES } from "../dist/content/fairy.js";

const B = process.env.BASE ?? "http://localhost:3999";
const MODE = process.env.MODE ?? "full";
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

await call("/api/auth/login", { username: "chi", password: "correct horse battery" });

if (MODE === "full") {
  let st = await call("/api/state?tz=Europe/Rome");
  ok(st.weather.needsLocation === true, "asks for a location before any weather");
  ok(st.encounter === null && st.challenge === null, "no encounters or challenges until located");

  await call("/api/location", { lat: 45.672, lon: 11.927, mode: "gps" });
  st = await call("/api/state?tz=Europe/Rome");
  ok(st.weather.place === "Castelfranco Veneto" && !st.weather.needsLocation, `GPS in Castelfranco → ${st.weather.place}, ${st.weather.weather}`);

  const geo = await call("/api/geo?q=Hanoi");
  ok(Array.isArray(geo.results), `city search answers (${geo.results.length} results; empty offline)`);

  const t1 = await call("/api/location", { lat: 21.03, lon: 105.85, name: "Hanoi", mode: "teleport" });
  ok(t1.cost === 0 && t1.weather.place === "Hanoi", "first teleport of the day is free");
  const before = (await call("/api/hero")).hero.gold;
  const t2 = await call("/api/location", { lat: 59.91, lon: 10.75, name: "Oslo", mode: "teleport" }, before >= 25 ? 200 : 403);
  if (before >= 25) ok(t2.cost === 25 && (await call("/api/hero")).hero.gold === before - 25, "second teleport costs 25 gold");
  else ok(true, "second teleport refused without gold");
  await call("/api/location", { lat: 999, lon: 0, mode: "gps" }, 400);
  ok(true, "rejects impossible coordinates");

  const moon = await call("/api/moon");
  ok(moon.wolf && moon.wolf.status === "waiting" && moon.wolf.ready, "wolf waits under the full moon");
  const run = await call("/api/runs", { kind: "wolf" });
  let last;
  for (;;) {
    const r = await call(`/api/runs/${run.id}`);
    if (!r.question) break;
    const block = BLOCKS.find((b) => b.quiz.some((q) => q.q === r.question.text));
    ok(r.question.options.includes(block.card.anchor), `wolf offers ${block.id}'s anchor as a shortcut`);
    await call(`/api/runs/${run.id}/hint`, {}, 403);
    last = await call(`/api/runs/${run.id}/answer`, { choice: r.question.options.indexOf(block.card.anchor) });
    if (last.finished) break;
  }
  ok(last.outcome === "win" && last.reward.items.includes("wolf-pelt") && last.reward.fundamental >= 3, "wolf test won: pelt + 3 fundamental gems");
  await call("/api/runs", { kind: "wolf" }, 403);
  ok(true, "only one wolf test per full moon");
} else {
  const moon = await call("/api/moon");
  ok(moon.fairy && moon.fairy.status === "waiting", "fairy appears at the new moon");
  const p = FAIRY_PUZZLES.find((x) => x.id === moon.fairy.puzzle.id);
  const shown = moon.fairy.puzzle.steps;
  const wrong = await call("/api/fairy", { order: [3, 2, 1, 0].map((i) => shown.indexOf(p.steps[i])) });
  ok(!wrong.solved && wrong.triesLeft === 2 && wrong.proverb === null, `wrong order: ${wrong.inPlace}/4 in place, proverb still hidden`);
  await call("/api/fairy", { order: [0, 0, 1, 2] }, 400);
  ok(true, "duplicate steps rejected");
  const right = await call("/api/fairy", { order: p.steps.map((step) => shown.indexOf(step)) });
  ok(right.solved && right.proverb?.text === p.proverb.text && right.reward.items.includes("fairy-lantern"), `solved: "${right.proverb?.text}"`);
  await call("/api/fairy", { order: [0, 1, 2, 3] }, 409);
  ok(true, "fairy only once per new moon");
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);
