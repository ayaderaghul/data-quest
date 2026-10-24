import express, { type NextFunction, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, pool, tx } from "./db.js";
import { authRateLimit, login, logout, register, registrationOpen, requireAuth, type AuthedRequest } from "./auth.js";
import { CHAPTERS, REGIONS, RIVALS } from "./content/index.js";
import { getDailyEvent, WEATHER_INFO } from "./game/weather.js";
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
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
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
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : undefined;
  const lon = req.query.lon !== undefined ? Number(req.query.lon) : undefined;
  const tz = safeTz(typeof req.query.tz === "string" ? req.query.tz : undefined);
  const out = await tx(async (c) => {
    await c.query("UPDATE users SET tz = $2 WHERE id = $1", [userId, tz]);
    const ev = await getDailyEvent(c, userId, tz, lat, lon);
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
      challenge,
      equipped: [...s.inventory],
    };
  });
  res.json(out);
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
    return leaderboard(c, req.userId!, u.rows[0].tz);
  }));
}));

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

// ---------- static frontend ----------
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
app.use(express.static(publicDir, { maxAge: "1h", index: "index.html" }));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((err: unknown, _req: AuthedRequest, res: Response, _next: NextFunction) => {
  if (err instanceof GameError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Something went wrong in the castle." });
});

const port = Number(process.env.PORT ?? 3000);
migrate()
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
