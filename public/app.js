// Data Quest — 8-bit DDIA study game. Vanilla JS, hash routing, no build step.

const $app = document.getElementById("app");
const $toast = document.getElementById("toast");

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n).toLocaleString("en-US");

let cleanup = null;
function setCleanup(fn) {
  if (cleanup) cleanup();
  cleanup = fn;
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && !path.startsWith("/api/auth")) {
    location.hash = "#/login";
    throw new Error("Please sign in.");
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.className = msg ? "toast-show" : "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.textContent = ""; $toast.className = ""; }, 3500);
}

function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
    localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
}

// Location is only read when you press "share my location", never silently.
function askLocation() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("This browser can't share a location. Choose a city instead."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }),
      (err) => reject(new Error(err.code === 1 ? "Location permission was declined. Choose a city instead." : "Couldn't find your location. Choose a city instead.")),
      { timeout: 10000, maximumAge: 3600 * 1000 },
    );
  });
}

async function useMyLocation() {
  try {
    toast("Asking the sky where you are...");
    const pos = await askLocation();
    await api("/api/location", { ...pos, mode: "gps" });
    toast("Weather found!");
    location.hash = "#/";
    route();
  } catch (err) { toast(err.message); }
}

// ---------- moon ----------
const SYNODIC = 29.530588853;
const KNOWN_NEW = Date.UTC(2000, 0, 6, 18, 14);
const moonFraction = (t) => ((((t - KNOWN_NEW) / 864e5) % SYNODIC + SYNODIC) % SYNODIC) / SYNODIC;
function moonIcon(fraction, size = 24) {
  let s = "";
  const n = 12, r = 5.5, c = 5.5;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x - c) / r, dy = (y - c) / r;
      if (dx * dx + dy * dy > 1) continue;
      const w = Math.sqrt(1 - dy * dy);
      const t = w * Math.cos(2 * Math.PI * fraction);
      const lit = fraction < 0.5 ? dx > t : dx < -t;
      s += R(x, y, 1, 1, lit ? "#f4f1de" : "#3d3d7a");
    }
  }
  return svg("0 0 12 12", size, size, s);
}

// ---------- pixel art ----------
const R = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const svg = (vb, w, h, inner, label) =>
  `<svg width="${w}" height="${h}" viewBox="${vb}" shape-rendering="crispEdges" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${inner}</svg>`;

const GEM = {
  fundamental: ["#5ee6eb", "#2bb5c0"],
  scenario: ["#ff9ecb", "#d9628f"],
  quiz: ["#f7c548", "#b8860b"],
};
function gemIcon(kind, size = 14) {
  const [a, b] = GEM[kind];
  return svg("0 0 7 7", size, size, R(2, 0, 3, 1, a) + R(1, 1, 5, 2, a) + R(2, 3, 3, 2, b) + R(3, 5, 1, 2, b));
}
function coin(size = 14) {
  return svg("0 0 7 7", size, size, R(1, 0, 5, 7, "#f7c548") + R(0, 1, 7, 5, "#f7c548") + R(3, 2, 1, 3, "#b8860b"));
}

function heroSvg(items, rank, size = 84) {
  const has = (id) => items.includes(id);
  const tunic = rank === "Peasant" ? "#8a6a4a" : rank === "Squire" ? "#4f7cff" : "#3b5bd6";
  let s = "";
  if (has("royal-cape")) s += R(2, 5, 8, 9, "#b0413e");
  else if (has("wolf-pelt")) s += R(2, 5, 8, 7, "#9aa3b8");
  if (has("gear-1")) s += R(3, 1, 6, 4, "#c0c7d6") + R(4, 3, 4, 1, "#14142e");
  else s += R(4, 1, 4, 4, "#f2c9a0") + R(4, 1, 4, 1, "#5a3a22") + R(5, 3, 1, 1, "#14142e") + R(7, 3, 1, 1, "#14142e");
  if (has("plume")) s += R(5, 0, 3, 1, "#ff6b8a");
  if (rank === "King") s += R(4, 0, 4, 1, "#f7c548");
  s += R(3, 5, 6, 6, tunic) + R(2, 6, 1, 4, tunic) + R(9, 6, 1, 4, tunic);
  if (has("gold-trim")) s += R(3, 5, 6, 1, "#f7c548") + R(5, 6, 2, 3, "#f7c548");
  if (has("frost-scarf")) s += R(4, 5, 4, 1, "#5ee6eb") + R(4, 6, 1, 2, "#5ee6eb");
  if (has("gear-5")) s += R(1, 5, 3, 2, "#e8ecf5") + R(8, 5, 3, 2, "#e8ecf5");
  s += has("gear-2") ? R(2, 10, 1, 1, "#6b3fa0") + R(9, 10, 1, 1, "#6b3fa0") : R(2, 10, 1, 1, "#f2c9a0") + R(9, 10, 1, 1, "#f2c9a0");
  s += R(3, 10, 6, 1, has("gear-4") ? "#f7c548" : "#5a3a22");
  s += R(4, 11, 1, 3, "#8a5a3b") + R(7, 11, 1, 3, "#8a5a3b");
  s += has("gear-3") ? R(3, 14, 2, 2, "#6b6b9a") + R(7, 14, 2, 2, "#6b6b9a") : R(4, 14, 1, 1, "#3a2a1a") + R(7, 14, 1, 1, "#3a2a1a");
  s += rank === "Peasant" ? R(11, 3, 1, 9, "#8a5a3b") : R(11, 2, 1, 8, "#e8ecf5") + R(10, 9, 2, 1, "#f7c548");
  if (has("lightning-rod")) s += R(0, 2, 1, 9, "#c0c7d6") + R(0, 1, 1, 1, "#f7c548");
  else if (has("fairy-lantern")) s += R(0, 9, 2, 2, "#f7c548") + R(0, 8, 1, 1, "#c9b8ff");
  return svg("0 0 12 16", size, Math.round(size * 16 / 12), s, `Your ${rank}`);
}

function knightSvg(colour, size = 48) {
  return svg("0 0 9 12", size, Math.round(size * 12 / 9),
    R(2, 0, 5, 4, "#9aa3b8") + R(3, 2, 3, 1, "#14142e") + R(1, 4, 7, 5, colour) + R(1, 8, 7, 1, "#c0c7d6") +
    R(0, 5, 2, 3, "#c0c7d6") + R(2, 9, 1, 3, "#6b6b9a") + R(6, 9, 1, 3, "#6b6b9a") + R(8, 1, 1, 7, "#e8ecf5"));
}
function beastSvg(size = 120) {
  return svg("0 0 16 11", size, Math.round(size * 11 / 16),
    R(1, 7, 3, 3, "#8a5a3b") + R(4, 6, 3, 3, "#a06a43") + R(7, 5, 3, 3, "#8a5a3b") + R(10, 3, 4, 4, "#6ee07a") +
    R(11, 4, 1, 1, "#0b0b1e") + R(14, 5, 2, 1, "#ff6b8a") + R(11, 1, 1, 2, "#f4f1de") + R(13, 1, 1, 2, "#f4f1de"), "A wild beast");
}
function mysticSvg(size = 72) {
  return svg("0 0 8 12", size, Math.round(size * 12 / 8),
    R(2, 0, 4, 3, "#6b3fa0") + R(3, 2, 2, 2, "#f2c9a0") + R(1, 4, 6, 8, "#6b3fa0") + R(3, 5, 2, 1, "#f7c548") +
    R(0, 1, 1, 10, "#8a5a3b") + R(0, 0, 1, 1, "#5ee6eb"), "A mystic");
}
function wolfSvg(size = 64) {
  return svg("0 0 14 10", size, Math.round(size * 10 / 14),
    R(1, 4, 9, 4, "#9aa3b8") + R(9, 2, 4, 4, "#9aa3b8") + R(10, 1, 1, 1, "#9aa3b8") + R(12, 1, 1, 1, "#9aa3b8") + R(11, 3, 1, 1, "#f7c548") +
    R(13, 4, 1, 1, "#14142e") + R(0, 3, 2, 2, "#c0c7d6") + R(2, 8, 1, 2, "#6b6b9a") + R(8, 8, 1, 2, "#6b6b9a") + R(3, 5, 5, 2, "#c0c7d6"), "A grey wolf");
}
function fairySvg(size = 48) {
  return svg("0 0 10 10", size, size,
    R(0, 2, 3, 3, "#c9b8ff") + R(7, 2, 3, 3, "#c9b8ff") + R(4, 1, 2, 2, "#f2c9a0") + R(4, 0, 2, 1, "#f7c548") + R(4, 3, 2, 4, "#5ee6eb") +
    R(4, 7, 1, 2, "#f2c9a0") + R(5, 7, 1, 2, "#f2c9a0") + R(8, 6, 1, 1, "#f7c548") + R(1, 7, 1, 1, "#f7c548"), "A tiny fairy");
}
function elfSvg(size = 60) {
  return svg("0 0 8 12", size, Math.round(size * 12 / 8),
    R(2, 0, 4, 2, "#2e8b57") + R(2, 2, 4, 3, "#f2c9a0") + R(1, 2, 1, 1, "#f2c9a0") + R(6, 2, 1, 1, "#f2c9a0") +
    R(3, 3, 1, 1, "#0b0b1e") + R(5, 3, 1, 1, "#0b0b1e") + R(1, 5, 6, 5, "#2e8b57") + R(2, 10, 1, 2, "#5a3a22") + R(5, 10, 1, 2, "#5a3a22") +
    R(6, 6, 2, 2, "#f7c548"), "A wandering elf");
}

const WEATHER_ICON = {
  sunny: R(4, 4, 4, 4, "#f7c548") + R(5, 1, 2, 2, "#f7c548") + R(5, 9, 2, 2, "#f7c548") + R(1, 5, 2, 2, "#f7c548") + R(9, 5, 2, 2, "#f7c548"),
  cloudy: R(2, 4, 8, 3, "#c0c7d6") + R(1, 5, 10, 3, "#9aa3b8"),
  rain: R(2, 2, 8, 3, "#c0c7d6") + R(1, 3, 10, 3, "#9aa3b8") + R(2, 8, 1, 2, "#5ee6eb") + R(5, 9, 1, 2, "#5ee6eb") + R(8, 8, 1, 2, "#5ee6eb"),
  snow: R(2, 2, 8, 3, "#e8ecf5") + R(1, 3, 10, 3, "#c0c7d6") + R(2, 8, 1, 1, "#fff") + R(5, 10, 1, 1, "#fff") + R(8, 8, 1, 1, "#fff") + R(4, 7, 1, 1, "#fff"),
  storm: R(2, 1, 8, 3, "#6b6b9a") + R(1, 2, 10, 3, "#4a4a66") + R(6, 6, 2, 2, "#f7c548") + R(5, 8, 2, 2, "#f7c548") + R(6, 10, 1, 2, "#f7c548"),
  fog: R(1, 3, 10, 1, "#9aa3b8") + R(2, 5, 9, 1, "#c0c7d6") + R(1, 7, 10, 1, "#9aa3b8") + R(3, 9, 8, 1, "#c0c7d6"),
};
const weatherIcon = (w, size = 48) => svg("0 0 12 12", size, size, WEATHER_ICON[w] || WEATHER_ICON.cloudy);

// ---------- shared bits ----------
function nav(active) {
  const item = (href, ico, label, key) => `<a href="${href}" class="${active === key ? "on" : ""}"><span class="ico" aria-hidden="true">${ico}</span>${label}</a>`;
  return `<nav class="nav" aria-label="Main">${item("#/", "▣", "MAP", "map")}${item("#/hero", "♞", "HERO", "hero")}${item("#/rivals", "⚔", "RIVALS", "rivals")}${item("#/board", "♛", "HALL", "board")}</nav>`;
}

function topbar(back, kicker, title, extra = "", colour = "var(--panel)") {
  return `<header class="topbar" style="background:${colour}">
    ${back ? `<a class="back" href="${back}" aria-label="Back">&lt;</a>` : ""}
    <div class="grow"><div class="label">${kicker}</div><h1 class="title">${title}</h1></div>${extra}</header>`;
}

function rewardBox(reward, heading = "REWARDS") {
  if (!reward) return "";
  const lines = [];
  if (reward.xp) lines.push(["XP", `+${reward.xp}`]);
  if (reward.gold) lines.push([`${coin()} gold`, `+${reward.gold}`]);
  for (const k of ["fundamental", "scenario", "quiz"]) if (reward[k]) lines.push([`${gemIcon(k)} ${k} gem`, `+${reward[k]}`]);
  for (const it of reward.items || []) lines.push([`◈ ${esc(ITEM_NAMES[it] || it)}`, "NEW"]);
  if (!lines.length && !(reward.notes || []).length) return "";
  return `<div class="reward"><div class="pf" style="font-size:10px">${heading}</div>
    ${lines.map(([a, b]) => `<div class="line"><span>${a}</span><span>${b}</span></div>`).join("")}
    ${(reward.notes || []).map((n) => `<div class="note">${esc(n)}</div>`).join("")}</div>`;
}

const ITEM_NAMES = {
  "gear-1": "Reliability Helm", "gear-2": "Schema Gloves", "gear-3": "B-Tree Boots", "gear-4": "Encoding Belt", "gear-5": "Follower's Pauldrons",
  plume: "Red Plume", "gold-trim": "Gold Trim", "royal-cape": "Royal Cape", "lightning-rod": "Lightning Rod", "frost-scarf": "Frost Scarf",
  "wyrm-scale": "Wyrm Scale", "mystic-orb": "Mystic Orb", "rival-pennant": "Rival's Pennant", "wolf-pelt": "Wolf Pelt", "fairy-lantern": "Fairy Lantern",
};

function loading() {
  $app.innerHTML = `<main class="screen no-nav"><div class="pad center" style="margin-top:40vh"><div class="pf pulse" style="font-size:11px">LOADING...</div></div></main>`;
}
function errorScreen(err) {
  $app.innerHTML = `<main class="screen">${topbar("#/", "OOPS", "SOMETHING BROKE")}<div class="pad col"><p>${esc(err.message)}</p><a class="btn" href="#/">BACK TO MAP</a></div>${nav()}</main>`;
}

// ---------- screens ----------

async function screenLogin() {
  const { registrationOpen } = await api("/api/auth/status");
  const reg = registrationOpen;
  $app.innerHTML = `<main class="screen no-nav">
    <div class="pad col" style="margin-top:8vh;align-items:center;text-align:center">
      ${heroSvg([], "Peasant", 96)}
      <h1 class="pf" style="font-size:18px;line-height:1.5;color:var(--gold)">DATA QUEST</h1>
      <p class="muted">An 8-bit journey through<br>Designing Data-Intensive Applications</p>
    </div>
    <form class="pad col" id="f" novalidate>
      <div class="field"><label for="u" class="label">USERNAME</label><input id="u" name="username" autocomplete="username" required></div>
      <div class="field"><label for="p" class="label">PASSWORD${reg ? " (10+ CHARACTERS)" : ""}</label><input id="p" name="password" type="password" autocomplete="${reg ? "new-password" : "current-password"}" required></div>
      ${reg ? `<div class="field"><label for="i" class="label">INVITE CODE</label><input id="i" name="invite" autocomplete="off" autocapitalize="characters" placeholder="DQ-XXXXX-XXXXX-XXXXX" required></div>` : ""}
      <p class="error" id="err" role="alert"></p>
      <button class="btn" type="submit">${reg ? "BEGIN THE QUEST ▶" : "ENTER ▶"}</button>
    </form></main>`;
  document.getElementById("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    try {
      await api(reg ? "/api/auth/register" : "/api/auth/login", body);
      location.hash = "#/";
    } catch (err) {
      document.getElementById("err").textContent = err.message;
    }
  });
}

async function screenMap() {
  const q = new URLSearchParams({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome" });
  const st = await api(`/api/state?${q}`);
  const h = st.hero;
  const w = st.weather;
  currentItems = st.equipped;
  currentRank = h.rank;
  const pct = Math.round(((h.xp - h.levelStart) / Math.max(1, h.levelNext - h.levelStart)) * 100);

  const regions = [1, 2, 3].map((r) => {
    const chs = st.chapters.filter((c) => c.region === r);
    const nodes = chs.map((c) => {
      const sub = c.status === "cleared" ? "★" : c.status === "soon" ? "SOON" : c.status === "locked" ? "LOCK" : c.bossReady ? "BOSS!" : `${c.blocksCleared}/${c.blocksTotal}`;
      const href = c.status === "soon" ? "" : `href="#/ch/${c.id}"`;
      return `<a ${href} class="node st-${c.status}${c.bossReady ? " pulse" : ""}" aria-label="Chapter ${c.id}: ${esc(c.title)}, ${c.status}">${c.id}<span class="sub">${sub}</span></a>`;
    }).join("");
    const needs = chs.filter((c) => c.needs.length).map((c) => `${c.id} needs ${c.needs.join(" + ")}`).join(" · ");
    return `<section class="region r${r}">
      <h2 class="label" style="color:${["", "#9ff0a8", "#c9b8ff", "#ffb3c7"][r]}">${["", "I", "II", "III"][r]} · ${esc(st.regions[r]).toUpperCase()}</h2>
      <div class="nodes" style="grid-template-columns:repeat(${chs.length}, minmax(0,1fr))">${nodes}</div>
      ${needs ? `<p class="tiny muted" style="margin:8px 0 0">${needs}</p>` : ""}</section>`;
  }).join("");

  const enc = st.encounter;
  const encCard = enc ? `<a href="#/enc" class="px pulse" style="display:flex;gap:12px;align-items:center;text-decoration:none;color:var(--ink);background:#3b2440">
      ${enc.kind === "beast" ? beastSvg(64) : enc.kind === "mystic" ? mysticSvg(36) : enc.kind === "elf" ? elfSvg(32) : knightSvg(enc.rival?.colour || "#888", 32)}
      <div class="grow"><div class="label" style="color:#ffb3c7">WILD ENCOUNTER</div><div style="font-size:21px">${esc(enc.name)} appears!</div></div><span class="pf" style="font-size:10px;color:var(--gold)">▶</span></a>` : "";

  const ch = st.challenge;
  let chCard = "";
  if (ch) {
    const title = ch.kind === "storm" ? "⚡ STORM CHALLENGE" : "❄ FROZEN CACHE";
    const body = ch.status === "none"
      ? (ch.ready ? `<button class="btn" id="startChallenge">FACE IT ▶</button>` : `<p class="small muted">Study 2 building blocks to take it on.</p>`)
      : `<p class="small">${ch.status === "won" ? "Conquered today. ★" : ch.status === "lost" ? "It beat you today. Try again tomorrow." : "In progress."}</p>`;
    chCard = `<div class="px col gap-s" style="border-color:var(--gold)"><div class="pf" style="font-size:10px;color:var(--gold)">${title}</div>
      <p class="small" style="margin:0">${ch.kind === "storm" ? "5 timed questions across every chapter you've studied. 90 seconds each. Win: 1 of each gem + Lightning Rod." : "Review 5 old questions. Win: 2 gems + Frost Scarf."}</p>${body}</div>`;
  }

  $app.innerHTML = `<main class="screen">
    <header class="row" style="padding:12px 16px;background:var(--panel);border-bottom:3px solid var(--bg-deep)">
      <a href="#/hero" aria-label="Your hero">${heroSvg(st.equipped, h.rank, 36)}</a>
      <div class="grow col gap-s">
        <div class="pf" style="font-size:10px;color:var(--gold)">LV ${h.level} · ${h.rank.toUpperCase()}</div>
        <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="XP to next level"><div style="width:${pct}%"></div></div>
        <div class="tiny muted">XP ${fmt(h.xp)} / ${fmt(h.levelNext)}</div>
      </div>
      <a href="#/mint" class="col gap-s" style="align-items:flex-end;text-decoration:none;color:var(--ink)" aria-label="Royal Mint">
        <span class="row gap-s">${coin()} ${fmt(h.gold)}</span>
        <span class="row gap-s small">${gemIcon("fundamental", 12)}${h.gems.fundamental} ${gemIcon("scenario", 12)}${h.gems.scenario} ${gemIcon("quiz", 12)}${h.gems.quiz}</span>
      </a>
    </header>
    <div class="pad col">
      ${w.needsLocation ? `<div class="px col" style="background:#23305c;border-color:var(--gem-f)">
          <div class="row">${weatherIcon("sunny")}<div class="grow"><div class="label" style="color:var(--gem-f)">WHERE DOES YOUR QUEST BEGIN?</div>
          <div class="small" style="margin-top:6px">Daily events come from the real sky above you. Share your location, or pick any city in the world.</div></div></div>
          <div class="grid2"><button class="btn cyan small" id="useGps">SHARE MY LOCATION</button><a class="btn ghost small" href="#/travel">CHOOSE A CITY</a></div></div>`
      : `<div class="px row" style="background:#23305c;align-items:center">
        ${weatherIcon(w.weather)}
        <div class="grow">
          <div class="label" style="color:var(--gem-f)">TODAY'S WEATHER EVENT</div>
          <div style="font-size:22px;margin-top:4px">${esc(w.label)}${w.temp !== null ? ` · ${Math.round(w.temp)}°C` : ""} · ${esc(w.place)}</div>
          <div class="small" style="color:#c9d6ff">${esc(w.effect)}</div>
          ${w.live ? (w.source ? `<div class="tiny muted">via ${w.source === "met.no" ? "MET Norway" : w.source === "open-meteo" ? "Open-Meteo" : esc(w.source)}</div>` : "")
            : `<div class="tiny muted">No weather source answered, so it's a plain cloudy day for now. ${w.error ? esc(w.error) : ""} <a href="#/travel">Check the sky</a></div>`}
        </div>
        <a href="#/travel" class="btn ghost small" style="min-height:44px;padding:4px 8px" aria-label="Teleport to another city">✈</a>
      </div>`}
      ${moonCard(st.moon)}
      ${encCard}${chCard}
      <div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="pf" style="font-size:11px">THE REALM</h2>
        <span class="small muted">${st.chapters.filter((c) => c.status === "cleared").length} / 12 chapters cleared</span></div>
      ${regions}
    </div>${nav("map")}</main>`;

  const btn = document.getElementById("startChallenge");
  if (btn) btn.addEventListener("click", () => startRun({ kind: ch.kind }));
  const gps = document.getElementById("useGps");
  if (gps) gps.addEventListener("click", useMyLocation);
}

function moonCard(m) {
  const mo = m.moon;
  const date = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  let line = `Next full moon ${date(mo.nextFull)} · new moon ${date(mo.nextNew)}`;
  let hot = false;
  if (m.wolf && m.wolf.status === "waiting") { line = "Full moon tonight: a wolf waits in the forest with a shortcut test."; hot = true; }
  else if (m.wolf) line = `Full moon. The wolf has been met (${m.wolf.status}).`;
  if (m.fairy && (m.fairy.status === "waiting" || m.fairy.status === "started")) { line = "New moon: a fairy offers a puzzle and an old proverb."; hot = true; }
  else if (m.fairy) line = `New moon. The fairy has shared her wisdom (${m.fairy.status}).`;
  return `<a href="#/moon" class="card row${hot ? " pulse" : ""}" style="text-decoration:none;color:var(--ink);background:#1a1a3a;${hot ? "border-color:var(--gold)" : ""}">
    ${moonIcon(mo.fraction, 36)}<div class="grow"><div class="label" style="color:#c9b8ff">${esc(mo.name.toUpperCase())}</div><div class="small">${esc(line)}</div></div><span class="pf" style="font-size:9px;color:var(--gold)">▶</span></a>`;
}

async function screenTravel() {
  const d = await api("/api/hero");
  const st = await api(`/api/state?tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Rome")}`);
  const w = st.weather;
  const freeLeft = w.needsLocation || w.teleports === 0;
  $app.innerHTML = `<main class="screen">
    ${topbar("#/", "TELEPORT CIRCLE", "WHERE TO, TRAVELLER?", "", "#23305c")}
    <div class="pad col">
      <div class="card row">${weatherIcon(w.weather, 36)}<div class="grow"><div class="label">YOU ARE IN</div><div style="font-size:21px">${w.needsLocation ? "Nowhere yet" : esc(w.place)}</div>
        ${w.needsLocation ? "" : `<div class="small muted">${esc(w.label)}${w.temp !== null ? ` · ${Math.round(w.temp)}°C` : ""}</div>`}</div></div>
      <button class="btn cyan" id="gps">⌖ USE MY REAL LOCATION (FREE)</button>
      <p class="small muted" style="margin:0">Teleport to any city to play under its sky. ${freeLeft ? "Your first teleport today is free." : `Another teleport today costs ${d.teleportCost} gold.`} Storm and snow challenges stay once per day wherever you go.</p>
      <div class="card col gap-s"><div class="row"><span class="label grow">SKY CHECK</span><button class="btn ghost small" id="check" style="min-height:40px">ASK THE SOURCES</button></div>
        <div id="checkOut" class="small muted">See what each weather source answers right now.</div></div>
      <form id="search" class="row" role="search">
        <div class="field grow"><label for="city" class="sr-only">City</label><input id="city" placeholder="Search a city: Hanoi, Oslo, Venezia..." autocomplete="off"></div>
        <button class="btn small" type="submit" style="min-width:64px">GO</button>
      </form>
      <div class="list" id="results"></div>
    </div>${nav("map")}</main>`;
  document.getElementById("gps").addEventListener("click", useMyLocation);
  document.getElementById("check").addEventListener("click", async () => {
    const out = document.getElementById("checkOut");
    out.innerHTML = `<span class="pulse">Asking the sky...</span>`;
    try {
      const r = await api("/api/weather/check");
      out.innerHTML = `<div>${esc(r.place)}</div>` + r.attempts.map((a) => `<div><span style="color:${a.ok ? "var(--green)" : "var(--red)"}">${a.ok ? "✓" : "✗"}</span> ${esc(a.source)} · ${a.status ?? "no response"} · ${a.ms}ms · ${esc(a.detail)}</div>`).join("");
    } catch (err) { out.textContent = err.message; }
  });
  document.getElementById("search").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("city").value.trim();
    if (q.length < 2) return;
    const box = document.getElementById("results");
    box.innerHTML = `<div class="small muted pulse">Reading the maps...</div>`;
    const { results } = await api(`/api/geo?q=${encodeURIComponent(q)}`);
    if (!results.length) { box.innerHTML = `<div class="small muted">No city by that name in the realm.</div>`; return; }
    box.innerHTML = results.map((r, i) => `<button class="opt" data-i="${i}">✈ ${esc(r.name)}<span class="small muted">${r.region ? ` · ${esc(r.region)}` : ""}${r.country ? ` · ${esc(r.country)}` : ""}</span></button>`).join("");
    box.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      const r = results[Number(b.dataset.i)];
      try {
        const out = await api("/api/location", { lat: r.lat, lon: r.lon, name: r.name, mode: "teleport" });
        toast(`Teleported to ${r.name}: ${out.weather.label}${out.cost ? ` (−${out.cost} gold)` : ""}`);
        location.hash = "#/";
      } catch (err) { toast(err.message); }
    }));
  });
}

async function screenMoon(offset = 0) {
  const m = await api("/api/moon");
  const mo = m.moon;
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday first
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<div></div>`);
  for (let d = 1; d <= daysIn; d++) {
    const t = new Date(first.getFullYear(), first.getMonth(), d, 22).getTime(); // the night sky
    const f = moonFraction(t);
    const age = f * SYNODIC;
    const full = Math.abs(age - SYNODIC / 2) <= 1;
    const nw = age <= 1 || age >= SYNODIC - 1;
    const isToday = offset === 0 && d === now.getDate();
    cells.push(`<div class="center" style="padding:4px 0;border:2px solid ${isToday ? "var(--gold)" : full ? "#9aa3b8" : nw ? "#c9b8ff" : "transparent"};background:${full ? "#2a2a50" : nw ? "#24203f" : "transparent"}">
      ${moonIcon(f, 22)}<div class="tiny">${d}${full ? " ♞" : nw ? " ✧" : ""}</div></div>`);
  }
  const monthName = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const date = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  let event = "";
  if (m.wolf) {
    const w = m.wolf;
    event = `<div class="px col" style="background:#1a1a3a;border-color:#9aa3b8">
      <div class="row">${wolfSvg(64)}<div class="grow"><div class="label" style="color:#c0c7d6">FULL MOON · THE WOLF</div>
      <div class="small" style="margin-top:6px">"Forget the details, little one. For each question, show me the <b>shortcut</b> that cracks it: the memory anchor."</div></div></div>
      <div class="small muted">5 questions from blocks you've studied. Pick the right memory anchor. Win (4/5): 3 fundamental gems, 250 XP, Wolf Pelt. No hints.</div>
      ${w.status === "waiting" ? (w.ready ? `<button class="btn" id="wolf">FACE THE WOLF ▶</button>` : `<div class="small muted">${esc(w.reason)}</div>`)
        : `<div class="pf" style="font-size:10px;color:${w.status === "won" ? "var(--green)" : "var(--gold)"}">${w.status === "won" ? "★ THE WOLF RESPECTS YOU" : "THE WOLF HAS GONE. NEXT FULL MOON."}</div>`}</div>`;
  } else if (m.fairy) {
    event = fairyPanel(m.fairy);
  } else {
    event = `<div class="card small">The forest is quiet. The <b>wolf</b> appears at full moon (${date(mo.nextFull)}). The <b>fairy</b> appears at new moon (${date(mo.nextNew)}).</div>`;
  }

  $app.innerHTML = `<main class="screen">
    ${topbar("#/", "THE NIGHT SKY", "MOON CALENDAR", "", "#1a1a3a")}
    <div class="pad col">
      <div class="row" style="align-items:center">${moonIcon(mo.fraction, 72)}<div class="grow"><div class="pf" style="font-size:11px;line-height:1.5">${esc(mo.name.toUpperCase())}</div>
        <div class="small muted">day ${Math.floor(mo.age) + 1} of 29.5</div></div></div>
      ${event}
      <div class="row" style="justify-content:space-between"><button class="btn ghost small" id="prev" aria-label="Previous month">&lt;</button>
        <span class="pf" style="font-size:10px">${esc(monthName.toUpperCase())}</span><button class="btn ghost small" id="next" aria-label="Next month">&gt;</button></div>
      <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px">
        ${["M", "T", "W", "T", "F", "S", "S"].map((x) => `<div class="center label">${x}</div>`).join("")}${cells.join("")}</div>
      <div class="small muted">♞ full moon: the wolf · ✧ new moon: the fairy</div>
    </div>${nav("map")}</main>`;
  document.getElementById("prev").addEventListener("click", () => screenMoon(offset - 1));
  document.getElementById("next").addEventListener("click", () => screenMoon(offset + 1));
  const wb = document.getElementById("wolf");
  if (wb) wb.addEventListener("click", () => startRun({ kind: "wolf" }));
  if (m.fairy) bindFairy(m.fairy);
}

function proverbBox(p) {
  return `<div class="paper"><div class="label" style="color:#6b3fa0">THE FAIRY'S PROVERB</div>
    <div style="font-size:23px;margin-top:6px"><i>${esc(p.text)}</i></div>
    ${p.lang === "it" ? `<div class="small" style="margin-top:4px">"${esc(p.meaning)}"</div>` : ""}
    <div class="small" style="margin-top:8px">${esc(p.why)}</div></div>`;
}

function fairyPanel(f) {
  const done = f.status === "won" || f.status === "lost";
  return `<div class="px col" style="background:#24203f;border-color:#c9b8ff" id="fairy">
    <div class="row">${fairySvg(48)}<div class="grow"><div class="label" style="color:#c9b8ff">NEW MOON · THE FAIRY</div>
      <div style="font-size:20px">${esc(f.puzzle.title)} <span class="tiny muted">ch ${f.puzzle.chapter}</span></div></div></div>
    <div class="small">${esc(f.puzzle.prompt)}</div>
    ${done ? `${f.status === "won" ? `<div class="pf" style="font-size:10px;color:var(--green)">★ SOLVED</div>` : `<div class="small">The right order was:<ol style="margin:4px 0 0 20px;padding:0">${f.solution.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>`}${proverbBox(f.proverb)}`
      : `<div class="small muted">Tap the steps in the right order. Tap a placed step to take it back. ${f.triesLeft} ${f.triesLeft === 1 ? "try" : "tries"} left. Solve it: 2 scenario gems, 150 XP, Fairy Lantern, and a proverb.</div>
      <div class="label">YOUR ORDER</div><div class="list" id="placed"></div>
      <div class="label">STEPS</div><div class="list" id="pool">${f.puzzle.steps.map((t, i) => `<button class="opt" data-i="${i}">${esc(t)}</button>`).join("")}</div>
      <div id="fout" class="col"></div>
      <button class="btn pink" id="offer" disabled>OFFER TO THE FAIRY ▶</button>`}</div>`;
}

function bindFairy(f) {
  const pool = document.getElementById("pool");
  if (!pool) return;
  const order = [];
  const placed = document.getElementById("placed");
  const offer = document.getElementById("offer");
  function draw() {
    placed.innerHTML = order.length ? order.map((i, n) => `<button class="opt" data-p="${n}" style="border-color:#c9b8ff">${n + 1}. ${esc(f.puzzle.steps[i])}</button>`).join("") : `<div class="small dim">Nothing yet.</div>`;
    pool.querySelectorAll("button").forEach((b) => { b.hidden = order.includes(Number(b.dataset.i)); });
    offer.disabled = order.length !== f.puzzle.steps.length;
    placed.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { order.splice(Number(b.dataset.p), 1); draw(); }));
  }
  pool.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { order.push(Number(b.dataset.i)); draw(); }));
  offer.addEventListener("click", async () => {
    try {
      const r = await api("/api/fairy", { order });
      if (r.solved || r.proverb) { screenMoon(); if (r.reward) toast("The fairy smiles. Rewards granted!"); return; }
      document.getElementById("fout").innerHTML = `<div class="why">${r.inPlace} of ${r.total} steps are in the right place. ${r.triesLeft} ${r.triesLeft === 1 ? "try" : "tries"} left.</div>`;
      order.length = 0;
      draw();
    } catch (err) { toast(err.message); }
  });
  draw();
}

function depthOf(blocks) {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const memo = new Map();
  const d = (id) => {
    if (memo.has(id)) return memo.get(id);
    const b = byId.get(id);
    const v = b.needs.length ? 1 + Math.max(...b.needs.map(d)) : 0;
    memo.set(id, v);
    return v;
  };
  blocks.forEach((b) => d(b.id));
  return memo;
}

async function screenChapter(id) {
  const ch = await api(`/api/chapters/${id}`);
  const depth = depthOf(ch.blocks);
  const rows = [];
  for (const b of ch.blocks) (rows[depth.get(b.id)] ||= []).push(b);
  const pip = (on, colour) => `<span class="${on ? "" : "pip-off"}" style="${on ? `color:${colour}` : ""}">◆</span>`;
  const tree = rows.map((row, i) => {
    const cells = row.map((b) => {
      const status = b.status;
      const label = { cleared: "CLEARED", progress: "IN PROGRESS", open: "OPEN", locked: "LOCKED" }[status];
      const needs = b.needs.length ? `<span class="tiny">needs ${b.needs.join(" + ")}</span>` : "";
      const inner = `<span class="pf">${b.id} · ${label}</span><span class="t">${esc(b.title)}</span>
        <span class="pips">${pip(b.recall, "#2bb5c0")}${pip(b.scenario, "#d9628f")}${pip(b.quiz, "#b8860b")}</span>${status === "locked" ? needs : ""}`;
      return status === "locked"
        ? `<div class="block-node st-locked" aria-label="${b.id} ${esc(b.title)}, locked">${inner}</div>`
        : `<a class="block-node st-${status}" href="#/b/${b.id}">${inner}</a>`;
    }).join("");
    return `${i ? `<div class="arrows" aria-hidden="true">▼</div>` : ""}<div class="tree-row" style="grid-template-columns:repeat(${Math.min(row.length, 2)}, minmax(0,1fr))">${cells}</div>`;
  }).join("");

  let boss = "";
  if (ch.status === "cleared") {
    boss = `<div class="px row" style="background:#1f3b2c"><span class="pf" style="font-size:10px;color:var(--green)">★ ${esc(ch.boss.name.toUpperCase())} DEFEATED</span></div>`;
  } else {
    boss = `<div class="px row" style="background:#3b2440">${beastSvg(56)}<div class="grow"><div class="label" style="color:#ffb3c7">CHAPTER BOSS</div>
      <div style="font-size:20px">${esc(ch.boss.name)}</div><div class="small muted">reward: ${esc(ch.gear.name)}</div></div>
      ${ch.bossReady ? `<button class="btn small" id="fightBoss">FIGHT ▶</button>` : `<span class="tiny muted">clear all blocks</span>`}</div>`;
  }

  $app.innerHTML = `<main class="screen">
    ${topbar("#/", `CH ${ch.id} · ${ch.status === "locked" ? "LOCKED" : ""}`, esc(ch.title.toUpperCase()), `<div class="small muted" style="text-align:right">blocks<br><span style="color:var(--gem-f)">${ch.blocksCleared} / ${ch.blocksTotal}</span></div>`, "#2b2b5e")}
    <div class="row small muted" style="padding:10px 16px;border-bottom:2px dashed var(--line);flex-wrap:wrap">
      <span><span style="color:#2bb5c0">◆</span> fundamental</span><span><span style="color:#d9628f">◆</span> scenario</span><span><span style="color:#b8860b">◆</span> quiz</span></div>
    <div class="pad col">
      ${ch.unlocked ? "" : `<div class="px"><p class="small" style="margin:0">Clear ${ch.needTitles.map(esc).join(" and ")} first.</p></div>`}
      ${tree}
      ${boss}
      ${ch.rivals.length ? `<a class="card row" href="#/rivals" style="text-decoration:none;color:var(--ink)"><span class="grow small">Rival of this chapter: <b>${esc(ch.rivals[0].name)}</b>, ${esc(ch.rivals[0].title)}</span><span class="pf" style="font-size:9px;color:var(--gold)">⚔</span></a>` : ""}
    </div>${nav("map")}</main>`;
  const fb = document.getElementById("fightBoss");
  if (fb) fb.addEventListener("click", () => startRun({ kind: "boss", chapter: ch.id }));
}

async function screenBlock(id) {
  const b = await api(`/api/blocks/${id}`);
  const p = b.progress;
  const step = (on) => `<div class="${on ? "on" : ""}"></div>`;
  $app.innerHTML = `<main class="screen">
    ${topbar(`#/ch/${b.chapter}`, `${b.id} · BUILDING BLOCK`, esc(b.title.toUpperCase()))}
    <div class="pad col">
      <div class="steps" aria-label="Progress: card, quiz, scenario">${step(p.recall)}${step(p.quiz)}${step(p.scenario)}</div>
      <div class="prose">${b.card.body.map((t) => `<p>${esc(t)}</p>`).join("")}</div>
      <div class="anchor"><div class="label" style="color:var(--gem-f)">MEMORY ANCHOR</div><div style="font-size:21px;margin-top:6px">${esc(b.card.anchor)}</div></div>
      <div class="chips">${b.card.terms.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}
        ${b.unlocks.map((u) => `<span class="chip dim" style="border-style:dashed">unlocks ${u.id} →</span>`).join("")}</div>
      ${p.recall
        ? `<p class="small muted" style="margin:0">${gemIcon("fundamental")} Fundamental gem collected.</p>
           <div class="grid2">
             <button class="btn ${p.scenario ? "ghost" : "pink"}" id="goScenario">${p.scenario ? "SCENARIO ★" : "SCENARIO ▶"}</button>
             <button class="btn ${p.quiz ? "ghost" : "cyan"}" id="goQuiz">${p.quiz ? `QUIZ ★ ${p.quizBest}/3` : "QUIZ ME ▶"}</button>
           </div>`
        : `<button class="btn cyan" id="goRecall">RECALL CHECK ▶</button><p class="small muted center" style="margin:0">Answer one question from memory to earn the fundamental gem and unlock the quiz and scenario.</p>`}
    </div>${nav("map")}</main>`;
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
  on("goRecall", () => startRun({ kind: "recall", blockId: b.id }));
  on("goQuiz", () => startRun({ kind: "quiz", blockId: b.id }));
  on("goScenario", () => { location.hash = `#/s/${b.id}`; });
}

function sceneHtml(scene, npcName) {
  const look = {
    castle: ["#9aa3b8", "CASTLE", "#2a5a8a"], market: ["#c98a4b", "MARKET", "#2a5a8a"], library: ["#6b3fa0", "LIBRARY", "#2a5a8a"],
    harbor: ["#3a6ea5", "HARBOR", "#4a8ac0"], bakery: ["#c98a4b", "BAKERY", "#2a5a8a"], guild: ["#2e8b57", "GUILD HALL", "#2a5a8a"],
  }[scene] || ["#c98a4b", "TOWN", "#2a5a8a"];
  return `<div class="scene" style="background:${look[2]}" aria-hidden="true">
    <div class="ground"></div><div class="house" style="background:${look[0]}"></div><div class="roof"></div><div class="door"></div>
    <div class="sign">${look[1]}</div><div class="npc">${mysticSvg(48)}</div></div>`;
}

async function screenScenario(id) {
  const b = await api(`/api/blocks/${id}`);
  if (!b.scenario) { location.hash = `#/b/${id}`; return; }
  const sc = b.scenario;
  $app.innerHTML = `<main class="screen">
    ${topbar(`#/b/${b.id}`, `${b.id} · SCENARIO`, esc(sc.title.toUpperCase()), "", "#3b2440")}
    ${sceneHtml(sc.scene)}
    <div class="pad col">
      <div class="paper"><div class="pf" style="font-size:8px;color:#b0413e">${esc(sc.npc.toUpperCase())}</div><div style="font-size:21px;margin-top:6px;line-height:1.1">${esc(sc.story)}</div></div>
      <div class="label">${esc(sc.ask.toUpperCase())}</div>
      <div class="col" id="choices">${sc.choices.map((t, i) => `<button class="opt" data-i="${i}">▸ ${esc(t)}</button>`).join("")}</div>
      <div id="out" class="col"></div>
    </div>${nav("map")}</main>`;
  document.getElementById("choices").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-i]");
    if (!btn) return;
    const all = [...document.querySelectorAll("#choices button")];
    all.forEach((x) => (x.disabled = true));
    try {
      const r = await api(`/api/blocks/${b.id}/scenario`, { choice: Number(btn.dataset.i) });
      btn.classList.add(r.correct ? "correct" : "wrong");
      document.getElementById("out").innerHTML = `<div class="why">${esc(r.feedback)}</div>${rewardBox(r.reward)}
        ${r.correct ? `<a class="btn" href="#/b/${b.id}">CONTINUE ▶</a>` : `<button class="btn ghost" id="retry">TRY AGAIN</button>`}`;
      const retry = document.getElementById("retry");
      if (retry) retry.addEventListener("click", () => { all.forEach((x) => { x.disabled = false; x.classList.remove("wrong"); }); document.getElementById("out").innerHTML = ""; });
    } catch (err) {
      toast(err.message);
      all.forEach((x) => (x.disabled = false));
    }
  });
}

async function startRun(body) {
  try {
    const { id } = await api("/api/runs", body);
    location.hash = `#/r/${id}`;
  } catch (err) {
    toast(err.message);
  }
}

function hearts(n, max) {
  if (n === null || n === undefined) return "";
  let s = "";
  for (let i = 0; i < max; i++) s += i < n ? "♥" : `<span class="lost">♥</span>`;
  return `<span class="hearts" aria-label="${n} of ${max} hearts">${s}</span>`;
}

const RUN_TITLES = {
  recall: (r) => [`${r.block?.id} · RECALL CHECK`, r.block?.title, "#1d1d42"],
  quiz: (r) => [`${r.block?.id} · QUIZ · Q ${Math.min(r.idx + 1, r.total)}/${r.total}`, r.block?.title, "#1d1d42"],
  boss: (r) => [`CH ${r.boss?.chapter} BOSS · Q ${Math.min(r.idx + 1, r.total)}/${r.total}`, r.boss?.name, "#3b2440"],
  storm: (r) => [`⚡ STORM · Q ${Math.min(r.idx + 1, r.total)}/${r.total}`, "Network partition!", "#262640"],
  snow: (r) => [`❄ FROZEN CACHE · Q ${Math.min(r.idx + 1, r.total)}/${r.total}`, "Thaw the cache", "#23305c"],
  duel: (r) => [`DUEL · ROUND ${Math.min(r.idx + 1, r.total)}/${r.total}`, r.rival?.name, "#3a2430"],
  beast: (r) => [`WILD BEAST · Q ${Math.min(r.idx + 1, r.total)}/${r.total}`, r.foe?.name, "#2c5a3a"],
  mystic: (r) => ["MYSTIC'S RIDDLE", r.foe?.name, "#2d2050"],
  wolf: (r) => [`FULL MOON · Q ${Math.min(r.idx + 1, r.total)}/${r.total}`, "The Wolf's Shortcut Test", "#1a1a3a"],
};

function runBack(r) {
  if (r.block) return `#/b/${r.block.id}`;
  if (r.boss) return `#/ch/${r.boss.chapter}`;
  if (r.kind === "duel") return "#/rivals";
  if (r.kind === "wolf") return "#/moon";
  return "#/";
}

async function screenRun(id) {
  const r = await api(`/api/runs/${id}`);
  const [kicker, title, colour] = (RUN_TITLES[r.kind] || (() => ["RUN", "", "#1d1d42"]))(r);
  const back = runBack(r);

  if (!r.question) {
    $app.innerHTML = `<main class="screen">${topbar(back, kicker, esc(title || "").toUpperCase(), "", colour)}
      <div class="pad col"><p>This run is over.</p><a class="btn" href="${back}">BACK ▶</a></div>${nav()}</main>`;
    return;
  }

  const maxHearts = r.kind === "boss" ? 3 : r.kind === "beast" ? 2 : 0;
  let header = "";
  if (r.kind === "duel") {
    header = `<div class="row" style="padding:12px 16px;background:#3a2430;border-bottom:3px solid var(--bg-deep)">
      <div style="width:60px;height:72px;background:#23305c;border:3px solid var(--bg-deep);display:flex;align-items:center;justify-content:center">${knightSvg(r.rival.colour, 44)}</div>
      <div class="grow"><div class="label" style="color:#ffb3c7">RIVAL KNIGHT · CH ${r.rival.chapter}</div><div class="pf" style="font-size:11px;margin-top:6px">${esc(r.rival.name.toUpperCase())}</div>
      <div class="small" style="color:#ffcfd8">"${esc(r.rival.title)}"</div></div></div>
      <div style="padding:10px 16px;background:var(--panel);border-bottom:3px solid var(--bg-deep);font-style:italic" class="small">"${esc(r.rival.taunt)}"</div>
      <div class="grid3" style="padding:12px 16px 0;align-items:center">
        <div><div class="label" style="color:var(--gem-f)">YOU</div><div class="pf" style="font-size:20px;margin-top:6px" id="sy">${r.scoreYou}</div></div>
        <div class="center"><div class="label">ROUND</div><div style="font-size:20px">${r.idx + 1} / ${r.total}</div></div>
        <div style="text-align:right"><div class="label" style="color:#ffb3c7">RIVAL</div><div class="pf" style="font-size:20px;margin-top:6px" id="sr">${r.scoreRival}</div></div>
      </div>
      <div class="row small" style="padding:10px 16px 0"><span>your time</span><span class="grow"></span><span id="clock">0.0s</span></div>
      <div class="small muted" style="padding:0 16px" id="rivalLine">${esc(r.rival.name)} has locked in an answer. You'll see it after yours.</div>`;
  } else if (r.kind === "beast" || r.kind === "mystic") {
    header = `${topbar("#/", kicker, esc(title || "").toUpperCase(), maxHearts ? hearts(r.hearts, maxHearts) : "", colour)}
      <div class="battle" style="height:180px"><div class="sky" style="height:70px"></div>
        <div class="foe" style="top:16px">${r.kind === "beast" ? beastSvg(110) : mysticSvg(60)}</div>
        <div class="me" style="bottom:16px">${heroSvg(currentItems, currentRank, 52)}</div></div>`;
  } else {
    const extra = r.kind === "storm" ? `<span class="pf" style="font-size:12px;color:var(--gold)" id="clock">90</span>` : maxHearts ? hearts(r.hearts, maxHearts) : "";
    header = topbar(back, kicker, esc(title || "").toUpperCase(), extra, colour);
    if (r.kind === "wolf") header += `<div class="row" style="padding:10px 16px;background:#14142e;border-bottom:3px solid var(--bg-deep)">${wolfSvg(56)}<span class="small">Which <b>shortcut</b> (memory anchor) cracks this question?</span></div>`;
    if (r.boss) header += `<div class="row" style="padding:10px 16px;background:#2a1a30;border-bottom:3px solid var(--bg-deep)">${beastSvg(56)}<span class="small" style="font-style:italic">"${esc(r.boss.taunt)}"</span></div>`;
  }

  const hintAllowed = !["duel", "storm", "wolf"].includes(r.kind);
  $app.innerHTML = `<main class="screen">${header}
    <div class="pad col">
      <div style="font-size:22px;line-height:1.15">${esc(r.question.text)}</div>
      <div class="col" id="opts">${r.question.options.map((o, i) => `<button class="opt${r.question.removed === i ? " removed" : ""}" data-i="${i}" ${r.question.removed === i ? "disabled" : ""}>${"ABCD"[i]} · ${esc(o)}</button>`).join("")}</div>
      <div id="out" class="col"></div>
      ${hintAllowed && r.question.removed === null ? `<button class="btn ghost small" id="hint">HINT · −20 GOLD</button>` : ""}
    </div>${nav()}</main>`;

  // clocks for duels and storms
  const started = Date.now();
  let timer = null;
  const clock = document.getElementById("clock");
  if (clock) {
    timer = setInterval(() => {
      const s = (Date.now() - started) / 1000;
      if (r.kind === "storm") {
        const left = Math.max(0, Math.ceil((r.seconds || 90) - s));
        clock.textContent = String(left);
        clock.style.color = left <= 10 ? "var(--red)" : "var(--gold)";
      } else clock.textContent = `${s.toFixed(1)}s`;
    }, 100);
  }
  setCleanup(() => timer && clearInterval(timer));

  const hintBtn = document.getElementById("hint");
  if (hintBtn) hintBtn.addEventListener("click", async () => {
    try {
      const { removed } = await api(`/api/runs/${id}/hint`, {});
      const el = document.querySelector(`#opts button[data-i="${removed}"]`);
      if (el) { el.classList.add("removed"); el.disabled = true; }
      hintBtn.remove();
    } catch (err) { toast(err.message); }
  });

  document.getElementById("opts").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-i]");
    if (!btn || btn.disabled) return;
    const all = [...document.querySelectorAll("#opts button")];
    all.forEach((x) => (x.disabled = true));
    if (hintBtn) hintBtn.remove();
    let res;
    try {
      res = await api(`/api/runs/${id}/answer`, { choice: Number(btn.dataset.i) });
    } catch (err) {
      toast(err.message);
      all.forEach((x) => { if (!x.classList.contains("removed")) x.disabled = false; });
      return;
    }
    if (timer) clearInterval(timer);
    all[res.correctPos].classList.add("correct");
    if (!res.correct) btn.classList.add("wrong");
    let html = "";
    if (res.timedOut) html += `<div class="why">Too slow! The storm swallowed that answer.</div>`;
    html += `<div class="why"><span class="label" style="color:${res.correct ? "var(--green)" : "var(--red)"}">${res.correct ? "CORRECT · " : "NOT QUITE · "}WHY</span><br>${esc(res.why)}</div>`;
    if (res.rival) {
      document.getElementById("sy").textContent = res.scoreYou;
      document.getElementById("sr").textContent = res.scoreRival;
      document.getElementById("rivalLine").textContent =
        `${r.rival.name} ${res.rival.correct ? "answered correctly" : "got it wrong"} in ${res.rival.time}s. You: ${res.elapsed}s. Points: you +${res.yourPoints}, rival +${res.rival.points}.`;
    }
    if (res.finished) {
      const msg = {
        win: { recall: "Fundamental mastered!", quiz: "Quiz passed!", boss: "Boss defeated!", storm: "You weathered the storm!", snow: "Cache thawed!", duel: "Victory!", beast: "The beast flees!", mystic: "The mystic smiles.", wolf: "The wolf bows its head." }[r.kind] || "Victory!",
        lose: { recall: "Not yet. Re-read the card and try again.", quiz: "You need 2 of 3. Review and retry.", boss: "You fell. Review the chapter and return.", duel: "Defeated. Train and challenge again tomorrow.", beast: "The beast got away.", mystic: "The mystic vanishes into the mist.", wolf: "The wolf melts into the dark. Next full moon." }[r.kind] || "Defeated.",
        draw: { duel: "A draw! Honour is shared." },
      }[res.outcome];
      const line = typeof msg === "string" ? msg : (msg?.[r.kind] || "");
      html += `<div class="px center"><div class="pf" style="font-size:12px;color:${res.outcome === "win" ? "var(--green)" : "var(--gold)"};line-height:1.5">${esc(line)}</div>
        ${r.kind === "duel" ? `<div style="font-size:22px;margin-top:6px">${res.scoreYou} – ${res.scoreRival}</div>` : ""}</div>
        ${rewardBox(res.reward)}<a class="btn" href="${back}">CONTINUE ▶</a>`;
    } else {
      html += `<button class="btn cyan" id="next">NEXT ▶</button>`;
    }
    document.getElementById("out").innerHTML = html;
    const next = document.getElementById("next");
    if (next) next.addEventListener("click", () => route());
    document.getElementById("out").scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// cached for sprites on battle screens
let currentItems = [];
let currentRank = "Peasant";

async function screenHero() {
  const d = await api("/api/hero");
  const h = d.hero;
  currentItems = d.inventory.map((i) => i.id);
  currentRank = h.rank;
  const ranks = [["Peasant", 1], ["Squire", 5], ["Knight", 10], ["Baron", 15], ["Count", 20], ["Duke", 25], ["King", 30]];
  const next = ranks.find(([, l]) => l > h.level);
  const pct = Math.round(((h.xp - h.levelStart) / Math.max(1, h.levelNext - h.levelStart)) * 100);
  const trophies = d.inventory.filter((i) => i.kind === "trophy");
  $app.innerHTML = `<main class="screen">
    <header class="row" style="padding:16px;background:var(--panel);border-bottom:3px solid var(--bg-deep);align-items:center">
      <div style="width:112px;height:136px;background:#23305c;border:3px solid var(--bg-deep);display:flex;align-items:center;justify-content:center">${heroSvg(currentItems, h.rank, 88)}</div>
      <div class="grow col gap-s">
        <h1 class="pf" style="font-size:12px;color:var(--gold)">${esc(h.name.toUpperCase())}</h1>
        <div class="pf" style="font-size:9px">LV ${h.level} · ${h.rank.toUpperCase()}</div>
        <div class="bar"><div style="width:${pct}%"></div></div>
        <div class="small muted">${next ? `${fmt(20 * (next[1] - 1) ** 2 - h.xp)} XP to ${next[0].toUpperCase()} (LV ${next[1]})` : "You rule the realm."}</div>
        <div class="small muted">${d.gear.filter((g) => g.owned).length} / 12 gear · ${coin(12)} ${fmt(h.gold)}</div>
      </div>
    </header>
    <div class="pad col">
      <div class="label">NOBLE RANKS</div>
      <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;text-align:center;font-size:12px;overflow-wrap:anywhere">
        ${ranks.map(([n, l]) => `<div style="padding:6px 0;border:2px solid ${n === h.rank ? "#fff4c2" : "var(--line)"};background:${h.level >= l ? (n === h.rank ? "var(--gold)" : "var(--green)") : "var(--panel-2)"};color:${h.level >= l ? "var(--bg-deep)" : "var(--muted)"}">${n}<br>${l}</div>`).join("")}
      </div>
      <div class="label">GEAR · ONE PER CHAPTER BOSS</div>
      <div class="grid3">${d.gear.map((g) => `<div class="gear-slot${g.owned ? " owned" : ""}"><div class="tiny" style="color:${g.owned ? "var(--gold)" : "inherit"}">CH ${g.chapter} · ${esc(g.slot.toUpperCase())}</div><div class="small">${esc(g.name)}</div></div>`).join("")}</div>
      ${trophies.length ? `<div class="label">TROPHIES</div><div class="chips">${trophies.map((t) => `<span class="chip" title="${esc(t.desc)}">◈ ${esc(t.name)}</span>`).join("")}</div>` : ""}
      <div class="row" style="justify-content:space-between"><div class="label">GEM SHOP</div><a class="pf" style="font-size:9px" href="#/mint">ROYAL MINT ▶</a></div>
      <div class="list">${d.shop.map((s) => `<div class="card row"><div class="grow"><div style="font-size:20px">${esc(s.name)}</div><div class="tiny muted">${esc(s.desc)}</div></div>
        ${s.owned ? `<span class="pf" style="font-size:9px;color:var(--green)">OWNED</span>` : `<button class="btn small" data-buy="${esc(s.id)}">${s.price} ●</button>`}</div>`).join("")}</div>
      <button class="btn ghost small" id="logout">SIGN OUT</button>
    </div>${nav("hero")}</main>`;
  $app.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", async () => {
    try { await api("/api/shop/buy", { item: b.dataset.buy }); toast("Purchased!"); route(); } catch (err) { toast(err.message); }
  }));
  document.getElementById("logout").addEventListener("click", async () => { await api("/api/auth/logout", {}); location.hash = "#/login"; });
}

async function screenMint() {
  const d = await api("/api/hero");
  const h = d.hero;
  const rates = d.mintRates;
  const amt = { fundamental: 0, scenario: 0, quiz: 0 };
  const energy = { fundamental: 3, scenario: 2, quiz: 1 };
  const names = { fundamental: "Fundamental", scenario: "Scenario", quiz: "Quiz" };
  const border = { fundamental: "var(--gem-f)", scenario: "var(--gem-s)", quiz: "var(--gem-q)" };
  function total() {
    const base = amt.fundamental * rates.fundamental + amt.scenario * rates.scenario + amt.quiz * rates.quiz;
    const bonus = d.weather === "sunny" ? Math.round(base * 0.1) : 0;
    return { base, bonus, sum: base + bonus };
  }
  function draw() {
    const t = total();
    $app.innerHTML = `<main class="screen">
      ${topbar("#/hero", "TOWN SQUARE", "THE ROYAL MINT", `<span class="row gap-s">${coin()} ${fmt(h.gold)}</span>`, "#4a3416")}
      <div class="pad col">
        <div class="row" style="align-items:flex-end">${mysticSvg(48)}<div class="paper grow">Gems for gold, ${esc(h.rank.toLowerCase())}! The harder you thought, the more it's worth.</div></div>
        ${["fundamental", "scenario", "quiz"].map((k) => `<div class="card col gap-s" style="border-color:${border[k]}">
          <div class="row" style="justify-content:space-between"><span style="font-size:21px">${gemIcon(k)} ${names[k]}</span><span class="pf" style="font-size:10px;color:var(--gold)">= ${rates[k]} ●</span></div>
          <div class="row small muted">mental energy <span style="color:var(--red);letter-spacing:2px">${"■".repeat(energy[k])}</span><span style="color:var(--line);letter-spacing:2px">${"■".repeat(3 - energy[k])}</span><span class="spacer"></span>you have ${h.gems[k]}</div>
          <div class="stepper"><button data-k="${k}" data-d="-1" aria-label="Fewer ${names[k]} gems">-</button><div class="val">${amt[k]}</div><button data-k="${k}" data-d="1" aria-label="More ${names[k]} gems">+</button>
            <button data-k="${k}" data-d="all" aria-label="All ${names[k]} gems" style="width:56px;font-size:8px">ALL</button><span style="width:64px;text-align:right;color:var(--gold)">${amt[k] * rates[k]} ●</span></div></div>`).join("")}
        ${d.weather === "sunny" ? `<div class="card row" style="background:#2a3b1a;justify-content:space-between"><span>☀ sunny-day bonus</span><span style="color:var(--gold)">+10% → +${t.bonus} ●</span></div>` : `<p class="small muted" style="margin:0">Mint on a sunny day for +10% gold.</p>`}
        <div class="row" style="justify-content:space-between;align-items:baseline"><span class="label">YOU RECEIVE</span><span class="pf" style="font-size:16px;color:var(--gold)">${fmt(t.sum)} ●</span></div>
        <button class="btn" id="mint" ${t.sum ? "" : "disabled"}>MINT GOLD ▶</button>
        <details class="card"><summary class="label" style="cursor:pointer;color:var(--gold)">TIPS FOR THE MOST GOLD</summary>
          <ul class="small" style="margin:8px 0 0 18px;padding:0;display:flex;flex-direction:column;gap:6px">
            <li><b>Never skip the card.</b> Fundamental gems are worth 30, triple a quiz gem. Every block gives one fundamental, one scenario and one quiz gem: 60 gold.</li>
            <li><b>Save gems for a sunny day.</b> Sunny skies add 10%. No sun at home? Your first teleport each day is free, so hop to a sunny city and mint everything there.</li>
            <li><b>Sell fundamentals to elves.</b> An elf paying 45 gold beats the Mint's 30 (33 on a sunny day). Trading 3 quiz gems (30 gold) for 1 fundamental is only worth it if you then sell it to an elf.</li>
            <li><b>Refuse bad deals.</b> 60 gold for a scenario gem worth 20 is an elf's trick. Two scenario gems (40) for one fundamental (30) loses gold too.</li>
            <li><b>Study on rainy days.</b> Each gem you earn has a 20% chance of a bonus gem.</li>
            <li><b>Quiz in the fog.</b> First-time quiz passes give double quiz gems.</li>
            <li><b>Never miss the moon.</b> The full-moon wolf pays 3 fundamental gems (90 gold). The new-moon fairy pays 2 scenario gems.</li>
            <li><b>Take every challenge.</b> Bosses and storm challenges give one of each gem. Duel wins give 2 quiz gems and knock 100 off that rival's score.</li>
            <li><b>Don't leak gold.</b> Hints cost 20 and extra teleports 25. On the board only earned gold counts, so spending doesn't lower your rank, but it does shrink your purse.</li>
          </ul></details>
      </div>${nav("hero")}</main>`;
    $app.querySelectorAll(".stepper button").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.k;
      amt[k] = b.dataset.d === "all" ? h.gems[k] : Math.max(0, Math.min(h.gems[k], amt[k] + Number(b.dataset.d)));
      draw();
    }));
    document.getElementById("mint").addEventListener("click", async () => {
      try {
        const r = await api("/api/mint", amt);
        toast(`Minted ${fmt(r.gold)} gold!`);
        route();
      } catch (err) { toast(err.message); }
    });
  }
  draw();
}

async function screenBoard(scope = "week") {
  const d = await api(`/api/leaderboard?scope=${scope}`);
  const all = scope === "all";
  const rows = d.rows;
  const top = rows.slice(0, 3);
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  const heights = { 1: 100, 2: 74, 3: 56 };
  const stepColour = { 1: "var(--gold)", 2: "#9aa3b8", 3: "#c98a4b" };
  const sprite = (r) => (r.you ? heroSvg(currentItems, r.rank, 40) : knightSvg(r.colour, 40));
  $app.innerHTML = `<main class="screen">
    <header style="background:#5a1f2e;border-bottom:3px solid var(--bg-deep);padding:14px 16px;text-align:center;position:relative">
      <div aria-hidden="true" style="position:absolute;left:16px;top:0;width:28px;height:52px;background:var(--gold);border:3px solid var(--bg-deep);border-top:none"></div>
      <div aria-hidden="true" style="position:absolute;right:16px;top:0;width:28px;height:52px;background:var(--gold);border:3px solid var(--bg-deep);border-top:none"></div>
      <div class="label" style="color:#ffd98a">THE GREAT HALL</div>
      <h1 class="pf" style="font-size:14px;margin-top:8px">HALL OF NOBLES</h1>
      <div class="small" style="color:#ffcfd8;margin-top:6px">${all ? `all gold earned since ${new Date(d.since).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "gold earned this week · resets Monday 00:00"}</div>
    </header>
    <div class="grid2" style="padding:12px 16px 0">
      <a class="btn small ${all ? "ghost" : ""}" href="#/board" ${all ? "" : 'aria-current="page"'}>THIS WEEK</a>
      <a class="btn small ${all ? "" : "ghost"}" href="#/board/all" ${all ? 'aria-current="page"' : ""}>ALL TIME</a>
    </div>
    <div class="pad col">
      <div class="podium">${podiumOrder.map((r) => `<div class="col gap-s" style="align-items:center">
        ${r.pos === 1 ? svg("0 0 8 4", 28, 14, R(0, 1, 8, 3, "#f7c548") + R(0, 0, 1, 1, "#f7c548") + R(3, 0, 2, 1, "#f7c548") + R(7, 0, 1, 1, "#f7c548") + R(3, 2, 2, 1, "#ff6b8a")) : ""}
        ${sprite(r)}<div class="small">${esc(r.name)}</div><div class="tiny muted">${esc(r.rank.toUpperCase())}</div>
        <div class="step" style="height:${heights[r.pos]}px;background:${stepColour[r.pos]}"><span class="pf" style="font-size:14px">${r.pos}</span><span class="small">${fmt(r.gold)} ●</span></div></div>`).join("")}</div>
      <div class="list">${rows.slice(3).map((r) => `<div class="lb-row${r.you ? " you" : ""}">
        <span class="pf" style="font-size:10px;color:${r.you ? "var(--gold)" : "var(--muted)"}">${r.pos}</span>
        <span>${esc(r.name)}${r.you ? " (you)" : ""}<br><span class="tiny muted">${esc(r.rank)}${r.title ? ` · ${esc(r.title)}` : ""}</span></span>
        <span class="small" style="color:${r.move > 0 ? "#ff9b5e" : "var(--dim)"}">${r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : "–"}</span>
        <span style="text-align:right;color:var(--gold)">${fmt(r.gold)}</span></div>`).join("")}</div>
      ${(() => {
        const me = rows.find((r) => r.you);
        const above = rows[me.pos - 2];
        return above ? `<div class="card" style="background:#2a3b1a"><span class="label" style="color:#9ff0a8">NEXT TARGET</span><br>${fmt(above.gold - me.gold + 1)} ● more and you pass ${esc(above.name)}${all ? " for good" : " this week"}. Winning a duel also knocks 100 off a rival's score. <a href="#/mint">Minting tips</a></div>`
          : `<div class="card" style="background:#2a3b1a"><span class="label" style="color:#9ff0a8">TOP OF THE HALL</span><br>You lead the realm${all ? " of all time" : " this week"}!</div>`;
      })()}
    </div>${nav("board")}</main>`;
}

async function screenRivals() {
  const d = await api("/api/rivals");
  const bars = (n, colour) => `<span style="color:${colour}">${"■".repeat(n)}</span><span style="color:var(--line)">${"■".repeat(4 - n)}</span>`;
  $app.innerHTML = `<main class="screen">
    ${topbar("", "DUEL TO THE DEATH (OF IGNORANCE)", "THE ORDER OF RIVALS", "", "#3a2430")}
    <div class="pad col">
      <p class="small muted" style="margin:0">Each knight is strong in one chapter. Duels are 5 rounds from that chapter: right and faster scores 2, right but slower 1, wrong 0. Win: 2 quiz gems, 100 XP, and 100 gold off their weekly score.</p>
      <div class="list">${d.rivals.map((r) => `<div class="card col gap-s" style="${r.available ? "" : "opacity:.75"}">
        <div class="row">${knightSvg(r.colour, 36)}<div class="grow"><div style="font-size:21px">${esc(r.name)} · ch ${r.chapter}</div><div class="tiny muted">"${esc(r.title)}" · ${esc(r.taunt)}</div></div></div>
        <div class="row small"><span>speed ${bars(r.speed, "#ff9b5e")}</span><span>accuracy ${bars(r.accuracy, "#6ee07a")}</span></div>
        ${r.available ? `<button class="btn small" data-duel="${esc(r.id)}">CHALLENGE ⚔</button>` : `<div class="tiny muted">${esc(r.reason)}</div>`}</div>`).join("")}</div>
    </div>${nav("rivals")}</main>`;
  $app.querySelectorAll("[data-duel]").forEach((b) => b.addEventListener("click", () => startRun({ kind: "duel", rivalId: b.dataset.duel })));
}

async function screenEncounter() {
  const { encounter: e } = await api("/api/encounter");
  if (!e) {
    $app.innerHTML = `<main class="screen">${topbar("#/", "THE ROAD", "ALL QUIET")}<div class="pad col"><p>The road is quiet. Encounters appear on the map as you study.</p><a class="btn" href="#/">BACK TO MAP</a></div>${nav("map")}</main>`;
    return;
  }
  const foe = e.kind === "beast" ? beastSvg(128) : e.kind === "mystic" ? mysticSvg(72) : e.kind === "elf" ? elfSvg(64) : knightSvg(e.rival?.colour || "#888", 64);
  const kindLabel = { beast: "BEAST", mystic: "MYSTIC", elf: "TRADER", rival: "RIVAL KNIGHT" }[e.kind];
  let actions = "";
  if (e.kind === "elf") {
    const fmtSide = (o) => Object.entries(o).map(([k, v]) => (k === "gold" ? `${v} gold` : `${v} ${k} gem${v > 1 ? "s" : ""}`)).join(", ") || "nothing";
    actions = `<div class="card small">You give: <b>${esc(fmtSide(e.offer.give))}</b><br>You get: <b>${esc(fmtSide(e.offer.get))}</b></div>
      <div class="grid2"><button class="btn ghost" data-act="decline">NO THANKS</button><button class="btn green" data-act="accept">DEAL ▶</button></div>`;
  } else {
    const rewards = { beast: "Win: 1 scenario + 1 quiz gem, 60 XP, Wyrm Scale", mystic: "Win: 1 fundamental gem, 80 XP, Mystic Orb", rival: "Win: 2 quiz gems, 100 XP, Rival's Pennant" }[e.kind];
    actions = `<p class="small muted" style="margin:0">${rewards}. Encounters only use chapters you've studied.</p>
      <div class="grid2"><button class="btn ghost" data-act="flee">FLEE</button><button class="btn" data-act="fight">${e.kind === "rival" ? "DUEL ⚔" : e.kind === "mystic" ? "ANSWER ▶" : "FIGHT ▶"}</button></div>`;
  }
  $app.innerHTML = `<main class="screen">
    <div class="battle"><div class="sky"></div>
      <div class="tag" style="left:16px;top:16px"><div class="row" style="justify-content:space-between"><span class="pf" style="font-size:8px">${esc(e.name.toUpperCase())}</span><span class="tiny">${kindLabel}</span></div>${e.chapter ? `<div class="tiny">ch ${e.chapter}</div>` : ""}</div>
      <div class="foe" style="top:${e.kind === "beast" ? 70 : 60}px">${foe}</div>
      <div class="me">${heroSvg(currentItems, currentRank, 64)}</div>
    </div>
    <div class="pad col">
      <div class="paper" style="font-size:21px">${e.kind === "rival" ? `<b>${esc(e.name)}</b> challenges you! "${esc(e.line)}"` : `${esc(e.line)}`}</div>
      ${actions}
    </div>${nav("map")}</main>`;
  $app.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    try {
      const r = await api(`/api/encounter/${e.id}`, { action: b.dataset.act });
      if (r.runId) { location.hash = `#/r/${r.runId}`; return; }
      if (r.reward) toast("Trade complete!");
      location.hash = "#/";
    } catch (err) { toast(err.message); }
  }));
}

// ---------- router ----------
async function route() {
  setCleanup(null);
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);
  window.scrollTo(0, 0);
  loading();
  try {
    if (parts[0] === "login") return await screenLogin();
    if (!parts.length) return await screenMap();
    switch (parts[0]) {
      case "ch": return await screenChapter(parts[1]);
      case "b": return await screenBlock(parts[1]);
      case "s": return await screenScenario(parts[1]);
      case "r": return await screenRun(parts[1]);
      case "hero": return await screenHero();
      case "mint": return await screenMint();
      case "board": return await screenBoard(parts[1] === "all" ? "all" : "week");
      case "rivals": return await screenRivals();
      case "enc": return await screenEncounter();
      case "travel": return await screenTravel();
      case "moon": return await screenMoon();
      default: location.hash = "#/";
    }
  } catch (err) {
    if (location.hash !== "#/login") errorScreen(err);
  }
}

async function boot() {
  // Warm the sprite cache so battle screens show your gear.
  try {
    const d = await api("/api/hero");
    currentItems = d.inventory.map((i) => i.id);
    currentRank = d.hero.rank;
  } catch { /* not signed in yet */ }
  route();
}

window.addEventListener("hashchange", route);
boot();
