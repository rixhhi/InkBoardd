# Changelog

## 2026-11-01 — lint to zero, real semantics where ARIA was faking them

### Changed
- **Accessibility pass** (`biome lint` 341 → 0 across three PRs, no rule disabled). 16 chip rows and filter bars were `<div role="group">` → `<fieldset>`/`<legend>`; the add-task kind picker is real radios; the live-video picture is a real play/pause `<button>`; the mark-done sheet uses the shared Radix `Dialog` (focus trap, Escape, scrim) instead of a hand-rolled backdrop; menu separators are `<hr>`; decorative SVGs and pointer-only drag surfaces are `aria-hidden`. Every remaining `biome-ignore` names its reason and, for pointer shortcuts, the accessible alternative.
- Hook dependency warnings resolved per site (stable setters, refs, derived values) rather than suppressed; dead code removed (unused `VideoLayout`, `onKeepClass`, `dragRef`, `clipNote`, stray locals).
- `SkeletonRows` helper for placeholder loops; chart bars/points key on their x coordinate.

### Fixed
- Ink page kept its title and `?` behind the "make a plan first" early return, so a new member had no way to open help — and the e2e help-sheet spec had been red on `main` since it landed.
- Player: camera drag/resize works in both layouts; right-click no longer starts a drag; browser PiP shows a "Floating" placeholder instead of a black second lantern; chapter ticks have a tap target and name themselves on hover.

## 2026-11-01 — review pass: security, the bell, scale, docs

### Added
- **In-app notifications** — a bell in the header (`components/notifications-bell.tsx`, `ib_notifications`, migration `0003`). Members: new share, admin set a password, first-sign-in welcome. Admins: reset requested, member's first sign-in. Polls every 60 s and on focus; 60-day sweep; 200-row cap per person; 10-minute dedupe. 12 tests.
- `LICENSE` (source-available, personal use, third-party content disclaimer).
- `.github/dependabot.yml` (grouped weekly) and `.github/workflows/keepalive.yml` (pings the API so a free Render instance never sleeps).
- `PG_POOL_MAX` for the accounts pool.

### Changed
- **Rate limits are per session** for signed-in traffic (hash of the cookie), per IP only for sign-in/setup/reset. Students on one Wi-Fi no longer share a bucket.
- **Service worker** no longer `skipWaiting()`s under the page; an "Inkboard has an update — Reload" toast asks first.
- `account-sync` batches by UTF-8 bytes (1.2 MB) and `PUT /api/me/state` accepts 2 MB; a Hindi-heavy batch could previously exceed the 1 MB body cap and 413 silently.
- Lighthouse CI runs in the `e2e` job against the real stack (it was auditing a `vite preview` with no API — an error page).
- README restructured: quick start → what's inside → architecture → accounts → run → config → API → deploy. Pass-by-pass history moved here.

### Fixed
- `pdfjs-dist` 5.7 → 6.4 (GHSA-hq66-cqwq-w95j, arbitrary JS on a malicious PDF). `npm audit`: 0.
- Site sends a Content-Security-Policy, HSTS preload, COOP; `/assets/*` immutable; `sw.js` no-cache.
- `apple-touch-icon` is the 192 px PNG (iOS ignores SVG); `og:image` is absolute.
- Account menu → Admin uses router navigation, not a full reload.
- Login reset hint is inline text, not a `title=` tooltip.

### Tests
- shared 76, backend 731 (+12 notifications), frontend 302.

## 2026-10-29 — help: a "?" on everything hard, and a Guide

### Added
- `shared/help.ts`: 19-topic help deck (what / how / why / tips / math / FAQ / see-also). 5 tests.
- `HelpButton` / `HelpBody`: "?" icon button → Sheet with the topic; in-sheet see-also; link to the Guide.
- `/planner/guide`: all topics in reading order, sticky TOC, `#anchors`; nav entry and palette row.
- "?" placed on Ink, date slider, re-ink planner, Tasks, week strip, Focus timer, Month, Pace, Coverage, Instruments, Seals, revision intervals, offline banner, admin digest, storylines, member ink.
- e2e: opens a "?" sheet and checks structure + axe.

### Changed
- `InlineAlert.title` accepts a ReactNode.

## 2026-10-29 — the planner closes its own loop

### Added
- **Ink → Tasks**: `planReinks()` / `scheduleReinks()` and the *Put the fading ones on the calendar* card on `/planner/ink` — deadline (week / fortnight / exam) × count (3 / 5 / 8), per-day preview, one-tap add as revision tasks, Undo.
- **Calibration loop**: per-lesson `calibration` multiplier (0.5–2) learned from ratings vs the model's prediction; applied in `stabilityFor()` on both member and admin sides. Old states load as 1.
- **Admin weekly digest**: `GET /api/admin/digest` + *This week* section on Overview (minutes vs last week, active days, lessons, streak, ink bands, nudge). `weekDigest()`, `streakFrom()`, `inkBandsForAll()`.
- **Offline-first**: service worker caches the app shell (assets cache-first, pages network-first with fallback); `account-sync` flushes on `online`.
- **CI**: `scripts/e2e.mjs` asserts axe-core 0 serious/critical on every page, supports `E2E_SCHEME=dark`, covers more pages and the member matrix.

### Fixed
- `scheduleReinks` no longer pushes an undo snapshot when nothing was added (Undo would otherwise restore the tasks it was meant to remove).
- Admin "Most watched" showed a raw lesson id when the label was empty.

### Tests
- shared 71 (+8: calibration, planReinks properties, bridge storage), backend 719 (+4 streak), frontend 301 (+2 digest copy). e2e: 35 checks × {desktop dark, phone light} green.

## 2026-10-29 — Fading Ink, storylines, craft, accessible names

### Added
- **Fading Ink** (`/planner/ink`): every studied lesson as an ink stroke that fades with forgetting (`R = exp(-t/S)`, `S` = spaced-review gap × 1.25; bands crisp ≥ 0.7 / fading ≥ 0.35 / ghost). Time scrubber (Home/End/`E` = exam), per-subject rows, detail panel with shaky/ok/solid "re-ink" (`reinkLesson` writes a review task) and "Watch the part you skipped · from m:ss" (first gap in the watch log, deep-linked to the player). sr-only data table; reduced-motion safe. `shared/src/lib/planner/ink.ts` + 10 property tests.
- Admin Member detail embeds the member's ink board; `planner.ink` and `planner.examDate` are computed server-side with the shared `inkItems()` so admin and member always agree.
- Admin Activity → **storylines**: events grouped into sittings (20-minute gap), watch ticks collapsed, minutes summed, presence dot; header shows "N online now". `frontend/src/components/admin/storylines.tsx` + 3 tests.
- Home Continue card resumes at the saved second ("Resume at 23:14", `?t=`).
- Command palette: "Ink · what you're forgetting"; `/planner/ink` mapped in the planner room map.
- `scripts/seed-ink-demo.ts` seeds a realistic 3-course plan via the real sync API.
- Craft: paper grain, `.enter` / `.stagger` motion vocabulary, ink-stroke empty states, tabular numerals, animated admin tab arrival.

### Fixed
- **Accessible names now contain the visible text** (axe `label-content-name-mismatch`, 36 controls): account menu, logo links, search button, calendar day cells, today day-strip, task rows, Continue card. Avatar initials, subject marks and the logo glyph are drawn via `.glyph::before { content: attr(data-glyph) }` so they never leak into a parent control's name. "Create one" inline link underlined (`link-in-text-block`).
- sr-only chart tables are wrapped in a `div.sr-only` instead of being classed directly — a classed `<table class="sr-only">` still widened the phone layout.
- Admin "Online now" card removed (it was the element overlapping the Activity column at ≤ 1180 px); the information moved into the Activity header and storyline presence dots.

### Tests
- shared 63, backend 708, frontend 299 — all passing. Browser matrix: 26 screens × 4 widths × light/dark × admin/member — 0 overflow, 0 page errors, axe 0 serious/critical.

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

---

## Earlier passes (moved from the README on 2026-11-01)

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
