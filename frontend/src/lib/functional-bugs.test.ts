import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { usernameFromQuery, usernameIfNoHits } from "@inkboard/shared/search-query";
import { boardRoom } from "@inkboard/shared/folio";
import { msUntilNextLocalMidnight, todayKey } from "@inkboard/shared/planner/dates";
import { calendarDate } from "@inkboard/shared/planner/dates";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("phase 2 — functional bugs", () => {
  it("does not treat a subject word as an Unacademy username", () => {
    assert.equal(usernameFromQuery("physics"), "");
    assert.equal(usernameFromQuery("maths"), "");
    assert.equal(usernameFromQuery("@agsir"), "agsir");
    assert.equal(usernameIfNoHits("physics", 4), "");
    assert.equal(usernameIfNoHits("agsir", 0), "agsir");
    const search = src("../pages/search-page.tsx");
    assert.match(search, /usernameFromQuery/);
    assert.match(search, /usernameIfNoHits/);
    assert.doesNotMatch(search, /isUsernameQuery/);
    assert.doesNotMatch(search, /openCommandPalette/);
    assert.match(search, /onKeyDown/);
    assert.match(search, /pushRecent/);
  });

  it("arms a local-midnight rollover and the planner hook uses it", () => {
    const justBefore = new Date(2026, 2, 8, 23, 59, 50);
    const wait = msUntilNextLocalMidnight(justBefore);
    assert.ok(wait >= 10_000 && wait <= 12_000);
    assert.equal(todayKey(new Date(2026, 2, 8, 0, 15, 0)), "2026-03-08");
    const hook = src("../../../shared/src/lib/planner/use-today-key.ts");
    const planner = src("../../../shared/src/lib/planner/use-planner.ts");
    const today = src("../components/planner/today-page.tsx");
    assert.match(hook, /visibilitychange/);
    assert.match(hook, /msUntilNextLocalMidnight/);
    assert.match(planner, /useTodayKey/);
    assert.match(planner, /todaysTasks\(state, date\)/);
    assert.doesNotMatch(today, /maybeNotify/);
    assert.match(today, /readSessionSummary\(\)/);
  });

  it("pg calendar dates stay on the local day in IST", () => {
    const istMidnight = new Date(2026, 2, 8, 0, 0, 0);
    assert.equal(calendarDate(istMidnight), "2026-03-08");
    assert.equal(calendarDate("2026-03-08"), "2026-03-08");
  });

  it("player remounts per lesson, ends, retries, and probes webm", () => {
    const play = src("../pages/play-page.tsx");
    const player = [
      "../components/class-player.tsx",
      "../components/player/use-playback.ts",
      "../components/player/use-class-core.ts",
      "../components/player/use-player-session.ts",
    ].map(src).join("\n");
    assert.match(play, /key=\{lessonId\}/);
    assert.match(player, /onEnded/);
    assert.match(player, /completeLessonInPlan/);
    assert.match(player, /setEnded\(true\)/);
    assert.match(player, /COPY\.nextClass/);
    assert.match(player, /retryClass/);
    assert.match(player, /canPlayType\("video\/webm"\)/);
    assert.match(player, /tapTimer/);
    assert.match(player, /250/);
    assert.match(player, /document\.hidden/);
    assert.match(player, /onWinResize/);
    assert.match(player, /resolvedNotes/);
    assert.match(player, /toggleLater/);
    assert.match(player, /<Link\s+to=\{backTo/);
  });

  it("live recovers HLS, starts muted, and keeps onFatal off the effect deps", () => {
    const live = src("../components/live-video.tsx");
    assert.match(live, /recoverMediaError/);
    assert.match(live, /startLoad/);
    assert.match(live, /fatalRef/);
    assert.match(live, /video\.muted = true/);
    assert.match(live, /COPY\.soundOn/);
    assert.match(live, /requestFullscreen/);
    assert.match(live, /\[src, retry\]/);
  });

  it("shell has one main landmark, typing-safe ⌘B, bootstrap fold, and a real 404", () => {
    const shell = src("../components/shell/app-shell.tsx");
    const root = src("../routes/__root.tsx");
    const miss = src("../routes/$.tsx");
    const shortcuts = src("../components/planner/shortcuts.tsx");
    assert.equal(boardRoom("/planner/dashboard"), "instrument");
    assert.equal(boardRoom("/planner/analytics"), "instrument");
    assert.match(shell, /<main id="main"/);
    assert.match(shell, /isTypingTarget/);
    assert.match(shell, /key\.toLowerCase\(\) === "b"/);
    assert.match(root, /viewport-fit=cover/);
    assert.match(root, /FOLIO_BOOTSTRAP/);
    assert.match(miss, /throw notFound\(\)/);
    assert.match(shortcuts, /AlertDialog/);
    assert.match(src("../../../shared/src/lib/folio.ts"), /tag === "INPUT"/);
  });
});
