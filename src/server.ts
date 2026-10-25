import express, { type NextFunction, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, pool, tx } from "./db.js";
import { authRateLimit, login, logout, register, registrationOpen, requireAuth, type AuthedRequest } from "./auth.js";
import { CHAPTERS, REGIONS, RIVALS } from "./content/index.js";
import { blockedServices, checkSources, initUpstream, resetBreaker, upstreamStatus, getDailyEvent, placeName, searchPlaces, setLocation, TELEPORT_COST, WEATHER_INFO } from "./game/weather.js";
import { moonView, solveFairy } from "./game/moonEvents.js";
import { pgUpstreamStore } from "./upstreamStore.js";
import { ITEMS, chapterSummary, heroSummary, loadState, studiedBlocks } from "./game/state.js";
import { GameError, HINT_COST, answerRun, createRun, serveRun, useHint } from "./game/runs.js";
import {
  MINT_RATES, answerScenario, blockView, buy, chapterView, currentEncounter, leaderboard, maybeSpawn, mint,
  resolveEncounter, rivalRoster,
} from "./game/world.js";
import { safeTz } from "./game/util.js";
import type pg from "pg";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));

app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  next();
});

// Only JSON bodies on API writes, which (with SameSite=Strict cookies) shuts out cross-site form posts.
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && !req.is("application/json")) return res.status(415).json({ error: "JSON only." });
  next();
});

type Handler = (req: AuthedRequest, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: AuthedRequest, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

// ---------- auth (public) ----------
app.get("/api/auth/status", wrap(async (_req, res) => {
  res.json({ registrationOpen: await registrationOpen() });
}));
app.post("/api/auth/register", authRateLimit, wrap(register));
app.post("/api/auth/login", authRateLimit, wrap(login));
app.post("/api/auth/logout", wrap(logout));
app.get("/healthz", (_req, res) => res.send("ok"));

// ---------- everything below needs a session ----------
app.use("/api", requireAuth);

async function today(c: pg.PoolClient, userId: number) {
  const u = await c.query("SELECT tz FROM users WHERE id = $1", [userId]);
  return getDailyEvent(c, userId, u.rows[0].tz);
}

app.get("/api/state", wrap(async (req, res) => {
  const userId = req.userId!;
  const tz = safeTz(typeof req.query.tz === "string" ? req.query.tz : undefined);
  const out = await tx(async (c) => {
    await c.query("UPDATE users SET tz = $2 WHERE id = $1", [userId, tz]);
    const ev = await getDailyEvent(c, userId, tz);
    const encounter = await maybeSpawn(c, userId, ev);
    const s = await loadState(c, userId);
    const studied = studiedBlocks(s).length;
    const challenge = (ev.weather === "storm" || ev.weather === "snow")
      ? { kind: ev.weather, status: ev.challengeStatus, ready: studied >= 2 }
      : null;
    return {
      hero: heroSummary(s.user),
      weather: { ...ev, ...WEATHER_INFO[ev.weather] },
      regions: REGIONS,
      chapters: chapterSummary(s),
      encounter,
      challenge: ev.needsLocation ? null : challenge,
      equipped: [...s.inventory],
      moon: await moonView(c, userId),
      blocked: blockedServices(),
    };
  });
  res.json(out);
}));

// ---------- location & teleport ----------
app.get("/api/geo", wrap(async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2 || q.length > 60) return res.json({ results: [] });
  res.json({ results: await searchPlaces(q) });
}));

app.post("/api/location", wrap(async (req, res) => {
  const { lat, lon, name, mode } = req.body ?? {};
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    throw new GameError(400, "That place isn't on any map.");
  }
  const isTeleport = mode === "teleport";
  const place = isTeleport
    ? String(name ?? "").replace(/[<>]/g, "").trim().slice(0, 60) || "Somewhere"
    : (await placeName(la, lo)) ?? (Math.abs(la - 45.672) < 0.15 && Math.abs(lo - 11.927) < 0.15 ? "Castelfranco Veneto" : "Your location");
  const out = await tx(async (c) => {
    const u = await c.query("SELECT tz, lat FROM users WHERE id = $1 FOR UPDATE", [req.userId!]);
    const tz = u.rows[0].tz;
    const ev = await getDailyEvent(c, req.userId!, tz);
    // The first teleport each day is free; after that it costs gold. Using your real location is always free.
    let cost = 0;
    if (isTeleport && u.rows[0].lat !== null && ev.teleports >= 1) cost = TELEPORT_COST;
    if (cost) {
      const paid = await c.query("UPDATE users SET gold = gold - $2 WHERE id = $1 AND gold >= $2 RETURNING gold", [req.userId!, cost]);
      if (!paid.rows[0]) throw new GameError(403, `Another teleport today costs ${cost} gold.`);
      await c.query("INSERT INTO ledger (user_id, kind, amount, reason) VALUES ($1, 'gold', $2, 'teleport')", [req.userId!, -cost]);
    }
    try {
      const next = await setLocation(c, req.userId!, tz, la, lo, place, isTeleport);
      return { weather: { ...next, ...WEATHER_INFO[next.weather] }, cost };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("WEATHER_DOWN")) {
        throw new GameError(503, `The weather spirits aren't answering (${err.message.slice(14)}). Try again in a moment.`);
      }
      throw err;
    }
  });
  res.json(out);
}));

// Diagnostics: asks every weather source for your current spot and reports what each said.
app.get("/api/weather/check", wrap(async (req, res) => {
  const u = await pool.query("SELECT lat, lon, place FROM users WHERE id = $1", [req.userId!]);
  const { lat, lon, place } = u.rows[0];
  const la = lat ?? 45.672, lo = lon ?? 11.927;
  res.json({ place: lat === null ? "Castelfranco Veneto (default)" : place, attempts: await checkSources(la, lo), breakers: upstreamStatus() });
}));

// The player can lift a pause by hand (e.g. after a block was lifted). It only allows the next call.
app.post("/api/upstream/reset", wrap(async (req, res) => {
  if (!resetBreaker(String(req.body?.name ?? ""))) throw new GameError(404, "No such service.");
  res.json({ ok: true, breakers: upstreamStatus() });
}));

// ---------- moon ----------
app.get("/api/moon", wrap(async (req, res) => {
  res.json(await tx((c) => moonView(c, req.userId!)));
}));

app.post("/api/fairy", wrap(async (req, res) => {
  res.json(await tx(async (c) => {
    const ev = await today(c, req.userId!);
    return solveFairy(c, req.userId!, req.body?.order, ev.weather);
  }));
}));

app.get("/api/chapters/:id", wrap(async (req, res) => {
  res.json(await tx((c) => chapterView(c, req.userId!, Number(req.params.id))));
}));

app.get("/api/blocks/:id", wrap(async (req, res) => {
  res.json(await tx((c) => blockView(c, req.userId!, String(req.params.id))));
}));

app.post("/api/blocks/:id/scenario", wrap(async (req, res) => {
  res.json(await tx(async (c) => {
    const ev = await today(c, req.userId!);
    return answerScenario(c, req.userId!, String(req.params.id), Number(req.body?.choice), ev.weather);
  }));
}));

app.post("/api/runs", wrap(async (req, res) => {
  const { kind, blockId, chapter, rivalId, encounterId } = req.body ?? {};
  const id = await tx(async (c) => {
    const ev = await today(c, req.userId!);
    return createRun(c, req.userId!, String(kind), {
      blockId: typeof blockId === "string" ? blockId : undefined,
      chapter: chapter !== undefined ? Number(chapter) : undefined,
      rivalId: typeof rivalId === "string" ? rivalId : undefined,
      encounterId: encounterId !== undefined ? Number(encounterId) : undefined,
    }, ev.weather, ev.day);
  });
  res.json({ id });
}));

app.get("/api/runs/:id", wrap(async (req, res) => {
  res.json(await tx((c) => serveRun(c, req.userId!, Number(req.params.id))));
}));

app.post("/api/runs/:id/answer", wrap(async (req, res) => {
  res.json(await tx(async (c) => {
    const ev = await today(c, req.userId!);
    return answerRun(c, req.userId!, Number(req.params.id), Number(req.body?.choice), ev.weather);
  }));
}));

app.post("/api/runs/:id/hint", wrap(async (req, res) => {
  res.json(await tx(async (c) => {
    const ev = await today(c, req.userId!);
    return useHint(c, req.userId!, Number(req.params.id), ev.weather);
  }));
}));

app.get("/api/encounter", wrap(async (req, res) => {
  res.json({ encounter: await tx((c) => currentEncounter(c, req.userId!)) });
}));

app.post("/api/encounter/:id", wrap(async (req, res) => {
  const action = String(req.body?.action);
  const id = Number(req.params.id);
  res.json(await tx(async (c) => {
    if (action !== "fight") return resolveEncounter(c, req.userId!, id, action);
    const e = await c.query("SELECT kind, payload, status FROM encounters WHERE id = $1 AND user_id = $2", [id, req.userId!]);
    const enc = e.rows[0];
    if (!enc || enc.status !== "pending") throw new GameError(404, "That encounter has wandered off.");
    const ev = await today(c, req.userId!);
    if (enc.kind === "rival") {
      const runId = await createRun(c, req.userId!, "duel", { rivalId: enc.payload.rivalId, encounterId: id }, ev.weather, ev.day);
      await c.query("UPDATE encounters SET status = 'fighting' WHERE id = $1", [id]);
      return { runId };
    }
    return { runId: await createRun(c, req.userId!, enc.kind, { encounterId: id }, ev.weather, ev.day) };
  }));
}));

app.get("/api/hero", wrap(async (req, res) => {
  res.json(await tx(async (c) => {
    const s = await loadState(c, req.userId!);
    const ev = await today(c, req.userId!);
    return {
      hero: heroSummary(s.user),
      inventory: [...s.inventory].map((id) => ({ id, ...ITEMS[id] })).filter((x) => x.name),
      shop: Object.entries(ITEMS).filter(([, v]) => v.price).map(([id, v]) => ({ id, ...v, owned: s.inventory.has(id) })),
      gear: CHAPTERS.map((ch) => ({ chapter: ch.id, ...ch.gear, owned: s.inventory.has(`gear-${ch.id}`) })),
      mintRates: MINT_RATES,
      hintCost: HINT_COST,
      weather: ev.weather,
      teleportCost: TELEPORT_COST,
    };
  }));
}));

app.post("/api/mint", wrap(async (req, res) => {
  res.json(await tx(async (c) => {
    const ev = await today(c, req.userId!);
    return mint(c, req.userId!, req.body ?? {}, ev.weather);
  }));
}));

app.post("/api/shop/buy", wrap(async (req, res) => {
  res.json(await tx((c) => buy(c, req.userId!, String(req.body?.item))));
}));

app.get("/api/rivals", wrap(async (req, res) => {
  res.json(await tx(async (c) => {
    const ev = await today(c, req.userId!);
    return { rivals: await rivalRoster(c, req.userId!, ev.day) };
  }));
}));

app.get("/api/leaderboard", wrap(async (req, res) => {
  res.json(await tx(async (c) => {
    const u = await c.query("SELECT tz FROM users WHERE id = $1", [req.userId!]);
    return leaderboard(c, req.userId!, u.rows[0].tz, req.query.scope === "all" ? "all" : "week");
  }));
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

// ---------- static frontend ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
// Each deploy loads app.js/style.css under a new URL, so no browser can keep running an old build.
const BUILD = (process.env.RENDER_GIT_COMMIT ?? String(Date.now())).slice(0, 10);
const indexHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8")
  .replace('src="/app.js"', `src="/app.js?v=${BUILD}"`)
  .replace('href="/style.css"', `href="/style.css?v=${BUILD}"`);
const sendIndex = (_req: unknown, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(indexHtml);
};
app.get(["/", "/index.html"], sendIndex);
app.use(express.static(publicDir, { index: false, setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));
app.get("*", sendIndex);

app.use((err: unknown, _req: AuthedRequest, res: Response, _next: NextFunction) => {
  if (err instanceof GameError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Something went wrong in the castle." });
});

const port = Number(process.env.PORT ?? 3000);
migrate()
  .then(() => initUpstream(pgUpstreamStore))
  .then(() => {
    app.listen(port, () => {
      console.log(`Data Quest listening on :${port} (${RIVALS.length} rivals, ${CHAPTERS.filter((c) => c.available).length} chapters playable)`);
      if (!process.env.INVITE_CODE_HASH) console.warn("INVITE_CODE_HASH is not set: registration is closed.");
    });
  })
  .catch((err) => {
    console.error("Migration failed", err);
    process.exit(1);
  });

process.on("SIGTERM", () => pool.end().finally(() => process.exit(0)));
