// Sanity checks for the chapter content: run with `npm run check` after editing content.
import { BLOCKS, BLOCK_BY_ID, CHAPTERS } from "../content/index.js";

let errors = 0;
const fail = (msg: string) => {
  errors++;
  console.error("✗", msg);
};

let longestCorrect = 0;
let total = 0;
let scenLongest = 0;
const isLongest = (texts: string[], i: number) => {
  const lens = texts.map((t) => t.length);
  const max = Math.max(...lens);
  return lens[i] === max && lens.filter((l) => l === max).length === 1;
};

for (const b of BLOCKS) {
  const ch = CHAPTERS.find((c) => c.id === b.chapter);
  if (!ch?.available) fail(`${b.id}: chapter ${b.chapter} is not marked available`);
  if (!b.id.startsWith(`${b.chapter}.`)) fail(`${b.id}: id doesn't match chapter`);
  for (const n of b.needs) {
    const dep = BLOCK_BY_ID.get(n);
    if (!dep) fail(`${b.id}: needs unknown block ${n}`);
    else if (dep.chapter !== b.chapter) fail(`${b.id}: needs ${n} from another chapter`);
  }
  if (b.quiz.length !== 3) fail(`${b.id}: quiz should have 3 questions`);
  for (const q of [b.recall, ...b.quiz]) {
    if (q.options.length < 3) fail(`${b.id}: "${q.q}" has fewer than 3 options`);
    if (q.answer < 0 || q.answer >= q.options.length) fail(`${b.id}: "${q.q}" answer out of range`);
    if (new Set(q.options).size !== q.options.length) fail(`${b.id}: "${q.q}" has duplicate options`);
    total++;
    if (isLongest(q.options, q.answer)) longestCorrect++;
    // A correct answer much longer than every distractor is a giveaway.
    const right = q.options[q.answer].length;
    const longestWrong = Math.max(...q.options.filter((_, i) => i !== q.answer).map((o) => o.length));
    if (right > longestWrong * 1.6 && right - longestWrong > 15) {
      fail(`${b.id}: "${q.q}" correct answer is far longer than every distractor`);
    }
  }
  const correct = b.scenario.choices.filter((c) => c.correct).length;
  if (correct !== 1) fail(`${b.id}: scenario should have exactly one correct choice (has ${correct})`);
  const texts = b.scenario.choices.map((c) => c.text);
  if (isLongest(texts, b.scenario.choices.findIndex((c) => c.correct))) scenLongest++;
}

// Every block must be reachable: no cycles in prerequisites.
const reachable = new Set<string>();
let grew = true;
while (grew) {
  grew = false;
  for (const b of BLOCKS) {
    if (!reachable.has(b.id) && b.needs.every((n) => reachable.has(n))) {
      reachable.add(b.id);
      grew = true;
    }
  }
}
for (const b of BLOCKS) if (!reachable.has(b.id)) fail(`${b.id}: unreachable (prerequisite cycle?)`);

for (const ch of CHAPTERS.filter((c) => c.available)) {
  const n = BLOCKS.filter((b) => b.chapter === ch.id).length;
  console.log(`Chapter ${ch.id} ${ch.title}: ${n} blocks`);
}

// "Pick the longest answer" must not be a winning strategy.
const qShare = longestCorrect / total;
const sShare = scenLongest / BLOCKS.length;
console.log(`Correct answer is the longest option: questions ${Math.round(qShare * 100)}%, scenarios ${Math.round(sShare * 100)}%`);
if (qShare > 0.45) fail(`questions: the correct answer is the longest ${Math.round(qShare * 100)}% of the time (max 45%)`);
if (sShare > 0.45) fail(`scenarios: the correct choice is the longest ${Math.round(sShare * 100)}% of the time (max 45%)`);

if (errors) {
  console.error(`${errors} problem(s) found`);
  process.exit(1);
}
console.log(`OK: ${BLOCKS.length} blocks checked`);
