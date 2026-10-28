import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BANNED_CHROME, COPY, COPY_MAP, boardOnCopy, coursesCopy, sealEarnedCopy, streakDaysCopy } from "@inkboard/shared/copy";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === "auth" || name === "app-data") continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, acc);
    else if (/\.(tsx|ts)$/.test(name) && !name.endsWith(".test.ts")) acc.push(path);
  }
  return acc;
}

describe("Kalam copy deck", () => {
  it("locks the chrome map", () => {
    assert.equal(COPY.write, "Search");
    assert.equal(COPY.writeWhere, "Search classes and teachers");
    assert.equal(COPY.startBoard, "Start class");
    assert.equal(COPY.onTheBoard, "Continue");
    assert.equal(COPY.folded, "Saved");
    assert.equal(COPY.pace, "Dashboard");
    assert.equal(COPY.instruments, "Analytics");
    assert.equal(COPY.seals, "Badges");
    assert.equal(COPY.layOutAPlan, "New plan");
    assert.equal(COPY.wallDidNotLoad, "Couldn’t load this exam");
    assert.equal(COPY.backToTheWall, "All exams");
    assert.equal(COPY.nothingPlayable, "Nothing in today’s queue to play");
    assert.equal(COPY.skipToBoard, "Skip to content");
    assert.equal(COPY.liveAtDoor, "Live now");
    assert.equal(COPY.youreOffline, "You’re offline");
    assert.equal(COPY.takeTheSheets, "Download notes");
    assert.equal(COPY.boardIsComing, "Loading this class");
    assert.equal(COPY.howCoursesMix, "How courses mix");
    assert.equal(COPY.stamps, "Teachers");
    assert.equal(COPY.rackEmpty, "This list is empty.");
    assert.equal(COPY.noStampsMatch, "No teachers match that search.");
    assert.equal(COPY.search, "Search");
    assert.equal(COPY.todaysPlan, "Today’s plan");
    assert.equal(COPY.shortcuts, "Shortcuts");
    assert.equal(COPY.keepThisClass, "Save this class");
    assert.equal(COPY.practice, "Practice");
    assert.equal(COPY.doTheseQuestions, "Do these questions");
    assert.equal(COPY.savedClasses, "Saved classes");
    assert.equal(COPY.keepTheCourse, "Save the course");
    assert.equal(COPY.notesArePdfs, "PDFs only. To keep the class video, use Save this class.");
    assert.equal(boardOnCopy(3), "In progress · 3 in the queue");
    assert.equal(sealEarnedCopy("First mark"), "Badge · First mark");
    assert.equal(coursesCopy(1), "1 course");
    assert.equal(coursesCopy(11), "11 courses");
    assert.equal(streakDaysCopy(0), "No streak");
    assert.equal(streakDaysCopy(1), "1-day streak");
    assert.equal(streakDaysCopy(5), "5-day streak");
    assert.equal(COPY.fortyStand, "Forty minutes. Stand.");
    assert.equal(COPY.keysHint, "Space · C · S · F");
    assert.equal(COPY.writeAClassFromWall, "Find a class from the catalog");
    assert.equal(COPY.writeAnExam, "Pick an exam");
    assert.equal(COPY_MAP.length, 16);
  });

  it("keeps leftover Unacademy/planner chrome out of UI files", () => {
    const skip = new Set([
      join(import.meta.dirname, "copy.ts"),
      join(import.meta.dirname, "jump.ts"),
      join(import.meta.dirname, "command-palette.ts"),
    ]);
    const files = walk(join(import.meta.dirname, "..")).filter((f) => !skip.has(f));
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const phrase of BANNED_CHROME) {
        if (phrase === "Download all" && src.includes("Download all notes") && !src.replace(/Download all notes/g, "").includes("Download all")) {
          continue;
        }
        if (src.includes(phrase)) hits.push(`${file}: ${phrase}`);
      }
    }
    assert.deepEqual(hits, []);
  });

  it("empty, error, and offline sheets share the locked titles", () => {
    const error = readFileSync(join(import.meta.dirname, "error-component.tsx"), "utf8");
    const missing = readFileSync(join(import.meta.dirname, "../components/not-found.tsx"), "utf8");
    const shell = readFileSync(join(import.meta.dirname, "../components/planner/planner-shell.tsx"), "utf8");
    const skip = readFileSync(join(import.meta.dirname, "../components/folio/skip-link.tsx"), "utf8");
    const sync = readFileSync(join(import.meta.dirname, "../components/planner-sync.tsx"), "utf8");
    assert.match(error, /COPY.boardDidNotHold/);
    assert.match(error, /COPY.slateSlipped/);
    assert.match(error, /COPY.backToTheWall/);
    assert.match(missing, /COPY.pageNotOnBoard/);
    assert.match(skip, /COPY.skipToBoard/);
    assert.match(shell, /COPY.youreOffline/);
    assert.match(sync, /local-only/);
    assert.doesNotMatch(sync, /sync-chip/);
  });
});
