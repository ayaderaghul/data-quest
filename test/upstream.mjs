// Unit tests for the upstream back-off rules. Run: node test/upstream.mjs (after npm run build)
import { Breaker, parseRetryAfter } from "../dist/game/upstream.js";

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error("✗", m); } else console.log("✓", m); };
const MIN = 60_000;
const now = Date.UTC(2026, 9, 24, 23, 37); // 23:37 UTC
console.warn = () => {};
console.log = ((log) => (...a) => { if (!String(a[0]).startsWith("[upstream]")) log(...a); })(console.log);

const until = (b) => Date.parse(b.status().until);

let b = new Breaker("om");
b.failure(429, null, '{"reason":"Daily API request limit exceeded. Please try again tomorrow."}', now);
ok(until(b) === Date.UTC(2026, 9, 25, 0, 5), "daily quota → wait until 00:05 UTC");
ok(b.isOpen(now + 10 * MIN) && !b.isOpen(Date.UTC(2026, 9, 25, 0, 6)), "open until then, closed after");

b = new Breaker("om");
b.failure(429, "120", "", now);
ok(until(b) === now + 120_000, "Retry-After: 120 seconds honoured");

b = new Breaker("om");
b.failure(429, '{"reason":"Hourly API request limit exceeded"}', '{"reason":"Hourly API request limit exceeded"}', now);
ok(until(b) === Date.UTC(2026, 9, 25, 0, 1), "hourly quota → next hour + 1 min");

b = new Breaker("met");
b.failure(403, null, "Forbidden", now);
ok(until(b) === now + 6 * 60 * MIN, "403 → back off 6 hours");

b = new Breaker("met");
const waits = [];
for (let i = 0; i < 7; i++) { b.failure(503, null, "", now); waits.push((until(b) - now) / MIN); }
ok(JSON.stringify(waits) === JSON.stringify([1, 2, 4, 8, 16, 30, 30]), `5xx backoff in minutes: ${waits.join(", ")}`);
b.success();
ok(!b.isOpen(now) && b.status().failures === 0, "success closes the breaker and resets backoff");
b.failure(null, null, "timeout", now);
ok(until(b) - now === MIN, "after recovery, backoff starts again from 1 minute");

ok(parseRetryAfter("Sat, 25 Oct 2026 00:00:00 GMT", now) === 23 * MIN, "Retry-After as an HTTP date");
ok(parseRetryAfter("999999", now) === 24 * 60 * MIN, "Retry-After capped at 24 hours");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);
