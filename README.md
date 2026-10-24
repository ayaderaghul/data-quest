# Data Quest

An 8-bit RPG for studying *Designing Data-Intensive Applications*, chapter by chapter.

Each chapter is a tree of **building blocks** with prerequisites. For every block you:

1. Read the **fundamental card** and pass a recall check → fundamental gem (worth 30 gold)
2. Solve the **scenario** → scenario gem (20 gold)
3. Pass the **quiz** (2 of 3) → quiz gem (10 gold)

Clear every block to face the chapter boss and win a piece of noble gear. Gems are minted into gold at the Royal Mint; gold buys hints and cosmetics and ranks you in the Hall of Nobles against eight rival knights, each strong in one chapter.

Random events keep it interesting:

- **Live weather** (Open-Meteo, locked once per day): sunny +10% gold, cloudy +10% XP, rain drops bonus gems, fog doubles quiz gems but disables hints, snow brings a review challenge, storms bring a timed challenge.
- **Your sky, or any sky**: the game asks for your location (or a city) before fetching weather. Teleport to any city to play under its weather: the first teleport each day is free, then 25 gold. Weather comes from Open-Meteo with MET Norway as a fallback; city search falls back to OpenStreetMap Nominatim.
- **Moon calendar**: at full moon a wolf gives a 5-question shortcut test (pick the memory anchor that cracks each question; big rewards). At new moon a fairy gives a step-ordering puzzle and a proverb (mostly Italian).
- **Wild encounters** on the map: mystics (riddles), beasts (3-question fights), wandering elves (gem trades) and rival knights (speed duels).

Chapters 1–5 are playable; 6–12 are on the map as "coming soon".

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
npm run check                                   # validates content and prerequisite graph
INVITE=DQ-... node test/smoke.mjs               # end-to-end test against a running server (fresh DB)
node test/moon.mjs                              # location, teleport, wolf (server with DEV_MOON=full)
MODE=new node test/moon.mjs                     # fairy (server with DEV_MOON=new)
```

## Adding chapters

Write `src/content/chN.ts` following the existing chapters (correct answer first; the server shuffles), add it to `src/content/index.ts`, set `available: true` in `chapters.ts`, add the gear to `ITEMS` in `src/game/state.ts`, then run `npm run check`.
