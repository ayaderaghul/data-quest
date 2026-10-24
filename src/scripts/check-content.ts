// Sanity checks for the chapter content: run with `npm run check` after editing content.
import { BLOCKS, BLOCK_BY_ID, CHAPTERS } from "../content/index.js";

let errors = 0;
const fail = (msg: string) => {
  errors++;
  console.error("✗", msg);
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
  }
  const correct = b.scenario.choices.filter((c) => c.correct).length;
  if (correct !== 1) fail(`${b.id}: scenario should have exactly one correct choice (has ${correct})`);
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
if (errors) {
  console.error(`${errors} problem(s) found`);
  process.exit(1);
}
console.log(`OK: ${BLOCKS.length} blocks checked`);
