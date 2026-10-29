# Changelog

## 2026-10-29 — layout overflow and sign-in labels

### Fixed
- Admin → Activity: the left column slid under the "Online now" card at widths ≤ 1180 px, and the same stack overflowed on Overview and Member detail on phones. Root cause: a `grid gap-*` with no columns gets one implicit `auto` track whose minimum is its widest unbreakable child, so `truncate`/`min-w-0` further down could not shrink it. `base.css` now gives every `.grid` `grid-auto-columns: minmax(0, 1fr)` (explicit `grid-cols-*` tracks unaffected; `grid-flow-col` skipped), which fixes all 124 such grids at once instead of patching each page.
- Sign-in rows showed the raw user-agent ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 …"). New `@inkboard/shared/device` (`deviceName`, `looksLikeUserAgent`, `signInLabel`) is used at write time (`POST /api/auth/login` now stores "Chrome on Linux") and at render time in ActivityFeed and OnlineNow so rows written before this change read the same. The sessions dialog shares the helper instead of its own copy.
- Long badges ("Course on Principles of Inheritance…") pushed past list rows on phones (`/teacher/*`, `/live`). `Badge` ellipsises and `ListRow` caps a badge at half the row.

### Tests
- `shared/src/lib/device.test.ts` (3): browser/OS precedence (Android before Linux, CriOS, Samsung Internet), phone flag, empty input, humanising 120-char-truncated legacy rows.

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

## 2026-10-28 — review pass, second round

### Accessibility
- Dark-mode `fg-muted`, `fg-faint`, `info` tokens and a dedicated `live-fg` now pass 4.5:1; out-of-month calendar cells and empty seals use colour mix instead of `opacity`.
- Live badge pulses only its dot (fading the label dipped it to 4.4:1); unavailable list rows mute the title instead of fading the row (the badge went to 3.9:1); skipped planner tasks likewise. axe: 0 serious/critical on 20 pages in dark mode.
- `<main>` is focusable (skip-link works); lantern drag handle is `aria-hidden`; `Tabs` emit `aria-controls` only when panels exist; analytics figures are one `<dl>` each; heading levels no longer skip on Browse / course Live shelf.

### Planner
- **Fit to exam**: `fitToExam()` regenerates across lectures/day × daily minutes and offers the lightest setting that ends by the exam date, as a one-click button in the wizard.
- Spaced reviews and the recap horizon are clamped to `examDate`; nothing is scheduled after the exam.
- Last study day cannot be unticked (`toggleStudyDay`).
- `overlappingTopics()` flags the same topic in two selected courses; wizard section "Same topic, two courses".

### Accounts
- `POST /api/auth/reset-request` ("Forgot your password → ask your admin"): flags `users.reset_requested_at` (migration `0002`), always 200, throttled like login, audited as `password.reset_requested`. Admin overview banner + "Asked for a reset" badge; cleared when the admin sets a new password.
- `CSRF_TRUSTED_ORIGINS` separates the write allow-list from `CORS_ORIGINS` (`*` ignored for CSRF).
- `share.add` audit detail names the members / groups.

### Player
- Safari / iOS without an HLS copy: banner explains and offers "Prepare for this device" (admins or members with Downloads).

### UX
- Zero-state copy for `DayBars`, analytics page and a calendar legend.
- Hindi UI toggle labelled "preview" with its scope.


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
