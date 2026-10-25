// Checks that MET Norway responses are kept until their Expires time and revalidated with If-Modified-Since.
// Uses a fake fetch, so it needs no network. Run: node test/metno.mjs (after npm run build)
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error("✗", m); } else console.log("✓", m); };
const quiet = (fn) => (...a) => { if (!/^\[(weather|upstream)\]/.test(String(a[0]))) fn(...a); };
console.log = quiet(console.log);
console.warn = quiet(console.warn);

const LAST_MODIFIED = "Sat, 24 Oct 2026 23:00:00 GMT";
const calls = [];
let expiresIn = 1500;
globalThis.fetch = async (url, init = {}) => {
  const headers = init.headers ?? {};
  calls.push({ url: String(url), ims: headers["If-Modified-Since"] ?? null });
  if (String(url).includes("open-meteo")) {
    return new Response('{"reason":"Daily API request limit exceeded. Please try again tomorrow.","error":true}', { status: 429 });
  }
  const h = { Expires: new Date(Date.now() + expiresIn).toUTCString(), "Last-Modified": LAST_MODIFIED };
  if (headers["If-Modified-Since"] === LAST_MODIFIED) return new Response(null, { status: 304, headers: h });
  const body = { properties: { timeseries: [{ data: { instant: { details: { air_temperature: 6.2 } }, next_1_hours: { summary: { symbol_code: "lightrain" } } } }] } };
  return new Response(JSON.stringify(body), { status: 200, headers: h });
};

const { checkSources } = await import("../dist/game/weather.js");
const met = (n) => calls.filter((c) => c.url.includes("met.no")).slice(n);
const om = () => calls.filter((c) => c.url.includes("open-meteo")).length;

let [a, b] = await checkSources(45.672, 11.927);
ok(a.status === 429 && !a.ok, "open-meteo: daily quota 429");
ok(b.ok && b.detail.startsWith("rain"), `met.no answered: ${b.detail}`);
ok(met(0).length === 1 && met(0)[0].ims === null, "first met.no request has no If-Modified-Since");

[a, b] = await checkSources(45.672, 11.927);
ok(a.skipped && om() === 1, "open-meteo not asked again while its daily breaker is open");
ok(b.ok && b.status === null && /cached until Expires/.test(b.detail) && met(0).length === 1, "met.no not asked again before Expires");

await new Promise((r) => setTimeout(r, 1700)); // let Expires pass
expiresIn = 30 * 60_000;
[, b] = await checkSources(45.672, 11.927);
ok(met(0).length === 2 && met(1)[0].ims === LAST_MODIFIED, "after Expires: one request, with If-Modified-Since");
ok(b.ok && b.status === 304 && /not modified/.test(b.detail), `304 handled: ${b.detail}`);

[, b] = await checkSources(45.672, 11.927);
ok(met(0).length === 2 && /cached until Expires/.test(b.detail), "the 304's new Expires is honoured too");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);
