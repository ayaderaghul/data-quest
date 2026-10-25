// Unit tests for the pause rules applied to every third-party API. Run: node test/upstream.mjs (after npm run build)
import { Breaker, parseRetryAfter, setBreakerPersistence } from "../dist/game/upstream.js";

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error("✗", m); } else console.log("✓", m); };
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const now = Date.UTC(2026, 9, 24, 23, 37); // 23:37 UTC
console.warn = () => {};
console.log = ((log) => (...a) => { if (!String(a[0]).startsWith("[upstream]")) log(...a); })(console.log);
const saved = [];
setBreakerPersistence((s) => saved.push(s));
const until = (b) => b.state().until;

let b = new Breaker("om");
b.failure(429, null, '{"reason":"Daily API request limit exceeded. Please try again tomorrow."}', now);
ok(until(b) === Date.UTC(2026, 9, 25, 0, 5), "daily quota → paused until 00:05 UTC");
ok(b.isOpen(now + 10 * MIN) && !b.isOpen(Date.UTC(2026, 9, 25, 0, 6)), "open until then, closed after");
ok(saved.length === 1 && saved[0].name === "om", "every change is handed to the database writer");

b = new Breaker("x");
b.failure(503, "120", "", now);
ok(until(b) === now + 120_000, "Retry-After: 120 s honoured (on any status)");
b = new Breaker("x");
b.failure(429, String(3 * DAY / 1000), "", now);
ok(until(b) === now + DAY, "Retry-After capped at one day");

b = new Breaker("met");
b.failure(403, null, "Forbidden", now);
ok(until(b) === now + HOUR && b.isBlocked(now) && b.status(now).reason.includes("you are blocked"), "1st 403 → 'you are blocked', paused 1 hour");
b.failure(403, null, "Forbidden", now + HOUR);
ok(until(b) === now + HOUR + DAY, "2nd 403 in a row → paused 1 day");
b.failure(403, null, "Forbidden", now + HOUR + DAY);
ok(b.state().stopped && b.isOpen(now + 365 * DAY), "3rd 403 in a row → calls stopped for good");
b.reset();
ok(!b.isOpen(now) && b.state().strikes === 0, "a manual reset lifts the stop");

b = new Breaker("met");
const waits = [];
for (let i = 0; i < 8; i++) { b.failure(i % 2 ? null : 503, null, "", now); waits.push((until(b) - now) / MIN); }
ok(JSON.stringify(waits) === JSON.stringify([1, 2, 4, 8, 16, 32, 60, 60]), `errors/timeouts back off (min): ${waits.join(", ")}`);
b.success();
ok(!b.isOpen(now) && b.state().failures === 0, "success closes the breaker and resets backoff");

b = new Breaker("geo");
const paused404 = b.failure(404, null, "Not found", now);
const paused400 = b.failure(400, null, "Bad request", now);
ok(!paused404 && !paused400 && !b.isOpen(now) && until(b) === 0, "400/404 for one place never pauses the service");

b = new Breaker("om");
b.failure(403, null, "", now);
b.success();
b.failure(403, null, "", now);
ok(until(b) === now + HOUR, "a success in between resets the 403 strikes");

ok(parseRetryAfter("Sat, 25 Oct 2026 00:00:00 GMT", now) === 23 * MIN, "Retry-After as an HTTP date");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);
