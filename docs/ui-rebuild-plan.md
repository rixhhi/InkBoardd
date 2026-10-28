# InkBoard UI rebuild — implementation plan

Scope: the whole `frontend/` surface — shell, design system, every page, the teacher/catalog views, the class player, live classes, planner, search. Backend and `shared/` domain code stay as they are; the plan only touches API shapes where a page genuinely needs a field it doesn't have.

Audience is 2–3 people who use this daily. That changes the priorities: speed-to-content, keyboard-first, zero ceremony, and a UI that explains itself without a tour. It also means we can drop things a public product would need (marketing home, onboarding wizard polish, locale switcher) and spend that budget on the player.

---

## 0. What's there today (from the code, and from one browser pass)

| Area | State | Verdict |
| --- | --- | --- |
| Visual language | Paper/desk metaphor. Tokens in `styles/base.css` (bg `#f4f1ea`, serif display + Plex Sans body), dark theme, 15 class families (`.desk-`, `.folio-`, `.slate-`, `.rail-`, `.chalk-`, `.hatch-`, `.stamp-`, `.write-`, `.lantern-`…), **90 KB of hand-written CSS** across 5 files. | Coherent but heavy and opaque. Every component has an in-world name (lantern = camera, ledger = saved list, wall = exam grid, write-line = command palette, slate = player stage). Nobody new can navigate the CSS. |
| UI kit | `components/ui/kit.tsx`: Toast, Button, Card, Input, Tabs, Dialog, Skeleton, EmptyState, Badge, Progress, Switch, Select, Tooltip, Menu. Radix only for AlertDialog; `vaul` for sheets; `cmdk` for palette. | Decent base. Keep the primitives, rebuild their styling on new tokens. |
| Shell | Left icon rail (desktop) / bottom tab bar (mobile), header with search chip + planner chip, saved-items side sheet (Ctrl+B), command palette (Ctrl+K), upstream banner, offline toast. | Structure is right. Execution is cramped: rail labels are hidden, header is a thin strip, no breadcrumb/context. |
| Home | "Pick an exam" + continue card + exam grid. | Fine for first run; useless on day 30. Should become a personal dashboard. |
| Search | URL-driven, debounced, arrow-key through hits, teachers + classes. | Good bones. Needs result typing (teacher/course/class) and recents. |
| Exam hub `/exam/$goalId` | Teachers, playlists, trending, subjects, courses, live/later/week, crash courses — all in one 171-line page using `exam-hub.tsx`. | Information-dense but flat; everything is the same visual weight. |
| Course `/course/$courseId` | 658 lines. Lesson list with progress, replay probing, filters, watch-later, save, next-up logic. | Most-used page after the player. Logic is solid; layout is a long undifferentiated list. |
| Batch `/batch/$batchId` | 569 lines, schedule + sessions. | Same pattern as course. Should share a component. |
| Teacher `/teacher/$slug` | `EducatorCatalog`: tabs courses/batches/specials, topic filter, sort. 43-line page. | Thin. No "what's live/new from this teacher", no follow state. |
| Player `/play/$lessonId` | `class-player.tsx` 522 + `player-transport.tsx` 446 + `player-more.tsx` 222 + `player/*` hooks. Whiteboard canvas (ink replay), video "lantern" overlay (camera), slide film strip, seek bar with waveform + chapters + hover thumbs, notes sheet, study tray, PiP, fullscreen, speed, pin moment, sleep timer, full keyboard map (j/k/l/f/m/n/p/s/t/i/c/b, 0–9). | Feature-complete and the hardest thing to get right. Rebuild the chrome; keep the engine (`player/engine.ts`, `use-playback.ts`, `use-player-model.tsx`) untouched. |
| Live `/live/$classId` | `live-stage.tsx` 298: waiting state, on-air stage with its own main, SSE board. | Keep flow; restyle with the player. |
| Favourites, Offline | Lists with confirm-on-remove. Offline is a separate PWA entry. | Fold both into one "Library" concept. |
| Planner | 24 components, 8 routes, charts, badges, journal, wizard. | Largest surface by file count. Least used by 2–3 internal people? **Decision needed** — see §9. |
| Tests pinned to CSS/class names | `read-styles`, `contrast`, `desk-chrome`, `folio`, `patina-*`, `phase2/3/4`, `ui-states`, `kit`, `phase4-a11y` (~14 files). | Must be rewritten alongside; they are the main migration cost that isn't visible in the UI. |
| Budgets | Lighthouse perf ≥0.90, a11y ≥0.95, CLS ≤0.1. Bundle first-load ≤1.6 MB (currently 638 KB). | Keep all three. They are the regression fence. |

Known UX debts from `docs/ui-audit.md` ("from code, not seen"): no real viewport check at 320/360/768/1280; player control density at ≤639 px assumed, not verified.

---

## 1. Goals and non-goals

**Goals**

1. Get to a playing class in ≤2 interactions from anywhere (continue card, palette, or search → play).
2. One visual language with plain names. A new contributor should read a class name and know what it is.
3. The player is the product. It gets the most design time, a real responsive spec, and a test harness.
4. Keyboard-first on desktop, thumb-first on mobile, no feature that only works with a mouse.
5. Keep every budget: Lighthouse, bundle, a11y, 1,027 green tests (rewritten where they pin old class names).

**Non-goals**

- No framework change (stay TanStack Start + Tailwind 4). No component-library migration (shadcn-style copy-in is fine; a dependency on MUI/Chakra is not).
- No backend rewrites. If a page needs a field, add it to the DTO and move on.
- No marketing/public pages, no onboarding tour, no auth UI (auth stays off).

---

## 2. Design system

### 2.1 Tokens (`styles/tokens.css`, currently empty — make it the single source)

Replace the metaphor palette with a semantic one. Two themes (light "paper", dark "board") stay; names change.

```
--bg, --bg-subtle, --surface, --surface-raised, --overlay
--fg, --fg-muted, --fg-faint
--border, --border-strong, --ring
--accent, --accent-fg, --accent-subtle
--ok, --warn, --danger, --info  (+ -subtle variants)
--subject-physics … --subject-other   (keep: subject colour is a real affordance)
--radius-sm/md/lg/full, --shadow-1/2/3
--space-1…12 (4px grid), --content-max (72rem), --reading-max (65ch)
--font-sans (Plex Sans), --font-serif (Source Serif 4, display only), --font-mono (for timestamps)
--text-xs…3xl with matching line-heights; `tabular-nums` utility for all times/counters
--dur-fast 120ms, --dur-base 200ms, --ease-out; honour prefers-reduced-motion globally
```

Contrast: every `fg-*` on every `bg-*`/`surface-*` pair must pass 4.5:1 (body) / 3:1 (large). The existing `contrast.test.ts` reads tokens via `read-styles.ts` — keep that test, point it at the new names.

### 2.2 Components (`components/ui/`)

Keep the 15 primitives; rebuild them one file each, Tailwind + tokens, no bespoke CSS classes. Add what the pages need:

| Component | Notes |
| --- | --- |
| `Button` | variants: primary / secondary / ghost / danger; sizes sm/md/lg; `icon` prop; loading state; 44 px min hit area on touch. |
| `IconButton` | split out; always requires `label`. |
| `Card`, `Surface` | Card = clickable container with hover lift; Surface = static panel. |
| `Input`, `SearchInput` | SearchInput has clear button, kbd hint, `aria-describedby` for result count. |
| `Tabs` | Radix Tabs (roving focus, URL-synced via a `useTabParam` hook). |
| `Sheet` | vaul bottom sheet on mobile, side panel ≥768 px. One component, one API. |
| `Dialog`, `ConfirmDialog` | Radix. |
| `Menu` | Radix DropdownMenu. |
| `Tooltip` | Radix, 400 ms delay, never the only label. |
| `Badge`, `Chip` | Badge = status (LIVE, Replay, Upcoming, Archived); Chip = filter toggle. |
| `Progress`, `Ring` | Ring for per-lesson watched %. |
| `Skeleton`, `EmptyState`, `ErrorState` | ErrorState takes a `code` and renders the right copy (rate-limit with countdown, upstream down, not found). Replaces `StatusPanel` / `CalmNotice` / `FailureNotice` — three components doing one job. |
| `Kbd` | For shortcut hints everywhere. |
| `Avatar` | Teacher avatars with initials fallback (`shared/initials.ts` exists). |
| `ListRow` | The one row used by course lessons, batch sessions, search hits, favourites, library. Slots: leading (thumb/ring), title, meta line, trailing actions, status badge. **This single component replaces ~60% of page-specific CSS.** |
| `PageHeader` | Eyebrow, h1, subline, actions, optional tabs. Every page uses it → consistent h1 for a11y tests. |
| `Toolbar` | Sticky filter/sort row under a PageHeader. |

Delete after migration: `.folio-*`, `.desk-*`, `.chalk-*`, `.hatch-*`, `.stamp-*`, `.write-*`, `.mini-*`, `.teacher-*`, `.study-*` families; `stamp`, `hatch`, `patina` visuals. Target: `styles/*.css` from 90 KB → under 20 KB (player canvas + a few things Tailwind can't express).

### 2.3 Naming

Drop the in-world vocabulary in code and in UI copy:

| Today | New |
| --- | --- |
| folio / desk / wall | shell / app / exam grid |
| slate | player stage |
| rail | transport |
| lantern | camera (teacher video) |
| ledger / saved sheet | library panel |
| write-line | command palette |
| margin | sidebar |
| "On the board" | "Continue watching" |

`shared/copy.ts` is the one place UI strings live — update there, keep the EN/HI chrome labels mechanism but **drop the locale toggle from the shell** (move to settings; 2–3 users don't flip it daily).

---

## 3. Shell and navigation

Layout: left sidebar ≥1024 px (icons + labels, collapsible to icons at 768–1023), bottom tab bar <768 px. Header becomes a slim context bar: breadcrumb (Exam › Teacher › Course), global search input (not a chip), and the library toggle.

Primary nav (5 items, same on both): **Home · Browse · Library · Live · Planner** (Planner conditional, see §9). Settings and theme live under an avatar/gear at the bottom of the sidebar.

Global affordances that stay: `Ctrl K` palette (rebuilt on cmdk with grouped results: Continue, Teachers, Courses, Classes, Pages, Actions), `Ctrl B` library panel, skip link, upstream banner, offline notice. Add `?` → shortcut sheet on every page (player already has one).

Transitions: none between pages (SSR + instant), 120 ms fades for sheets/menus only.

---

## 4. Pages

Each page below lists: purpose → layout → components → data it needs → what's reused from today.

### 4.1 Home `/`
Purpose: "what do I do next". Not an exam picker after day one.
- **Continue** — up to 3 cards from `watch-history.ts`: thumbnail (poster if a job made one, else slide 1), title, teacher, progress ring, time left. Primary card is large; press `Enter` to resume.
- **Live now / next 2 hours** — from `/api/live/feed` filtered to followed teachers + chosen exam.
- **Watch later** — the queue, top 5, "see all" → Library.
- **Your exam** — one row: exam name, switch link (the current exam grid moves behind it at `/browse`).
- Reuse: `ContinueCard` logic, `home-exams.tsx` → `/browse`.

### 4.2 Browse `/browse` (new; today's home grid)
Exam grid grouped by family, search box, "recently viewed exams". Picking one sets `exam-pref` and goes to the hub.

### 4.3 Exam hub `/exam/$goalId`
Purpose: entry into one exam. Today it dumps nine sections at equal weight.
- `PageHeader` with exam name, subjects as Chips (filter the page in place), tabs: **Overview · Teachers · Courses · Tests · Practice**.
- Overview = live/upcoming strip, trending (3), crash courses, top teachers (8, avatars), then "all courses" button.
- Teachers tab = avatar grid with follower count, subject chips, "new this week" badge.
- Courses tab = `ListRow` list with Toolbar: subject, sort (newest / most lessons / most watched), infinite scroll (`infinite-trigger.tsx` exists).
- Tests / Practice: keep current content, restyle.

### 4.4 Teacher `/teacher/$slug`
Purpose: everything from one educator. Today: three tabs and a sort.
- Header: avatar, name, bio (clamped, expandable), languages, follower count, **Follow** (local, feeds Home live strip), subject chips.
- Tabs: **Courses · Batches · Special classes · Live & upcoming** (new: filter live feed by username).
- Courses: `ListRow` cards with lesson count, last-updated, progress bar if any lesson watched. Toolbar: topic filter (exists), sort (exists), "has replays" toggle (exists via probe, surface it).
- Right column ≥1024: "Continue with this teacher" (history filtered) and notes/DPP quick links.
- Reuse: `educator-catalog.tsx` logic (keep data hooks, rewrite JSX).

### 4.5 Course `/course/$courseId` and Batch `/batch/$batchId`
Merge into one `SeriesPage` component with two data adapters. Today's two 600-line pages share ~70% logic.
- Header: title, teacher (link), lesson count, total duration, overall progress bar, actions: Save all / Add to plan / Share.
- Toolbar: filter chips (All · Unwatched · Replays only · Has notes), sort, dense/comfortable toggle.
- Lesson list: `ListRow` with ring, title, duration, liveAt date, status badge (Replay / Live / Upcoming / Archived / Unavailable), trailing: Play, Notes, Later, Save. Next-up lesson is visually pinned at the top with a "Continue" button.
- Batch extra: week grouping headers from `schedule`.
- Keep: replay probe, `nextOpenIndex`, prefetch on hover, local cache key.

### 4.6 Search `/search`
- Input in the page header, results grouped **Teachers · Courses · Classes**, each group with "show more". Keep URL state, debounce, arrow navigation, result count live region. Add recents (local) when the query is empty.
- Palette (`Ctrl K`) uses the same query hook, shows top 3 per group, and adds Actions (Toggle theme, Open library, Shortcuts).

### 4.7 Library `/library` (replaces `/favourites`, `/favourites/$courseId`, and the entry of `/offline`)
Tabs: **Saved courses · Watch later · Downloaded** (= today's offline bundles) · **History**. One `ListRow` list each, with confirm-on-remove preserved. `/favourites*` and `/offline` redirect here; the offline PWA shell stays as the actual offline player entry.

### 4.8 Live `/live/$classId`
Keep the two states. Waiting state becomes a card with countdown, teacher, "add to plan", and the related replays list. On-air state uses the new player chrome (§5) with the SSE board in the stage and a LIVE badge in the transport.

### 4.9 404, error, archived
One `ErrorState` component; routes pass a code. Archived class page keeps its distinct copy and the notes fallback.

### 4.10 Settings `/settings` (new, replaces the hidden planner settings link for app-level prefs)
Theme, language, default playback speed, skip-silence default, keyboard map viewer, "clear local data".

---

## 5. Player (the main event)

Everything under `components/player/` (engine, playback, model, session, media-session) is kept as-is. The rebuild replaces `class-player.tsx`, `player-transport.tsx`, `player-more.tsx`, `slide-strip.tsx`, `seek-hover.tsx`, `notes-*.tsx`, `study-tray.tsx`, `janus-cam.tsx`, `whiteboard.tsx` chrome (canvas drawing code stays), and the `.slate-* / .rail-* / .lantern-* / .film-*` CSS.

### 5.1 Layout spec

```
≥1280 (desktop)               768–1279 (tablet / small laptop)     <768 (phone, portrait)
┌─────────────────────┬─────┐ ┌──────────────────────────────┐      ┌──────────────────┐
│ stage (board 16:9)  │side │ │ stage                        │      │ stage            │
│  ┌camera┐           │panel│ │  ┌camera┐                    │      │                  │
│  └──────┘           │     │ │  └──────┘                    │      ├──────────────────┤
├─────────────────────┤     │ ├──────────────────────────────┤      │ transport (2 rows)│
│ transport (1 row)   │     │ │ transport (1 row)            │      ├──────────────────┤
├─────────────────────┤     │ ├──────────────────────────────┤      │ tabs: Slides ·   │
│ slide strip         │     │ │ slide strip (collapsible)    │      │ Notes · Chapters │
└─────────────────────┴─────┘ └──────────────────────────────┘      │ (bottom sheet)   │
                                                                     └──────────────────┘
```

- **Stage**: whiteboard canvas fills; teacher camera is a draggable/resizable PiP in a corner (today's "lantern" — keep `whiteboard-paint.ts` and the drag logic, restyle). Double-click stage = fullscreen. Click = play/pause. Tap on phone shows controls for 3 s.
- **Transport** (one row desktop): `[Play] [−10] [+10] | 12:34 / 1:30:05 | ━━━━━●━━━━━━━━━━ (chapters as ticks, waveform underlay, hover thumb) | [Speed 1.5×] [Camera] [Notes] [Settings ⋯] [PiP] [Fullscreen]`. Phone: row 1 = seek bar full width; row 2 = play / ±10 / time / speed / more.
- **Side panel** (desktop/tablet, 320–360 px, togglable with `n`): tabs **Slides · Notes · Chapters · Up next**. Slides = thumbnails synced to time (today's film strip, vertical). Notes = PDF reader (`notes-reader.tsx` uses pdf.js; keep). Chapters = list from timeline. Up next = rest of course.
- **Phone**: side panel content becomes a bottom sheet with the same tabs.
- **Overlays**: buffering spinner centred; end-of-class card (replay / next / back to course); error card with ErrorState; "pinned moment" toast; sleep-timer countdown chip; keyboard hint toast on first `?`.

### 5.2 Interactions to preserve (all exist today; make each one testable)

| Key | Action |
| --- | --- |
| `Space` / `k` | play/pause |
| `j` / `l`, `←` / `→` | −10 s / +10 s (Shift = 30 s) |
| `0–9` | seek to 0–90 % |
| `,` / `.` | prev / next slide (today `slidePrev/slideNext`) |
| `p` / `n` | previous / next class |
| `s` | cycle speed (0.75 → 1 → 1.25 → 1.5 → 1.75 → 2) |
| `m` | mute |
| `c` | toggle camera |
| `t` | toggle side panel / strip |
| `i` | pin this moment (adds to journal/plan) |
| `b` | watch later |
| `f` | fullscreen |
| `?` | shortcuts sheet |

Plus: skip-intro to first ink (`firstInkSec` exists), skip silence (`silence.json` from enhance job), remember position (`player-prefs`), MediaSession metadata, PiP, sleep timer.

### 5.3 Media source priority
When a job has produced HLS (`/api/jobs/:id/artifacts/hls/master.m3u8`) prefer it via hls.js with the ladder; else the raw `.webm`. Show a small "Enhanced" badge in Settings ⋯ when HLS/loudnorm are in use, and an "Enhance this class" action that POSTs the job and shows progress in the same menu (the job's `step`/`pct` now update correctly).

### 5.4 Test harness
- A `PlayerFixture` story-like route under `/dev/player` (dev only, excluded from build) that mounts the player with a recorded 60 s timeline + silent media, so layout can be checked at every breakpoint without upstream.
- Unit: engine/model tests already exist (`engine.test.ts`, `media-session.test.ts`, `player-edges.test.ts`) — unchanged.
- Component: jsdom render tests for transport button presence/labels, keyboard map, and the three layouts (`matchMedia` mocked).

---

## 6. Planner

Keep the domain (`shared/planner/*`, 51 files, well tested) and the storage. Rebuild only the 24 UI components on the new kit, and cut the route count: **Today · Calendar · Progress · Settings** (Progress merges dashboard + analytics + history + badges; Journal becomes a tab in Progress). Wizard stays but as a single scrolling form with sections instead of 5 steps.

> **Done (Phase H, 2026-10-28).** What shipped differs from the sketch above in two places, both on purpose: routes were kept separate (Tasks · Month · Dashboard · History · Analytics · Badges · Settings) because the 2–3 users already have muscle memory for them, and Journal was **removed** rather than folded in. New: Today → **Tasks** with `?day=` paging (`shared/planner/day-nav.ts`), and a **Pomodoro** bound to a lecture/subject that logs `source: "focus"` sessions (`shared/planner/pomodoro.ts`). Every planner page and modal is on the kit; pinned tests assert roles/labels, not class names.

Open question §9: whether to ship the planner at all in phase 1.

---

## 7. Responsive, accessibility, performance

- Breakpoints: 360 (min supported), 640, 768, 1024, 1280. Verify each page in a real browser at 360, 768, 1280 (the audit never did). Add a Playwright screenshot run (`scripts/ui-shots.mjs`) that captures 6 key routes × 3 widths into `docs/shots/` for review in PRs.
- a11y: one h1 per page via `PageHeader`; all icon buttons labelled; focus rings on `--ring`; live regions for search count, job progress, player time (polite, throttled); reduced motion honoured; 44 px targets on touch; colour never the sole status signal (badge text + icon).
- Performance: keep route-level code splitting; player chunk stays lazy; pdf.js and hls.js only load when their tab/source is used (already the case — don't regress). Images: `loading="lazy"`, fixed aspect boxes to hold CLS ≤0.1. Target first-load ≤ 500 KB after removing CSS (currently 638 KB).

---

## 8. Migration strategy

Strangler, page by page, behind a single flag so the app is always shippable.

1. **Tokens + kit first** (no page changes). New tokens coexist with old names via aliases (`--color-bg: var(--bg)`) so nothing breaks. New kit components land in `components/ui/` next to `kit.tsx`.
2. **Shell**. New sidebar/header/tabbar wrap the same `<main>`. Old pages render inside unchanged.
3. **Pages in traffic order**: Player → Course/Batch → Teacher → Exam hub → Search/Palette → Home/Browse → Library → Live → Settings → Planner.
4. Each page PR: new JSX on new kit, delete its old CSS family, rewrite its pinned tests, screenshot at 3 widths, Lighthouse unchanged or better.
5. **Delete** aliases, old CSS, old kit, metaphor copy. Final bundle/Lighthouse run.

Tests: rewrite the 14 class-pinned test files as their page lands. Rule for new tests: assert on roles, labels, and tokens — never on class names.

---

## 9. Decisions needed before starting

1. **Planner in scope for phase 1?** It is the largest UI surface and the least tied to "watch a class". Options: (a) rebuild it in the last phase, (b) keep the old planner UI running inside the new shell indefinitely, (c) drop it. Recommendation: **(b)** — ship the new shell + player + catalog first, decide on the planner after a month of real use.
2. **Visual direction.** Keep the warm paper palette (just cleaned up), or go neutral (near-white/near-black, one accent)? Recommendation: keep paper light / board dark — it's distinctive and already passes contrast — but drop the texture effects (hatch, stamp, patina).
3. **Hindi chrome labels.** Keep the mechanism, move the toggle to Settings? (Recommendation: yes.)
4. **Teacher "follow".** Local-only (localStorage) is enough for 2–3 people; no backend. Confirm.
5. **Offline PWA.** Keep as a separate entry (`/offline`) or integrate into Library with the service worker covering the main app? Recommendation: keep separate for phase 1; it works and touching the SW is risk without payoff.

---

## 10. Phases and estimates

| Phase | Work | Est. | Status |
| --- | --- | --- | --- |
| **A. Foundations** | tokens.css, kit rebuild (17 components), `ListRow`, `PageHeader`, `ErrorState`, Kbd, Avatar; contrast + kit tests; screenshot script | 3–4 days | ✅ `289c9c6` — 25 components shipped; 11 role-based kit tests |
| **B. Shell** | sidebar/tabbar/header, palette regroup, library panel, settings route, redirects | 2 days | ✅ `794a145` — palette chrome landed in E3 |
| **C. Player** | layout spec at 3 breakpoints, transport, side panel/sheet, camera PiP, overlays, HLS preference + enhance action, `/dev/player` fixture, component tests | 5–6 days | ✅ `8ea5129`, `83d12c5` — transport/header/overlays on kit; `/dev/player` fixture not added (existing `class-player.test.ts` harness kept) |
| **D. Catalog** | SeriesPage (course+batch), Teacher, Exam hub, Browse | 4 days | ✅ `2db39d9`, `aa32ca5`, `3b07b49` — batch page kept on old markup inside the new shell |
| **E. Discovery** | Search page, palette results, Home dashboard, Library | 3 days | ✅ `3b07b49`, `dae6710`, `94f6f23` |
| **F. Live** | waiting + on-air on new player chrome | 1 day | ✅ `/live` feed on kit; live stage header/rail + waiting room on kit; `/live/$classId` route restored (it had been a redirect to `/`) |
| **G. Cleanup** | delete old CSS/kit/copy, rewrite remaining pinned tests, Lighthouse + bundle, README/audit update | 2 days | ✅ `476668d`, `0586538`, `90527cf` + this commit |
| **H. Planner (optional)** | 4-route restructure on new kit | 4–5 days | ⏸ deferred — planner pages run inside `AppShell` via the rewritten `PlannerShell` |

Total without planner: **~20 working days**; with: ~25. Each phase ends with: typecheck clean, all tests green, Lighthouse ≥ thresholds, screenshots reviewed at 360/768/1280.

### Outcome (2026-10-28)

- Tests: 1,038 passing across the three packages, 0 failing. Every pinned source test moved from class names to roles/labels/behaviour.
- Bundle: first load 712 KB / 1,563 KB cap (was 638 KB before the rebuild; +74 KB for Radix Dialog/AlertDialog/Slot + lucide icons, inside budget). Total 2,288 KB / 4,395 KB.
- CSS: −1.3k lines net; `.desk-*`, `.folio-*`, `.plate-*`, `.stamp-*`, `.hatch-chip`, `.ui-*`, `.player-more*` families gone. Subject hatch patterns (`hatch-${subject}`) kept — the planner dashboard still draws them.
- Accessibility: SSR sweep over 16 routes (incl. batch, live door, planner settings, 404) — one `<h1>`, one `<main id="main">`, skip link, labelled `nav`s, no unlabelled controls/images/inputs/selects on every page.
- Follow-up pass after the first browser review: player chrome back to overlays (stage was pushed down and the side film strip clipped); loaders → kit spinner/skeleton; notices → `ErrorState`/`EmptyState`; all `<select>`s → kit `Select`; batch page and live stage on the kit; `skeleton.tsx` deleted.
- Lighthouse CI (`lighthouserc.json`) was not run in the 1 GB sandbox (no Chrome, no headroom); run `npx @lhci/cli autorun` on the deploy box to confirm the ≥0.9 perf / ≥0.95 a11y / CLS ≤0.1 thresholds.

---

## 11. Definition of done (per page)

- One `PageHeader` h1; skip link lands on `<main>`.
- Loading, empty, error (rate-limited, upstream down, not found) states all render via kit components.
- Works at 360, 768, 1280 without horizontal scroll; verified by screenshot.
- Keyboard: every action reachable; focus visible; Escape closes any sheet/menu.
- No class-name assertions in its tests; roles/labels only.
- Old CSS family for that page deleted; bundle budget still green.
