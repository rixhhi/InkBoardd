> **Superseded (2026-11-01).** This was a from-code audit written before a browser was available. The CI `e2e` job (`scripts/e2e.mjs`) now measures every page in a real Chromium — overflow, axe, both themes, both roles, desktop and phone — and Lighthouse runs against the same stack. Kept for history.

# UI audit

Every row is **from code, not seen**. No browser ran in this environment, so widths (320, 360, 768, 1280, 1920) were not measured on a real layout. Horizontal scroll is constrained in CSS (`overflow-x: clip` on `html`/`body`, planner sub-nav scrolls inside itself) but that is not a pixel check.

| Route | Problem | Severity | Phase |
|---|---|---|---|
| / | Loading the exam grid had no reserved block besides a skeleton; continue card reserves height. One h1. | low | 4 — skeleton kept |
| / | Search field and exam list share the shell; skip link and `#main` come from the shell. | — | 2 |
| /search | Query lives in the URL, input is debounced, clear button and result count exist. Empty and error shelves sit under the page h1. | — | 4 |
| /search | Keyboard: Enter submits. ArrowDown and ArrowUp move through `[data-search-hit]` and back to the field. | low | 4 — `searchHitTarget` |
| /exam/$goalId | Missing exam and hard errors used a paragraph, not an h1. Rate-limit on a failed load had no countdown. | high | 3 — `StatusPanel` / `CalmNotice` |
| /exam/$goalId | Partial refresh still shows an inline retry, not a full-page takeover. | — | 3 |
| /course/$courseId | Error return was a broken ternary (page would not typecheck). Error shelf was not an h1. | high | 3 |
| /course/$courseId | Filtered empty list is a shelf under the course h1. Loading uses a page-level `Fetching` heading. | — | 3 |
| /batch/$batchId | Error body printed `error.message` (can leak a path). Empty error shelf was not an h1. | high | 3 |
| /teacher/$slug | Same leak, and a rate-limit looked like a hard failure. | high | 3 |
| /play/$lessonId | Chunk fallback had no `main` or skip link. Player itself has both, plus buffering copy. | high | 2 |
| /play/$lessonId | Controls are `rail-btn` (44px). At 639px and under, the film docks above the rail and `layoutSlate` keeps the board above that band. Notes open as a bottom sheet. Not seen in a browser. | medium | 4 — from code, not seen |
| /live/$classId | Waiting state has one h1 inside the reduced shell. On-air stage has its own `main` and skip link. | — | 2 |
| /live/$classId | Error body used the raw message. | high | 3 |
| /favourites | Empty state had no way onward except prose. Remove had no confirm. | medium | 4 |
| /favourites/$courseId | Page h1 is the course title. Class list fetch is compact under that h1. | — | 2 |
| /offline | Remove dropped a save with no confirm. Library empty state explains how to add a folder. Chunk fallback had no landmark. | medium | 2, 4 |
| /planner and children | Sub-nav is a horizontal scroller with 44px links and `aria-current`. Charts have a text table and a dashed goal line. | — | 2, 4 |
| /planner (chunk) | Suspense fallback was a spinner with no `main`. | high | 2 |
| 404 | `StatusPanel` heading 1, link home. Distinct from the archived-class page. | — | 3 |
| Archived class | Own h1 and notes fallback. Not the 404. | — | 3 |
| All data pages | Production error sheet hid stacks; widget boundaries stay inline. Verified by unit render, not in a browser. | — | 3 |
| Shell | `Toast` was rendered while offline without an import (type error once the course page parsed). | high | 2 |
| Tokens | Split CSS is read back through `read-styles.ts`. Contrast tests cover text pairs. Not remeasured in a browser. | — | 1 |

Left, in order: Lighthouse and real viewport overflow (no Chrome here). Player and search layout were checked from the layout math and CSS, not in a browser.
