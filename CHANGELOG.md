# Changelog

## 2026-10-28 — review pass

### Security
- Members could read any saved-lecture job (`GET /api/jobs/:id`, `/artifacts/*`, `/bundle.zip`) regardless of sharing or the Downloads switch, and job ids were recomputable from a lesson id. Jobs now require the lesson to be shared (same rule as `/api/lessons/:id`); artifacts and the bundle also need Downloads; ids are HMAC-keyed by a per-install secret (`JOB_DIR/.job-secret` or `JOB_ID_SECRET`).
- Login lockout counters move to Redis when configured, so they survive restarts and are shared across processes. Memory fallback kept.

### Performance
- brotli/gzip on API responses (`@fastify/compress`). Timeline JSON ~4.5 MB → ~1.0 MB. Zip and range-served media opt out with `no-transform`.

### Data
- `ib_migrations` + ordered transactional runner for changes to existing tables. First migration: `(user_id, id desc)` index on `ib_activity`.

### UX
- Course header shows "No replays yet" / "N without replay".

### CI
- New `e2e` job runs `scripts/e2e.mjs` in Chromium against a real API + SSR build and uploads screenshots.


## 2026-10-28 (later) — sync merge, workspaces, page splits

- **Sync conflicts:** when two devices change the planner between syncs, plans, tasks and day logs are merged record by record (newer `updatedAt` wins, deletes are kept, ties keep this device). `PUT /api/me/state` accepts a `base` hash per entry and refuses stale writes, returning `conflicts` so the device merges and retries. Older clients without `base` behave as before.
- **npm workspaces:** one root `package-lock.json` and one `npm ci` for shared, backend and frontend. CI and the Dockerfile use the single install.
- **Fix:** `shared/src/lib/planner/storage/core.ts` was never committed because the core-dump rule `core.*` in `.gitignore` matched it, so fresh clones and CI had no planner store. The rule is now `/core` and `core.<pid>`.
- Split `course-page.tsx` (796 → 283 lines, plus `course/{helpers,catalog-shelf,live-shelf}`) and `batch-page.tsx` (635 → 188, plus `batch/{helpers,session-rows,batch-board}`).
- Legacy colour/type classes (`text-primary`, `text-muted`, `text-h1..3`, `text-caption`, `text-seal`, …) replaced with kit tokens across 37 screens.
- Source-pinning tests now read the player hooks where that logic lives.

## 2026-10-28 — accounts on the database, roles, groups, member view, UI pass

### Accounts and data
- Accounts, sessions, groups, shares, activity, audit log and per-person app data moved from a local SQLite file to Postgres (Neon via `DATABASE_URL`), with embedded PGlite when no URL is set. The old SQLite file is imported once on boot.
- Roles: the setup account is the **super admin**; only it can add, promote, pause, demote and remove admins.
- Plans, watch history, saved courses, watch later, favourites and preferences sync to the account (every 15 s and on tab hide). Signing in as someone else on the same browser clears the previous person's data first.
- *Ask for a new password on first sign-in* for new members and password resets; every other route is blocked until it's done.
- *Signed-in devices*: list sessions, sign out one device or all others.

### Sharing
- Groups (cohorts) with members; share with everyone, groups, or chosen members.
- Shares get optional start/end dates, a pin, and can be edited after creation. The sharing list filters by kind and by live / scheduled / ended.

### Member view
- Browse and Search are hidden unless the admin turns them on (or uses Open mode); every "Browse"/"All exams" link falls back to the dashboard.
- Live shows only when Live is on and an exam is shared; the feed lists only that exam's classes.

### Admin dashboard
- New tabs: Groups, Audit log, Admins (super admin only). Activity shows the last hour and who is online now; older raw events are deleted, daily totals are kept a year.
- Member page shows their study plan progress and classes from the last 30 days.

### UI
- Planner settings and the plan wizard (exam, courses, pace, preview) rebuilt on the shared component kit: segmented controls, cards, switches, a sticky step bar on phones, every exam listed in the exam step.
- Plan switcher, planner segmented control and shelf chips moved to kit tokens; unused theme toggle removed.

### Engineering
- Biome lint at the repo root (`npm run lint`), wired into CI; real lint errors fixed.
- `scripts/e2e.mjs`: browser end-to-end check (desktop + phone).
- Cryptic test files (`patina-*`, `phase*`, `round*`, `leftover`) renamed to what they cover.
- Accounts store split into focused modules; auth routes split into auth / admin / shared helpers; admin page split into one file per tab.
