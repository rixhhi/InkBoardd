# InkBoard

A private study desk for a small group preparing for Indian competitive exams (JEE, NEET, GATE, UPSC, CA …). An admin shares exam hubs, teachers, courses or single classes; members replay the classes with the whiteboard ink in sync, keep notes, and plan their revision with a calendar and a memory board. **No sign-up, no email, no ads, no paid services** — one admin creates every account.

> **Live:** site on Vercel, API on Render, data in Neon Postgres + Upstash Redis. See [Deploying](#deploying-render-api--vercel-site). History of every pass is in [CHANGELOG.md](CHANGELOG.md).

## Quick start

```bash
# Node 22 and ffmpeg. Postgres/Redis are optional (in-memory + embedded PGlite otherwise).
npm ci
cd backend  && npm run dev      # API      http://127.0.0.1:8787
cd frontend && npm run dev      # site     http://127.0.0.1:5173  (proxies /api to 8787)
```

Open the site. It sends you to `/setup`; the one-time code is printed in the API log (and `backend/data/setup-code.txt`). That account is the super admin. Then **Admin → Members → Add member**, and **Share** an exam or course from any catalogue page.

Checks: `npm run lint` · `npm run typecheck` · `npm test` (shared + backend + frontend) · `cd frontend && BUDGET_STRICT=1 npm run build`.

## What's inside

| Package | What it is | Port |
| --- | --- | --- |
| `backend/` | Fastify 5 API on Node 22 (TypeScript run natively, no build). Catalogue proxy for Unacademy, slide/notes media proxy, SSE live board, lecture enhance jobs (ffmpeg), accounts, sharing, activity, notifications. | 8787 |
| `frontend/` | TanStack Start + Nitro SSR site. React 19, Tailwind 4, hls.js, pdf.js. Planner and library data sync to the signed-in account. PWA with an offline planner. | 3100 (built) / 5173 (dev) |
| `shared/` | Pure TypeScript both apps import: ink decoding, planner domain (scheduler, spaced review, Fading Ink), catalogue ranking, bundle format, help deck, copy. | — |

`scripts/serve.mjs` is a small edge that fronts both on **one public port (3000)** for single-box installs: `/api/*`, `/healthz`, `/readyz` go to the API; everything else to the SSR site. On Vercel the same job is done by the Nitro server routes in `frontend/src/routes/api.$.tsx`.

### Features

- **Player** — whiteboard ink timeline in sync with the recording, slide strip, teacher camera, chapters, notes (PDF), speed/skip, resume at the saved minute, offline bundles.
- **Catalogue** — exam hubs, teacher shelves, courses, batches, live feed; everything read from public Unacademy pages and cached. When upstream changes shape, shelves go empty rather than crash and the UI says so.
- **Planner** — a wizard builds a day-by-day plan from the courses you pick and your exam date (fit-to-exam; nothing lands after exam day); Tasks, Calendar, a Pomodoro bound to a task, spaced-review scheduling, analytics, badges. **Fading Ink** draws each studied lesson as a stroke that fades as you forget it (`R = exp(-t/S)`) with a one-tap "put the fading ones on the calendar".
- **Accounts & sharing** — super admin → admins → members. Share to everyone, groups or individuals, with optional visible-from/until dates; unsharing revokes access at once, including classes reached through it. Members see only what is shared (curated) or everything (open mode), with per-feature switches (Browse, Search, Live, Planner, Downloads).
- **Notifications** — a bell in the header. Members hear when something new is shared with them, when the admin set a new password, and get a welcome on first sign-in. Admins hear when a member asks for a password reset or signs in for the first time. In-app only; no email or push.
- **Admin dashboard** — members, groups, sharing, settings, last-hour activity as storylines, weekly digest, 90-day audit log, each member's planner and ink board (the same math the member sees).
- **Accessibility** — every token pair passes WCAG AA (enforced by a test); axe-core reports 0 serious/critical on every page, both themes, both roles, in CI; reduced-motion and reduced-transparency honoured; a "?" help sheet on every hard-to-read section and a `/planner/guide`.

## Architecture

```
browser ──► Vercel (Nitro SSR) ──/api/*──► Render (Fastify API) ──► Neon Postgres  (accounts, shares, activity,
   │          renders pages,                 auth guard, rate limits,                 notifications, catalog cache, jobs)
   │          proxies /api same-origin       catalogue + media proxy,     ──► Upstash Redis  (login lockout, rate-limit
   │          so cookies stay first-party    ffmpeg jobs                                      counters, timeline cache)
   └── localStorage working copy ◄──── /api/me/state sync every 15 s ────┘
```

- **Shared math** — anything a member sees that an admin can also see (ink bands, plan progress, streaks) is computed by the same `shared/` function on both sides, so the two never disagree.
- **Auth guard** (`backend/src/auth/guard.ts`) — every `/api` route is gated by role → feature switch → share reach-through. Grants are recorded per share so they vanish with it.
- **Proxy trust** — `TRUST_PROXY=2` on Render trusts the second `X-Forwarded-For` hop only when the Vercel server stamps `x-inkboard-proxy-secret`. Rate limits are per **session** for signed-in traffic (students on one Wi-Fi don't share a bucket) and per IP for sign-in.
- **Security headers** — the site sends a CSP, HSTS (preload), COOP, nosniff, `X-Frame-Options: DENY`; the API sends its own helmet CSP and `no-referrer`.

## Status

- **Typecheck** clean in all three packages. **Lint** (Biome) 0 errors.
- **Tests**: 1,109 passing (76 shared, 731 backend, 302 frontend) plus `scripts/e2e.mjs` — a browser run across admin and member, desktop and phone, light and dark, asserting no sideways scroll and axe 0 serious/critical on every page. CI runs the e2e job against a real API + SSR build and Lighthouse against the same stack.
- **Build** passes the bundle budget: first load 767 KB raw / **246 KB gzip** across 37 files (cap 900 KB), total 2,587 KB (cap 3,000 KB). The caps sit ~15 % above measured so a stray static import of hls.js, pdf.js or jszip into the shell fails CI instead of shipping.
- **Dependencies**: `npm audit` 0 vulnerabilities; Dependabot opens grouped weekly PRs.

## Accounts, sharing and activity

Every `/api` route needs a signed-in account (only `/healthz`, `/readyz` and `/api/auth/status|setup|login|logout` are public).

**Roles**

| Role | Created by | Can |
| --- | --- | --- |
| Super admin | `/setup`, exactly once | Everything below, plus add, promote, pause, demote and remove admins (Admin → Admins). |
| Admin | the super admin | Members, groups, sharing, settings, activity, audit log. Sees every page. |
| Member | any admin | Their dashboard and what is shared with them. No self sign-up. |

1. **First run:** open the site. It sends you to `/setup`. Enter the setup code from the API log (or `backend/data/setup-code.txt`), your name, email and a password. That account is the super admin. Setup answers 409 afterwards.
2. **Members:** Admin → Members → *Add member*. A readable password is suggested; *Ask for a new password on first sign-in* is on by default, so you never know the member's real password. Members can be put in groups when they're created.
3. **Groups:** Admin → Groups. Cohorts such as "NEET 2027 · Morning". Moving a member in or out changes what they see at once.
4. **Sharing:** Admin → Sharing, or the **Share** button on any exam, teacher, course or batch page.
   - Audience: every member, one or more groups, or chosen members.
   - Optional note, *visible from* / *visible until* dates (scheduled and expired shares are hidden from members automatically), and *pin to the top*. Shares can be edited later without re-sharing; filter the list by kind and by live / scheduled / ended.
   - Exam → its hub, teachers and courses, **and Live for that exam**. Teacher → courses and batches. Course → all classes. Batch → schedule. Class → that class.
   - Unsharing removes access straight away, including classes reached through it.
5. **What members see:** Home, Library and Planner. **Browse** and **Search** appear only if you switch them on (or use Open mode). **Live** appears only when Live is on *and* at least one exam is shared with them; the feed lists only that exam's classes. Settings: *Curated* / *Open*, and switches for Browse, Search, Live, Planner, Downloads.
6. **Activity:** the raw log keeps **one hour** (older events are deleted every 5 minutes). Watch time and classes opened roll up into daily totals kept for a year, so charts, "most watched" and each member's 30-day class list survive. The Activity tab shows the last hour plus *online now* (active in the last 5 minutes). The audit log records every admin change for 90 days.
7. **Member page:** stats, 30-day chart, their study plan (name, progress, today, minutes this week — read from their synced planner), classes in the last 30 days, groups, personal shares, what they also see through groups/everyone, pause, reset password (forces a new one), sign out everywhere, remove.

**Data lives in the database.** Accounts, sessions, groups, shares, activity, audit and each person's app data (plans, watch history, saved courses, watch later, favourites, player and theme preferences) are stored in Postgres (`DATABASE_URL`, e.g. Neon) or, with no URL, in embedded PGlite under `backend/data/pg`. The browser keeps a working copy and syncs it every 15 s and when the tab is hidden; signing in on another device restores it, and signing in as a different person on the same browser clears the previous person's data first. Device caches (catalog cache, offline media) stay on the device.

Security: salted scrypt passwords; HttpOnly SameSite cookies (30 days; revoked on logout, pause, role change or password reset); *Signed-in devices* in the account menu lists sessions with per-device and "sign out other devices"; 5 wrong passwords per account+IP lock for 15 minutes; cross-site writes refused; a forced password change blocks every other route until done. Tests: `backend/tests/auth/auth.test.ts` (30 cases) and `scripts/e2e.mjs` (browser).

| Route | Who | Purpose |
| --- | --- | --- |
| `GET /api/auth/status`, `POST /api/auth/setup|login|logout` | anyone | Session state, one-time super admin, sign in/out |
| `GET /api/me`, `GET /api/me/summary`, `POST /api/me/password`, `POST /api/activity` | signed in | Profile, active shares, own stats, password, watch beacons |
| `GET /api/me/sessions`, `DELETE /api/me/sessions/:id`, `POST /api/me/sessions/revoke-others` | signed in | Signed-in devices |
| `GET|PUT /api/me/state` | signed in | Synced app data (`inkboard.*` keys, 4 MB per person) |
| `GET /api/me/notifications`, `POST …/read`, `DELETE …/:id` | signed in | The bell: unread count + newest rows, mark some/all read, dismiss |
| `GET|POST /api/admin/members`, `GET|PATCH|DELETE /api/admin/members/:id`, `POST …/:id/signout` | admin | Members |
| `GET|POST /api/admin/groups`, `PATCH|DELETE /api/admin/groups/:id` | admin | Groups |
| `GET|POST /api/admin/shares`, `PATCH|DELETE /api/admin/shares/:id` | admin | Sharing |
| `GET|PUT /api/admin/settings`, `GET /api/admin/overview`, `GET /api/admin/activity`, `GET /api/admin/audit` | admin | Settings, dashboard, last-hour log, audit |
| `GET|POST /api/admin/admins`, `PATCH|DELETE /api/admin/admins/:id` | super admin | Admins |

## Run it

You need **Node 22** and **ffmpeg**. Postgres and Redis are optional: without them caches and rate limits live in process memory and finished jobs are rebuilt from `JOB_DIR` on restart. For 2–3 people that is fine.

### Option A — Docker (recommended for a VM)

```bash
cp backend/.env.example backend/.env       # optional; everything has a default
docker compose up -d --build               # builds the site (needs ~2 GB RAM once), starts API + site + edge
open http://localhost:3000
```

Job artifacts persist in the `jobs` volume. To add Postgres/Redis, uncomment the two services and the `DATABASE_URL` / `REDIS_URL` lines in `docker-compose.yml`.

### Option B — PM2 on a box you already have

```bash
npm ci                     # one install for shared, backend and frontend (npm workspaces)
NODE_OPTIONS=--max-old-space-size=2048 npm run build -w frontend
pm2 start ecosystem.config.cjs && pm2 save
curl http://127.0.0.1:3000/healthz
```

Three PM2 apps come up: `inkboard-api`, `inkboard-web`, `inkboard-edge`. Only 3000 needs to be reachable. Rebuild the site and `pm2 restart inkboard-web` after frontend changes; the API picks up code on `pm2 restart inkboard-api`.

### Option C — local development

```bash
cd backend  && npm run dev          # API on 8787, no build step
cd frontend && npm run dev          # Vite on 5173, proxies /api to 8787
```

### Checks

```bash
npm run typecheck                                   # all three packages
npm run lint                                        # Biome; errors fail CI
npm test                                            # all three packages
E2E_ADMIN=you@x:pass E2E_MEMBER=m@x:pass node scripts/e2e.mjs --shots e2e-shots   # browser check against :3000
cd frontend && BUDGET_STRICT=1 npm run build        # production build + bundle budget
```

On a machine with under 2 GB RAM, give Node more heap for the frontend typecheck and build: `NODE_OPTIONS=--max-old-space-size=2048`. The SSR build was OOM-killed at 1 GB without swap.

## Configuration

All variables are optional. The `.env.example` files list them with comments. The ones that matter for an internal install:

| Variable | Default | Notes |
| --- | --- | --- |
| `JOB_DIR` | `/tmp/inkboard-jobs` | Where enhance jobs write HLS, posters, sprites. A 90-minute class is ~170 MB plus HLS rungs. Put it on real disk. |
| `FFMPEG_CONCURRENCY` | `1` | 1–4 encodes at once. Keep 1 on two cores. |
| `DATABASE_URL` / `REDIS_URL` | unset | Optional persistence and shared rate-limit counters. |
| `PG_POOL_MAX` | `6` | Accounts pool size per API process (cap 50). Neon free tier allows ~100 connections. |
| `TRUST_PROXY` | unset | `1` behind the bundled edge or any single reverse proxy. See the hop table below before using `2`. |
| `XAI_API_KEY` | unset | Turns `POST /api/study/summary` from a board outline into revision bullets. |
| `DATABASE_URL` / `AUTH_DATABASE_URL` | unset | Accounts and app data use `AUTH_DATABASE_URL`, else `DATABASE_URL`. Unset: embedded PGlite in `backend/data/pg`. A first-version `backend/data/inkboard.sqlite` is imported once on boot. |
| `AUTH_DB` | unset | `local` forces PGlite even with a database URL; `:memory:` is for tests. |
| `STATS_TZ` | `Asia/Kolkata` | Time zone for "per day" charts and rollups. |
| `SETUP_CODE` | random | Pins the one-time admin setup code (handy in Docker). Otherwise it is printed in the API log and written to `backend/data/setup-code.txt`. |
| `JOB_ID_SECRET` | random, kept in `JOB_DIR/.job-secret` | Keys job ids. Pin it when `JOB_DIR` is not persistent or several API boxes share one `JOB_DIR`; otherwise a rebuilt disk means existing jobs get new ids (a re-save, nothing worse). |
| `CSRF_TRUSTED_ORIGINS` | falls back to `CORS_ORIGINS` | Comma-separated origins allowed to make cookie-authenticated writes. `*` is ignored here (it only ever applies to CORS reads), so a wide CORS setting never widens CSRF. |
| `JOB_MIN_FREE_GB` / `JOB_DIR_MAX_GB` | `2` / `20` | Refuse new downloads below this free space; prune the oldest finished job folders above this total. |
| `WARM_CACHE` / `WARM_EXAMS` | on / 5 big exams | Pre-loads exam hubs and the live feed after boot so the first visitor doesn't wait. |

## API surface

| Route | Purpose |
| --- | --- |
| `GET /healthz`, `GET /readyz` | Liveness; readiness reports `postgres`, `redis`, `ffmpeg`. |
| `GET /api/exams`, `/api/exams/:goalId/{hub,teachers,courses,tests,practice}` | Exam hubs. |
| `GET /api/educators/:username[/batches|/specials]`, `GET /api/search/educators` | Teacher shelves. |
| `GET /api/courses/:uid[/lessons]`, `GET /api/batches/:uid[/schedule]`, `GET /api/classes/:uid` | Course, batch and class detail. Lesson `replayId` is the id the player uses. |
| `GET /api/lessons/:replayId/timeline`, `/notes`, `POST /api/lessons/probe` | Ink timeline, notes, media probe. |
| `GET /api/slide`, `/api/notes`, `/api/live-slide` | Media proxy (allow-listed Unacademy hosts). |
| `GET /api/live/feed`, `/api/live/sessions/:uid[...]`, `GET /api/live-board` (SSE) | Live classes. |
| `POST /api/jobs/lectures` → `GET /api/jobs/:id` → `GET /api/jobs/:id/artifacts/*` → `GET /api/jobs/:id/bundle.zip` | Save + enhance a replay; `bundle.zip` streams the whole saved folder (STORE, zip32, 409 until `done`). Body `{ id, title?, enhance?, remux?, noMedia?, noNotes? }`. The create response carries a one-time `token` needed for `DELETE /api/jobs/:id` and `POST /api/jobs/:id/clips`. Members: every job route needs the job's class shared with them; `artifacts/*` and `bundle.zip` also need the Downloads switch. |
| `POST /api/study/summary` | Revision bullets (6/min per visitor). |

Rate buckets per visitor per `RATE_WINDOW_MS` (60 s): catalog `RATE_LIMIT` (120), media ≥600, generous ≥300, expensive (job create/clip/delete) ≤30.

## Known limits

- The catalog is scraped from Unacademy's public pages and JSON. When they change shape, shelves go empty rather than crash; `GET /api/upstream/health` and the upstream banner in the UI say so.
- The enhance step on a 90-minute class takes a long time on two cores (loudnorm is two full passes, then three HLS rungs). It runs in the background and the job poll shows `enhancing` until done. Raise `FFMPEG_CONCURRENCY` only with more cores.
- There is no email-based password reset: an admin resets passwords from the member page (the member then picks a new one).
- Planner edits made on two devices at once are merged per plan, task and day (the newer edit of each record wins; deletes are kept). Other synced keys (watch history, saved items, preferences) are still last-writer-wins per key.
- `backend/tests/auth/auth.test.ts` runs an in-memory PGlite database that peaks around 600 MB. On a 1 GB machine that is also running the site, the kernel can kill it mid-run (it shows up as `signal: SIGKILL`, not an assertion). Stop PM2 first or run it on a larger box; CI runners are fine.
- The offline library is a separate PWA entry (`/offline`) that stores saved classes in the browser.

## Deploying: Render (API) + Vercel (site)

The site on Vercel proxies `/api`, `/healthz` and `/readyz` to the API on Render from inside the Nitro server (`frontend/src/routes/api.$.tsx`, `healthz.tsx`, `readyz.tsx` → `src/lib/server/api-upstream.ts`). The browser only ever talks to the Vercel origin, so cookies are first-party and the API host never reaches the client. `vercel.json` has **no rewrites** — deep links such as `/play/…` and `/planner/today` are rendered by the TanStack server.

### 1. API on Render

Dashboard → **New → Blueprint** → this repo. `render.yaml` defines one Docker web service built from `backend/Dockerfile` (Node 22 + ffmpeg; no build step — the backend runs TypeScript natively). Fill in the three `sync: false` variables when prompted:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | your Neon URL (`postgres://…?sslmode=require`) |
| `REDIS_URL` | your Upstash URL (`rediss://…`) |
| `CORS_ORIGINS` | the Vercel origin(s), e.g. `https://inkboard.vercel.app,https://inkboard.example` |

Render generates `INKBOARD_PROXY_SECRET` and `SETUP_CODE`; copy both from the service's Environment tab — you need the first on Vercel and the second once, to claim the install. `TRUST_PROXY=2` is already set (two forwarding hops: Vercel → Render), so rate-limit buckets are per real visitor only when the site stamps the secret. The API binds `0.0.0.0:$PORT` automatically on Render.

Check: `curl https://<service>.onrender.com/readyz` → `{"postgres":"ok","redis":"ok",…}`. On the free plan the instance sleeps after 15 minutes and has no disk, so saved-lecture artifacts (`JOB_DIR`) vanish on each deploy; uncomment the `disk:` block on a paid plan.

### 2. Site on Vercel

**New Project → Import** this repo. Settings:

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Other (`vercel.json` carries install/build/output) |
| Node.js version | 22.x |

`vercel.json` runs `npm ci` at the repo root (workspaces: shared + frontend) and `npm run build`; the Nitro `vercel` preset emits `.vercel/output` when `VERCEL=1`. Environment variables (Production and Preview):

| Variable | Value |
| --- | --- |
| `INKBOARD_API_ORIGIN` | `https://<service>.onrender.com` — scheme + host, no path |
| `INKBOARD_PROXY_SECRET` | the value Render generated |
| `NODE_OPTIONS` | `--max-old-space-size=4096` (the SSR build wants ~1.5 GB) |

Deploy. Then open `https://<site>.vercel.app/healthz` — it must return the API's `{"ok":true,"service":"inkboard-api"}` through the proxy. If it returns `{"code":"MISCONFIGURED"}`, `INKBOARD_API_ORIGIN` is unset on Vercel.

### 3. First run

1. Open `https://<site>/setup`, enter `SETUP_CODE` from Render, create the super-admin.
2. Admin → Members → add members. Share an exam or course.
3. Add the Vercel preview origins to `CORS_ORIGINS` on Render if you want preview deployments to sign in.

### Proxy trust, in one table

`TRUST_PROXY` is a hop count from the right of `X-Forwarded-For`, not a boolean. Hop 2 is trusted only when `x-inkboard-proxy-secret` matches (`crypto.timingSafeEqual`); otherwise the header is dropped and `req.ip` is the socket address, so a direct caller cannot forge a bucket.

| Trust | `X-Forwarded-For` | Secret | `req.ip` |
| --- | --- | --- | --- |
| 2, matches | `203.0.113.10, 76.76.21.21` | yes | `203.0.113.10` (the visitor) |
| 2, matches | `198.51.100.50, 203.0.113.10, 76.76.21.21` | yes | `203.0.113.10` — the forged left entry is ignored |
| 2, missing/wrong | anything | no | socket address; header deleted |
| 1 | `203.0.113.10, 76.76.21.21` | either | `76.76.21.21` — use when the browser hits Render directly |
| unset | anything | either | socket address (one shared bucket — the API logs a warning) |

Set `LOG_TRUST=1` on Render for one request to see the chain the real deploy produces, then unset it.

### Other knobs on the API

- `RATE_LIMIT` / `RATE_WINDOW_MS` (default 120 per 60 s per visitor). Buckets: catalog (`/api/*`), media (slides/notes, ≥600), generous (live-board/study/job poll, ≥300; live-board then capped at 8/min), expensive (`POST /api/jobs/lectures`, clips, delete; 30). `POST /api/study/summary` is fixed at 6/min.
- `XAI_API_KEY` / `XAI_MODEL` for revision bullets; without them the summary is the board outline.
- `COOKIE_SAMESITE=none` only for an https iframe embed.
- Catalog routes time out at 25 s with `UPSTREAM_TIMEOUT`.

Ping `GET /healthz` every 5–10 minutes (cron-job.org, UptimeRobot) so a free Render instance does not sleep.

## License

Source-available for personal, non-commercial study use — see [LICENSE](LICENSE). InkBoard is not affiliated with Unacademy; you are responsible for the terms of any content you access through it.
