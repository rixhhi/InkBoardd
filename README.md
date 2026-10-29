# InkBoard

A study desk for Unacademy replays: exam hubs, teacher and course shelves, a whiteboard player with ink timelines and notes, live classes, favourites, an offline library, and a planner. Three packages in one repo:

| Package | What it is | Port |
| --- | --- | --- |
| `backend/` | Fastify 5 API on Node 22 (TypeScript run natively, no build). Catalog proxy for Unacademy, slide/notes media proxy, SSE live board, lecture enhance jobs (ffmpeg), study summaries. | 8787 |
| `frontend/` | TanStack Start + Nitro SSR site. React 19, Tailwind 4, hls.js, pdf.js. Planner and library data sync to the signed-in account. | 3100 (built) / 5173 (dev) |
| `shared/` | Pure TypeScript both apps import: ink decoding, planner domain, catalog ranking, bundle format. | — |

`scripts/serve.mjs` is a small edge that fronts both on **one public port (3000)**: `/api/*`, `/healthz`, `/readyz` go to the API; everything else to the SSR site. It plays the role `frontend/middleware.ts` plays on Vercel.

## Status

- **Typecheck**: clean in all three packages. **Lint**: `npm run lint` (Biome) — 0 errors; style warnings are reported, not fatal.
- **Tests**: 1,102 passing (76 shared, 725 backend, 301 frontend), 0 failing; plus `scripts/e2e.mjs`, a browser run of 23 checks on desktop and phone (sign-in, every admin tab, share dialog, member restrictions, planner and settings pages, no sideways scroll, no page errors). CI runs it too (`e2e` job) against a real API + SSR build and uploads the screenshots.
- **Build**: `vite build` passes the bundle budget (first load 753 KB / 1,563 KB cap; total 2,533 KB / 4,395 KB cap).
- **Browser matrix** (`scripts/e2e.mjs`, also the CI `e2e` job): every page check asserts 0 sideways scroll **and** axe-core 0 serious/critical. 35 checks per viewport; run as admin and as a member, light (`E2E_SCHEME` unset) and dark (`E2E_SCHEME=dark`), desktop and phone — all green.
- **Stores**: `backend/.env` (gitignored) points at Neon Postgres and Upstash Redis. Accounts moved from the SQLite file into Neon on first boot (`[accounts] imported 3 account(s) and 2 share(s)`).

### UI rebuild (Phases A–G of `docs/ui-rebuild-plan.md`) — done

- **Design system**: semantic tokens in `frontend/src/styles/tokens.css` (bg/surface/fg/accent/ok/warn/danger/live/subject-*, spacing, radii, z-index, motion) with light + dark palettes; a 25-component kit in `frontend/src/components/ui/` (`Button`, `IconButton`, `ListRow`, `PageHeader`, `Toolbar`, `Section`, `Tabs`, `Chip`, `Badge`, `Avatar`, `Menu`, `Dialog`/`ConfirmDialog`/`Sheet`, `SearchInput`, `Skeleton`/`EmptyState`/`ErrorState`, `Progress`/`Ring`, …) built on Radix primitives + Tailwind only.
- **Shell**: one `AppShell` (sidebar ≥ md, phone tab bar, context bar with breadcrumbs, library panel on Ctrl/Cmd+B) driven by `lib/nav.ts`. New routes `/browse`, `/library` (saved · watch later · downloads · history), `/live`, `/settings`; `/favourites*` redirect to `/library`.
- **Player**: transport, header, focus bar and stage overlays on the kit; overflow menu is the kit `Menu`; idle-hide chrome; 44 px touch rows.
- **Pages on the kit**: Home dashboard (Continue ×3, Live now, Watch later, Your exam, All exams), Browse, Exam hub, Teacher, Course, Search (recent-search chips when blank), Library, Live feed, Settings, Planner shell; command palette regrouped with icons and key hints.
- **Cleanup**: old `ui/kit.tsx`, `folio/shell.tsx`, `folio/margin.tsx`, `player-more.tsx`, `player-glyph.tsx`, `player/player-view.tsx` deleted; 200+ dead CSS rules (`.desk-*`, `.folio-*`, `.plate-*`, `.stamp-*`, `.hatch-chip`, `.ui-*`, `.player-more*`, `.write-line-*` input/rule) and 7 orphan keyframes removed (−1.3k lines). Every pinned source test now asserts roles, labels or behaviour instead of class names.
- **Follow-up pass (player, loaders, dropdowns, batch, live)**: player header + transport are overlays again (the stage had been pushed down and clipped); every loader is the kit spinner/skeleton; every notice is kit `ErrorState`/`EmptyState`; every `<select>` is the kit `Select`; batch page rebuilt on the kit (toolbar with view/when/teacher chips, week grid, `ListRow` sessions); live stage header/rail on the kit, and `/live/$classId` is a real page again — it previously `redirect`ed to `/`, so every “Live now” link bounced home.

### Phase H — planner on the kit — done

- **Tasks** (was Today): `/planner/today?day=YYYY-MM-DD` pages any day — prev/next, a 7-day strip with per-day tallies, `[` `]` keys and `T` for today. Non-today days get tense-correct copy ("2 planned · 75 min", "1 of 2 done"), bulk "Move to today" / "Push a day", and the calendar's day panel deep-links in. Logic in `shared/planner/day-nav.ts`.
- **Pomodoro that knows what you study** (`shared/planner/pomodoro.ts`): a block is bound to a plan task (lecture / revision / DPP / custom) or just a subject; presets 25·5, 50·10, 15·3 or custom; work → short break → long break every N rounds; pause/resume survives reloads. Every finished work phase is written to the study log as `source: "focus"` under that subject/course/lesson, so analytics, streaks and badges count it without a manual "Log study". Card on Tasks, tab title shows the clock, "Switch what you're on" mid-block.
- **Journal retired**: page, route, nav, palette entry and folio mode removed; the "Journal 7 days" badge became "7 focus blocks". `shared/planner/journal.ts` stays only as a data-retention module so old backups/recovery points still import.
- **Calendar**: kit header, month/week paging, kit Tabs for Month/Week/Agenda, reschedule dialog with per-strategy explanations; mini-board grid, drag-and-drop and legend unchanged.
- **Plan wizard**: 4-step rail (done steps clickable), kit Back/Next/Create.
- **Analytics**: figure cards with rings (struck, goal hit, sessions, late finishes), delta % vs previous period, weekday pattern and session-length bar charts, and a watched/focus/manual split of how the time was earned.
- **Badges, Settings, Dashboard, History**: kit headers and buttons; badges show a progress ring and "closest to earning"; settings shows a live "Saved" pill.
- **Modals**: `LogStudyDialog`, `AddTaskForm` and the planner `ConfirmDialog` are on the kit `Dialog`/`AlertDialog`.

### Fifth pass (2026-10-29) — every hard thing has a "?"

- **One help deck** (`shared/src/lib/help.ts`, 19 topics). Each topic answers the same five questions in the same order: *what it is* (two sentences), *how to use it* (numbered steps you can do right now), *why it's here* (in the student's terms — exam, time, memory), *worth knowing* (things people learn by accident), and, where a number might be questioned, *the math in plain words* plus *the questions people ask*. Tests lock that every topic is complete and every cross-link resolves.
- **"?" buttons** sit next to: the Ink title, the date slider, the re-ink planner card, the Tasks title, the week strip, the Focus timer, the Month title, the Pace headline, Coverage, Instruments, Seals, the revision-interval chips in the wizard, the offline banner, and on the admin side the weekly digest, Activity storylines and a member's ink board. Each opens a side sheet (bottom drawer on phones) with the topic; *see also* jumps between topics without closing it.
- **The Guide** (`/planner/guide`, nav "Guide", palette "Guide · how the planner thinks"): every topic in reading order with a sticky table of contents and `#anchors`, so you can send someone a link to exactly the explanation they need. Admin topics appear for admins only.
- e2e now opens a "?" and asserts the three sections are present and axe passes with the sheet open.

### Fourth pass (2026-10-29) — the planner closes its own loop

- **Ink → Tasks.** The Ink page ends with *Put the fading ones on the calendar*: pick a deadline (this week · two weeks · by the exam) and a count (3 · 5 · 8), see exactly which lessons land on which study days ("Today · 45 min: Continuity, Differentiation, Applications of derivatives · Tomorrow · 30 min: Limits, Projectile motion"), then **Add N to my plan**. `planReinks()` (`shared/src/lib/planner/ink.ts`) takes what will be below crisp on the deadline, worst first, skips lessons that already have a review in the window, and spreads them over work days within a daily re-ink budget (a third of `dailyMinutes`). `scheduleReinks()` writes them as ordinary revision tasks (`Re-ink: …`, note `from Ink`) so Today, the calendar, the pace meter and rating all treat them like any other review; one Undo entry, and none if nothing was added.
- **The model learns you.** Every rating (from Today or from Ink) is compared with what the model predicted at that moment: a *shaky* on a lesson it called crisp lowers that lesson's stability ×0.8; a *solid* on a ghost raises it ×1.25; agreement leaves it alone, confirmed-crisp slowly recovers toward 1. Bounded to [0.5, 2] so one odd day cannot wreck the picture. Stored per lesson as `LessonReviewState.calibration` (optional — old states load as 1) and applied inside `stabilityFor()`, so the admin's view calibrates identically.
- **Admin weekly digest** (`GET /api/admin/digest`, shown as *This week* on Overview). One line per member, quietest first: minutes this week vs last (+40% / −15% / new), active days of 7, distinct lessons, streak, share of ink still crisp, last seen — and a one-sentence nudge when there is one ("Quiet this week after a busy one — worth a message", "4 of 7 studied lessons are ghosts — reviews are overdue", "9-day streak"). Streak and week totals come from one SQL pass over `ib_daily`; ink bands from the same shared math the member sees.
- **Offline-first planner.** `sw.js` now caches the app shell: hashed `/assets/*` cache-first, navigations network-first with the last good copy as fallback (and `/planner/today` or `/` for never-visited pages); the API is never cached. Planner edits made offline sit in localStorage as before and `account-sync` now pushes them the moment the `online` event fires. The offline banner says so.
- **CI keeps the bar.** `scripts/e2e.mjs` runs axe-core (serious + critical) on every page it opens, in both roles, with `E2E_SCHEME=dark` for the dark palette; the page list grew to Home, Ink, Analytics, Live, Search and the member planner pages; the digest is checked to render for admins and 403 for members.
- Small: "Most watched" shows *Untitled class* instead of a raw lesson id.

### Third pass (2026-10-29) — Fading Ink, storylines, craft, a11y names

- **Fading Ink** (`/planner/ink`, nav "Ink", palette "Ink · what you're forgetting"). A board of every lesson you have studied, drawn as an ink stroke that fades as you forget it. Retention `R = exp(-t/S)`: `t` is days since you last touched the lesson, stability `S` is the spaced-review gap for its stage × rating × 1.25 (`shared/src/lib/planner/ink.ts`). Bands: **crisp ≥ 0.7**, **fading ≥ 0.35**, **ghost** below. Strokes are deterministic per lesson (`strokePath(inkSeed(id), …)`), so the board is stable between visits. A scrubber walks the board forward in time (Home/End, `E` jumps to the exam date; exam tick on the rail) to see what will have faded by then. Tap a stroke for the detail: when it fades, "re-ink" with shaky / ok / solid (writes a review task via `reinkLesson` and resets the stroke), and **"Watch the part you skipped · from m:ss"** — the first gap in your watch log (`firstGap`), deep-linked into the player at that second. Screen readers get the same data as an sr-only table; reduced motion drops the stroke animation. 10 property tests (fast-check) in `ink.test.ts`.
- **Admins see the same board.** `GET /api/admin/members/:id` → `planner.ink` + `planner.examDate` are computed on the server with the *same* shared `inkItems()` from the member's synced planner state, and Member detail embeds a read-only "Where Riya's ink is fading" — so the admin never sees a different answer than the member.
- **Activity as storylines, not a log.** `admin/storylines.tsx` groups a member's events into *sittings* (gap > 20 min starts a new one), collapses consecutive watch ticks, sums watch minutes, and shows a presence dot for anyone active in the last 5 minutes. Activity tab header reads "N online now"; the separate "Online now" card is gone (it was the thing overlapping the left column on narrow widths).
- **Continue really continues.** The home Continue card shows "Resume at 23:14" and passes `?t=` so the player starts there; a class barely started or nearly finished starts from the top.
- **Craft pass**: paper grain on the page (SVG turbulence at 4.5 % opacity; off under reduced-transparency and print), one motion vocabulary (`.enter` for arriving panels, `.stagger > *` for lists; both no-ops under reduced motion), ink-stroke empty states, tabular numerals everywhere numbers line up, admin tab panels arrive instead of popping.
- **Accessible names say what you see.** axe 4.14's `label-content-name-mismatch` flagged 36 controls whose `aria-label` did not contain their visible text (account menu, logo, search, calendar day cells, the day strip, every task row, the Continue card). Fixed at the kit level: avatar initials, subject marks and the logo glyph are painted with CSS (`.glyph::before { content: attr(data-glyph) }`) so decorative glyphs never leak into a parent control's name, and the controls use visible text + an sr-only prefix/suffix instead of a replacement label. Inline "Create one" link is underlined.
- **Demo data**: `node --experimental-strip-types scripts/seed-ink-demo.ts riya@inkboard.local <password>` seeds a realistic 3-course JEE plan (74 tasks, 28 reviewed lessons, exam 2026-12-06) through the real `/api/me/state` sync endpoint, so Ink and the admin view have something to show.

### Review pass (2026-10-28)

- **Saved-lecture jobs were readable by any member.** `GET /api/jobs/*` was open to every signed-in account and job ids were `sha256(lesson id + options)`, so a member who knew a lesson id could recompute the job id and pull `bundle.zip` (ink, slides, media) for a class that was never shared with them, with Downloads switched off. The guard now resolves the job's lesson and requires the same share access as `/api/lessons/:id`; artifacts and the bundle also need the Downloads switch; unknown jobs stay a plain 404. Job ids are HMAC-keyed by `JOB_DIR/.job-secret` (or `JOB_ID_SECRET`). Regression test: "a saved-lecture job is only reachable for a class shared with the member" in `backend/tests/auth/auth.test.ts`.
- **Responses are compressed** (`@fastify/compress`, brotli/gzip). The ink timeline for a 57-minute board class goes from 4.5 MB to ~1.0 MB on the wire. Zip bundles and range-served media carry `no-transform`; SSE is untouched.
- **Login lockout survives restarts.** The five-misses-per-account+IP / thirty-per-IP counters live in Redis when `REDIS_URL` is set (email hashed in the key, 15-minute expiry), with the in-memory map as fallback. Previously a `pm2 restart` cleared every lock.
- **Schema migrations.** `SCHEMA` stays the idempotent baseline; anything that changes an existing table is an entry in `MIGRATIONS` (`backend/src/auth/store/connection.ts`) that runs once, in order, in a transaction and is recorded in `ib_migrations`. First entry: an `(user_id, id desc)` index on `ib_activity`.
- **Course header says when there is nothing to play**: "No replays yet" / "3 without replay" next to the class count, instead of only a per-row badge after scrolling.

#### Second pass (deeper audit: interactive, dark mode, axe, keyboard, planner logic)

- **Accessibility, fixed at the token/kit level** rather than per page. Dark-mode `fg-muted` / `fg-faint` / `info` lifted to pass 4.5:1 on `bg-raised`; the `live` badge got its own foreground token; the "outside this month" calendar cells and empty seals use colour mix instead of `opacity`, so their text still passes contrast; `<main>` is focusable so the skip-link lands; the lantern drag handle is `aria-hidden`; `Tabs` only emit `aria-controls` when a matching panel id exists (`panels` prop); the analytics figures were a `<dl>` with nested `<dl>`s (now one per figure); heading order on Browse and course Live shelf no longer skips a level; the Live badge pulses only its dot and unavailable rows mute text instead of fading the row (both had dropped badge text under 4.5:1). Result: axe reports 0 serious/critical issues across 20 screens in dark mode.
- **Planner: "Fit to exam."** When the plan overshoots the exam date the wizard no longer just warns — it offers a one-click fix. `fitToExam()` (`shared/src/lib/planner/wizard.ts`) searches lectures/day × daily minutes (30-minute steps, up to 8 h) by regenerating the plan and picks the lightest setting that ends on or before the exam, shown as "Fit to exam · 3/day, 120 min".
- **Planner: nothing lands after the exam.** Spaced reviews (`revision.ts`) and the recap horizon (`scheduler.ts`) are clamped to `examDate`; a review that would fall after the exam is pulled forward or dropped. Previously a long plan could schedule reviews weeks after the exam day and report that as "over".
- **Planner: you cannot untick your last study day** (`toggleStudyDay`); the chip is `aria-disabled` with a hint.
- **Planner: same topic in two courses.** `overlappingTopics()` (`feasibility.ts`) lists topics that appear in more than one selected course; the wizard shows "Same topic, two courses" so you can drop one before generating.
- **Zero-states instead of empty charts**: `DayBars` renders role-specific copy ("No study yet this week" / "Nothing watched in the last 14 days") instead of an empty bar strip; the analytics page shows a short "once you log a session…" block when there are no sessions; the planner calendar has a legend for the exam / today / underlined-date marks.
- **"Forgot your password" goes to your admin.** Members have no email; `POST /api/auth/reset-request` (always 200, throttled like login) flags the account (`users.reset_requested_at`, migration `0002`). The admin overview shows a banner, the member list a "Asked for a reset" badge, and setting a new password clears it. Audited as `password.reset_requested`.
- **Safari / iOS: "Prepare for this device".** When native playback fails and no HLS copy exists, the player banner explains why and (for admins or members with Downloads) offers to prepare one, instead of a dead "can't play" message.
- **Admin audit names people.** `share.add` detail now lists the members/groups the share went to (`members: riya@…, arjun@…`), not just a count.
- **CSRF allow-list split from CORS.** `CSRF_TRUSTED_ORIGINS` (falls back to `CORS_ORIGINS`; `*` is ignored for CSRF) so a wide CORS setting for a read-only API client never widens cookie-authenticated writes.
- **Hindi UI is labelled "preview"** in Settings with a note on what it covers (navigation, planner, player; not catalogue text).

### Fixed in this pass

- **Teacher pages 404'd on a capital letter** (`/teacher/Surendramish-5026`): not case-sensitivity — a flaky profile fetch threw NOT_FOUND for a teacher with 317 courses. The backend now synthesises a fallback educator when courses exist, teacher URLs canonicalise to lowercase, and a failed background refetch no longer blanks a loaded page.
- **Seek bar**: a global `button[aria-label] { position: relative }` was beating `.seek-chapter { position: absolute }`, dropping the chapter ticks under the line; the bar also started 1.4 rem in. Ticks sit on the line, the playhead is visible, the bar runs edge to edge.
- **Search bar double icons**: native `type=search` decorations hidden under the kit's own.
- **Teacher camera ("lantern") resize**: visible grip on hover/focus/touch, drag to resize, click to cycle sizes, "Camera size" in the ⋯ menu.
- **Course header actions** (Favourite / Save the course / Download all notes) are kit buttons.
- **Download all notes** can now *save into a folder* (File System Access API): each PDF is written the moment it arrives — nothing waits for a giant zip. Zip stays as the fallback. `fetchNotesZip` gained an `onSaved` streaming sink.
- **Download for offline play** is a real button: the server prepares the bundle, then `GET /api/jobs/:id/bundle.zip` streams the saved folder as a STORE zip (`backend/src/lib/zip-store.ts`, verified with `unzip -t`). Drop it on `/offline` to play with no internet.

- **Every lecture job failed instantly** with `logger.info is not a function`: `runLecture` handed `saveLecture` a bare function where it expects `{ info, warn, error, progress, newline }`. Now `jobStepLogger` mirrors each line into the job's `step` and lifts download percentages into `pct`. Regression test in `backend/tests/jobs/job-step-logger.test.ts`.
- The `jobs/` rule in `.gitignore` matched `backend/tests/jobs/` too, so new tests there were silently untracked. Anchored to `/jobs/`.
- Added the `backend/.env.example` and `frontend/.env.example` the old README pointed at.
- Added a single-box runtime: `ecosystem.config.cjs` (PM2), `scripts/serve.mjs` (edge), `Dockerfile`, `docker-compose.yml`.

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

## Deploying behind Vercel and Render (original split)

The single-box setup above replaces this for an internal install, but the split still works and the proxy-trust rules below apply to any reverse proxy.

<!-- original section preserved verbatim below -->

The site on Vercel proxies `/api`, `/healthz`, and `/readyz` to the API on Render through `frontend/middleware.ts`. That file is the only proxy: it adds `x-inkboard-proxy-secret`. `vercel.json` does not rewrite those paths. It only sets response headers. The Vercel app is the TanStack Start server. Deep links such as `/play/…` and `/planner/today` are rendered by that server. Do not add a rewrite to `/index.html` — that rewrite served the shell for every path and is gone on purpose.

Set `INKBOARD_API_ORIGIN` on Vercel to the Render origin, including the scheme and no path (for example `https://your-service.onrender.com`). The middleware reads that variable only. If it is unset in production, `/api`, `/healthz`, and `/readyz` return 500 JSON. There is no hardcoded host. A path the middleware does not proxy is left alone so the TanStack server can render it.

Set these on the Render service:

- `TRUST_PROXY` is how many proxies to trust, counted from the right. It is not a boolean. `1` trusts one proxy: `req.ip` is the last `X-Forwarded-For` entry, and a forged entry to its left does not open a new rate-limit bucket. Leave it unset and the header is ignored, so `req.ip` stays the socket address.

  The Render origin is public. `TRUST_PROXY=2` by itself would let a direct caller forge `req.ip`. The API trusts a second hop only when the request has `x-inkboard-proxy-secret` and `crypto.timingSafeEqual` says it matches `INKBOARD_PROXY_SECRET`. When the hop count is above 1 and the secret is missing or wrong, the API deletes `X-Forwarded-For`. `req.ip` is the socket address. A forged entry is not used.

  Set the same `INKBOARD_PROXY_SECRET` on Vercel and on Render. `frontend/middleware.ts` proxies `/api`, `/healthz`, and `/readyz` and sets that header from the env var. A secret sent by the browser is replaced. When `INKBOARD_PROXY_SECRET` is set on Render, the API logs a one-time warning if an `/api` request arrives without the secret from a socket address that is not private.

  This table is the hop rule, not a capture from production:

  | Trust | `X-Forwarded-For` | Secret | `req.ip` |
  | --- | --- | --- | --- |
  | 1 | `203.0.113.10, 76.76.21.21` | either | `76.76.21.21` (the last entry) |
  | 2, secret matches | `203.0.113.10, 76.76.21.21` | matches | `203.0.113.10` |
  | 2, secret matches | `198.51.100.50, 203.0.113.10, 76.76.21.21` | matches | `203.0.113.10`. The forged left entry is ignored. |
  | 2 configured, secret missing or wrong | `198.51.100.50` | no | the socket address. The header is deleted. |
  | 2 configured, secret missing or wrong | `198.51.100.50, 203.0.113.10` | no | the socket address. Neither entry is used. |
  | unset | anything | either | the socket address |

  To see the chain this deploy actually produces, set `LOG_TRUST=1` on Render for one request. The API logs `req.ip` and `req.ips` once. Hit the site, then hit the Render URL directly, and compare those values with the table. `req.ips` runs from the socket toward the client. The last entry is `req.ip`. Turn `LOG_TRUST` off after that. Run that `LOG_TRUST` check once on the real deploy to confirm `frontend/middleware.ts` runs under the Nitro build. This repository does not verify that. Use `TRUST_PROXY=2` with the secret when Vercel sits in front of Render. Use `TRUST_PROXY=1` when the browser connects to Render directly. Do not set `true`: that trusts every entry, including a forged one. Fastify 5.12 fail-closes a numeric `trustProxy`, so the process applies the hop count itself.
- `RATE_LIMIT` and `RATE_WINDOW_MS`. The default window is 60 seconds. Each visitor has separate buckets. The bucket is chosen from the method and the path:
  - **catalog** — other `/api/*` routes. Cap is `RATE_LIMIT` (default 120) per window.
  - **media** — `/api/slide`, `/api/notes`, `/api/live-slide`, and `GET /api/jobs/:id/artifacts/*`. At least 600 per window.
  - **generous** — `/api/live-board`, `/api/study`, and `GET /api/jobs/:id` (the poll). At least 300 per window. `GET /api/live-board` then applies its own cap of 8 requests a minute. That inner cap is fixed.
  - **expensive** — `POST /api/jobs/lectures`, `POST /api/jobs/:id/clips`, and `DELETE /api/jobs/:id`. Capped at 30 per window, even when `RATE_LIMIT` is higher. A `GET` of the job or its artifacts is not in this bucket.
- `POST /api/study/summary` allows 6 requests per minute per visitor. That cap is fixed; it does not grow with `RATE_LIMIT`. It sits on top of the generous study bucket.
- `XAI_API_KEY` asks xAI for revision bullets. Without it, the summary is the board outline. `XAI_MODEL` selects the model. Leave it empty to use `grok-4.20-non-reasoning`. The current xAI model list documents that name as an alias of `grok-4.20-0309-non-reasoning` (non-reasoning chat). `grok-3-mini` is not in the API anymore.
- Catalog routes stop at 25 seconds and answer `UPSTREAM_TIMEOUT` instead of holding the socket open.

Ping `GET /healthz` every 5 to 10 minutes so a free Render instance does not sleep. The first class after a sleep can take a minute.
