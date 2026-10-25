// Simulates a Render restart: pauses and MET Norway entries saved in the database must still apply.
// Uses a fake store and fake fetch, so it needs no network or database. Run: node test/restart.mjs
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error("✗", m); } else console.log("✓", m); };
const quiet = (fn) => (...a) => { if (!/^\[(weather|upstream)\]/.test(String(a[0]))) fn(...a); };
console.log = quiet(console.log);
console.warn = quiet(console.warn);

const calls = [];
globalThis.fetch = async (url) => { calls.push(String(url)); throw new Error("no request should be sent"); };

const url = "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=45.67&lon=11.93";
const db = {
  breakers: [{ name: "open-meteo", until: Date.now() + 3 * 3600_000, failures: 0, strikes: 0, stopped: false, reason: "daily quota used up" }],
  met: new Map([[url, { reading: { weather: "rain", code: null, temp: 6, source: "met.no" }, expires: Date.now() + 20 * 60_000, lastModified: "Sat, 24 Oct 2026 23:00:00 GMT" }]]),
  saved: [],
};
const store = {
  loadBreakers: async () => db.breakers,
  saveBreaker: async (s) => { db.saved.push(s); },
  getMet: async (u) => db.met.get(u) ?? null,
  putMet: async (u, e) => { db.met.set(u, e); },
};

const { initUpstream, checkSources, upstreamStatus } = await import("../dist/game/weather.js");
await initUpstream(store);
ok(upstreamStatus()["open-meteo"].open, "after restart, Open-Meteo's daily pause is restored from the database");

const [a, b] = await checkSources(45.672, 11.927);
ok(a.skipped, `Open-Meteo skipped: ${a.detail}`);
ok(b.ok && /cached until Expires/.test(b.detail), "MET Norway answered from the saved entry, before its Expires");
ok(calls.length === 0, "no request sent to either service");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL GOOD");
process.exit(failures ? 1 : 0);
