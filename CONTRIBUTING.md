# Contributing to InkBoard

Thanks for helping. This is a small npm-workspaces monorepo, so one install and a handful of commands cover everything.

## Layout

| Folder | What lives there |
| --- | --- |
| `shared/` | Pure TypeScript used by both apps: the DCN ink engine (`src/lib/dcn.ts`), planner, catalogue ranking, bundle format. No Node or DOM APIs. |
| `backend/` | Fastify 5 on Node 22. TypeScript runs natively (`--experimental-strip-types`), so there is no build step. |
| `frontend/` | TanStack Start + Nitro SSR, React 19, Tailwind 4. |
| `scripts/` | The edge server, the browser e2e, the replay smoke test, the bundle budget check. |

## Setup

You need **Node 22** and **ffmpeg**. Postgres and Redis are optional.

```bash
npm ci
cd backend  && npm run dev      # API  http://127.0.0.1:8787
cd frontend && npm run dev      # site http://127.0.0.1:5173 (proxies /api to 8787)
```

## Before you open a PR

CI runs exactly these, so run them first:

```bash
npm run lint                                  # Biome. Errors fail CI.
npm run typecheck                             # shared, backend, frontend
npm test                                      # shared, backend, frontend
cd frontend && BUDGET_STRICT=1 npm run build  # production build + bundle budget
```

On a machine with about 1 GB of RAM, run **one heavy job at a time** and give Node a cap, for example `NODE_OPTIONS=--max-old-space-size=600`. Running several `tsc` processes at once can freeze the machine. The frontend build wants more, so use `--max-old-space-size=2048` where you have it.

### Lint rules that catch people

- `noAssignInExpressions` is an error. Write `let x = m.get(k); if (!x) { x = new Set(); m.set(k, x); }`, not `(m.get(k) ?? m.set(k, new Set()))`-style tricks.

## Tests

- Backend tests sit next to the code (`src/**/*.test.ts`) or in `backend/tests/`. They use `node:test`.
- Run one file: `cd backend && node --experimental-strip-types --import ./register.mjs --test src/lib/paged.test.ts`
- Frontend tests: `cd frontend && npm test`.

### Redis tests

`backend/tests/redis/` runs the ioredis client, the Lua rate limiter and the timeline cache against a **real** Redis.

- Locally the test starts its own `redis-server` on a free port. If the binary is not installed the tests **skip**, they do not fail. Install it with `sudo apt-get install redis-server` (Debian/Ubuntu) or `brew install redis`.
- To use a Redis you already run, set `REDIS_TEST_URL=redis://127.0.0.1:6379`. The tests use unique keys and do not flush the database.
- CI provides a Redis service and sets `REDIS_TEST_URL`, so nothing skips there.
- `redis.down.test.ts` points at a closed port on purpose, to prove callers fall back to memory instead of hanging.

### Browser checks

Two scripts drive a real Chromium against a running stack (API + site + edge on port 3000). Playwright is deliberately **not** in `package.json`.

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright@1.49.1 && npx playwright install chromium
```

Start the stack the way the `e2e` job in `.github/workflows/ci.yml` does (build the site, then run the API, `node .output/server/index.mjs` and `scripts/serve.mjs`), seed an admin and a member, then:

```bash
# Every page, both roles, axe accessibility, no sideways scroll
PLAYWRIGHT_DIR=/tmp/pw E2E_BASE=http://127.0.0.1:3000 \
  E2E_ADMIN=owner@ci.local:ci-owner-pass-1 E2E_MEMBER=member@ci.local:ci-member-pass-1 \
  node scripts/e2e.mjs --shots e2e-shots

# Replay: plays a synthetic board lesson and reads the ink canvas pixels
node --experimental-strip-types scripts/replay-fixture.ts /tmp/fixture.json
ffmpeg -f lavfi -i color=c=black:s=320x180:r=10 -t 12 -c:v libvpx -b:v 50k -an /tmp/replay.webm
PLAYWRIGHT_DIR=/tmp/pw REPLAY_FIXTURE=/tmp/fixture.json REPLAY_VIDEO=/tmp/replay.webm \
  E2E_BASE=http://127.0.0.1:3000 E2E_MEMBER=member@ci.local:ci-member-pass-1 \
  node scripts/replay-smoke.mjs --shots replay-shots
```

The replay smoke test serves the lesson by intercepting requests, so it needs no Unacademy access. It checks strokes, undo, erase-all then undo, the hexagon shape, a blank page, and a repaint after resize. If you change the DCN engine or the whiteboard painter, run it.

## Changing the ink engine (`shared/src/lib/dcn.ts`)

- Add a behaviour test in `backend/src/lib/dcn.ported.test.ts` (build events, call `compactEvents`, assert with `visibleStrokes`). Time (`p_time`) is in **microseconds**.
- Bump `PARSER_VERSION` (shared) and the timeline `CACHE_VER` (backend `lesson-media.ts`) when the packed output changes, so cached timelines are rebuilt.
- Shape SVGs live in `backend/src/assets/shapes/`. `backend/src/lib/shape-geom.test.ts` runs every bundled SVG through the flattener, so a new file is checked automatically.

## Dependencies

Dependabot opens PRs weekly. If several touch `package-lock.json`, merge them into one branch and regenerate the lockfile (`git checkout main -- package-lock.json && npm install`) instead of resolving conflicts by hand. Run the four checks above plus the Redis tests for an `ioredis` bump and the replay smoke for anything in the player.

## Web vs desktop

This repo is the **web** app: it keeps sign-in, Postgres and Redis. The separate desktop build removed those and added an offline download queue, audio-only extraction and a folder picker. Do not port those here. Behavioural fixes (the ink engine, player, shapes, parsing) are welcome in both.

## Pull requests

- Branch from `main`; keep one topic per PR.
- Add a line to `CHANGELOG.md` under today's date. Say what a user sees, not which file changed.
- Do not commit secrets. `backend/.env` and `backend/data/` are ignored.
