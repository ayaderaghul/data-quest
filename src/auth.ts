import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { pool, tx } from "./db.js";

const COOKIE = "dq_session";
const SESSION_DAYS = 30;
const isProd = process.env.NODE_ENV === "production";

// Used so that login with an unknown username takes as long as a real check.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Fail closed: no hash configured means nobody can register. */
function inviteMatches(code: string): boolean {
  const expected = process.env.INVITE_CODE_HASH?.trim().toLowerCase();
  if (!expected || !/^[0-9a-f]{64}$/.test(expected)) return false;
  const given = Buffer.from(sha256(code.trim().toUpperCase()), "hex");
  return timingSafeEqual(given, Buffer.from(expected, "hex"));
}

export async function registrationOpen(): Promise<boolean> {
  if (!process.env.INVITE_CODE_HASH) return false;
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM users");
  return rows[0].n === 0;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

async function startSession(res: Response, userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [sha256(token), userId, expires]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    expires,
    path: "/",
  });
}

// --- tiny in-memory rate limiter for auth endpoints ---
const attempts = new Map<string, { n: number; reset: number }>();
export function authRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) {
    attempts.set(key, { n: 1, reset: now + 15 * 60_000 });
    return next();
  }
  if (a.n >= 10) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  a.n++;
  next();
}

export async function register(req: Request, res: Response) {
  const { username, password, invite } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || typeof invite !== "string") {
    return res.status(400).json({ error: "Username, password and invite code are required." });
  }
  const name = username.trim();
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) {
    return res.status(400).json({ error: "Username: 3–24 letters, numbers, dots, dashes or underscores." });
  }
  if (password.length < 10 || password.length > 200) {
    return res.status(400).json({ error: "Password must be at least 10 characters." });
  }
  if (!inviteMatches(invite)) {
    return res.status(403).json({ error: "That invite code isn't valid." });
  }
  const hash = await bcrypt.hash(password, 12);
  const userId = await tx(async (c) => {
    // Serialise registrations so two simultaneous requests can't both pass the count check.
    await c.query("SELECT pg_advisory_xact_lock(4242)");
    const { rows } = await c.query("SELECT count(*)::int AS n FROM users");
    if (rows[0].n > 0) return null;
    const ins = await c.query("INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id", [name, hash]);
    return ins.rows[0].id as number;
  });
  if (userId === null) return res.status(403).json({ error: "Registration is closed." });
  await startSession(res, userId);
  res.json({ ok: true });
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required." });
  }
  const { rows } = await pool.query("SELECT id, password_hash FROM users WHERE username = $1", [username.trim()]);
  const ok = await bcrypt.compare(password, rows[0]?.password_hash ?? DUMMY_HASH);
  if (!rows[0] || !ok) return res.status(401).json({ error: "Wrong username or password." });
  await startSession(res, rows[0].id);
  res.json({ ok: true });
}

export async function logout(req: Request, res: Response) {
  const token = readCookie(req, COOKIE);
  if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
}

export interface AuthedRequest extends Request {
  userId?: number;
}

/** Every game route goes through this guard. No valid session, no access. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const token = readCookie(req, COOKIE);
    if (!token) return res.status(401).json({ error: "Not signed in." });
    const { rows } = await pool.query(
      "SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()",
      [sha256(token)],
    );
    if (!rows[0]) return res.status(401).json({ error: "Session expired." });
    req.userId = rows[0].user_id;
    next();
  } catch (err) {
    next(err);
  }
}
