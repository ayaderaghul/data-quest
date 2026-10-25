# Data Quest

An 8-bit RPG for studying *Designing Data-Intensive Applications*, chapter by chapter.

Each chapter is a tree of **building blocks** with prerequisites. For every block you:

1. Read the **fundamental card** and pass a recall check → fundamental gem (worth 30 gold)
2. Solve the **scenario** → scenario gem (20 gold)
3. Pass the **quiz** (2 of 3) → quiz gem (10 gold)

Clear every block to face the chapter boss and win a piece of noble gear. Gems are minted into gold at the Royal Mint; gold buys hints and cosmetics and ranks you in the Hall of Nobles against eight rival knights, each strong in one chapter.

Random events keep it interesting:

- **Live weather** (Open-Meteo, locked once per day): sunny +10% gold, cloudy +10% XP, rain drops bonus gems, fog doubles quiz gems but disables hints, snow brings a review challenge, storms bring a timed challenge.
- **Your sky, or any sky**: the game asks for your location (or a city) before fetching weather. Teleport to any city to play under its weather: the first teleport each day is free, then 25 gold.
- **Moon calendar**: at full moon a wolf gives a 5-question shortcut test (pick the memory anchor that cracks each question; big rewards). At new moon a fairy gives a step-ordering puzzle and a proverb (mostly Italian).
- **Wild encounters** on the map: mystics (riddles), beasts (3-question fights), wandering elves (gem trades) and rival knights (speed duels).

All 12 chapters are playable: 63 building blocks, each with a card, a recall check, a 3-question quiz and a scenario, plus a boss per chapter.

## Third-party services

The browser only ever talks to this server; the server calls these services, so they never see the player's IP address. Fonts (Press Start 2P, VT323, SIL OFL) are self-hosted in `public/fonts`, so nothing loads from Google. Nothing is fetched in the background: weather is requested only when the map loads while the page is open and visible, and each day's weather is then locked.

| Service | Used for | Terms honoured |
| --- | --- | --- |
| Open-Meteo forecast | Primary weather | Non-commercial free tier; attribution "Weather data by Open-Meteo.com" (CC BY 4.0); readings reused 30 min per ~10 km |
| MET Norway Locationforecast | Fallback weather | Identifying User-Agent; ≤4 decimal coordinates; no request before `Expires`; revalidation with `If-Modified-Since` (304 reuses the stored reading); `Expires`/`Last-Modified` stored in Postgres (`met_cache`) so they survive restarts; attribution (CC BY 4.0) |
| Open-Meteo geocoding | City search | Search only on submit; results cached for a day |
| OpenStreetMap Nominatim | Fallback city search, naming a shared GPS spot | Identifying User-Agent; at most 1 request/second; no autocomplete; results cached for a day; attribution © OpenStreetMap contributors (ODbL) |

### When a service fails

Each service has its own circuit breaker (`src/game/upstream.ts`), saved in Postgres (`upstream_state`) so a restart doesn't forget a pause. While a breaker is open, no request is sent.

- Daily-quota 429 (e.g. Open-Meteo from Render's shared IP) → paused until 00:05 UTC
- `Retry-After` → respected, up to 24 hours
- 401/403 → the map shows **"You are blocked"**; paused 1 hour, then 1 day if blocked again, then calls stop until the player presses Retry in Sky check
- 5xx, timeouts, network errors → 1, 2, 4 … up to 60 minutes
- 400/404 for one place → no pause
- Any success → breaker closes and counters reset

## Stack

TypeScript + Express + PostgreSQL (Neon), vanilla JS frontend in `public/` with no build step. All scoring happens on the server: answers are shuffled per run and never sent to the browser before you answer.

## Private, single-user registration

Registration requires an invite code and closes for good once the first account exists. The server only stores the code's SHA-256 hash; with no hash configured, registration is closed.

```bash
npm run build
npm run invite        # prints a code and its INVITE_CODE_HASH
```

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Neon) |
| `INVITE_CODE_HASH` | SHA-256 hex of the invite code |
| `NODE_ENV` | `production` on Render (secure cookies, ignores `DEV_WEATHER`) |
| `DEV_WEATHER` | Local only: force `sunny`, `cloudy`, `rain`, `snow`, `storm` or `fog` |
| `DEV_MOON` | Local only: force `full` or `new` |

## Run locally

```bash
npm install
npm run build
DATABASE_URL=postgres://... INVITE_CODE_HASH=... npm start
```

The schema is created automatically on start.

## Checks

```bash
npm run check                                   # validates content, prerequisite graph, and that "pick the longest answer" doesn't win
INVITE=DQ-... node test/smoke.mjs               # end-to-end test against a running server (fresh DB)
node test/moon.mjs                              # location, teleport, wolf (server with DEV_MOON=full)
MODE=new node test/moon.mjs                     # fairy (server with DEV_MOON=new)
node test/fullrun.mjs                           # plays all 12 chapters and bosses (after smoke.mjs)
node test/upstream.mjs                          # back-off rules for the weather and geocoding APIs
node test/metno.mjs                             # MET Norway Expires / If-Modified-Since (fake fetch, no network)
node test/restart.mjs                           # pauses and MET entries survive a restart (fake store)
```

## Adding chapters

Write `src/content/chN.ts` following the existing chapters (correct answer first; the server shuffles), add it to `src/content/index.ts`, set `available: true` in `chapters.ts`, add the gear to `ITEMS` in `src/game/state.ts`, then run `npm run check`.
