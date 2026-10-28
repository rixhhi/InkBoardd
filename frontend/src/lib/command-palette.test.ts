import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStyles } from "./read-styles.ts";
import { describe, it } from "node:test";
import {
  buildPaletteRows,
  groupPaletteRows,
  groupWriteLine,
  matchingExams,
  rankTeacherRows,
  rankWriteLine,
  teacherNameQuery,
  teacherQuery,
  writeLineCopy,
  writeLineLead,
} from "@inkboard/shared/command-palette";

describe("command palette rows", () => {
  it("treats @username as a teacher search", () => {
    assert.equal(teacherQuery("@agsir"), "agsir");
    assert.equal(teacherQuery("agsir"), "agsir");
    assert.equal(teacherQuery("a"), "");
    assert.equal(teacherQuery("two words"), "");
  });

  it("treats a person name as a teacher query in teacher mode", () => {
    assert.equal(teacherNameQuery("chandan"), "chandan");
    assert.equal(teacherNameQuery("Chandan Kumar"), "Chandan Kumar");
    assert.equal(teacherNameQuery("@agsir"), "agsir");
    assert.equal(teacherNameQuery("a"), "");
    const ranked = rankTeacherRows(
      [
        { group: "Teachers", value: "desk maths", label: "Rahul Sir", hint: "@rahulmathematik", href: { kind: "teacher", slug: "rahulmathematik" } },
        { group: "Teachers", value: "desk ch1", label: "Chandan Singh", hint: "@csingh", href: { kind: "teacher", slug: "csingh" } },
        { group: "Teachers", value: "desk ch2", label: "Chandan", hint: "@chandan", href: { kind: "teacher", slug: "chandan" } },
      ],
      "chandan",
    );
    assert.equal(ranked[0]?.label, "Chandan");
    assert.equal(ranked[1]?.label, "Chandan Singh");
    assert.equal(ranked.some((r) => r.label === "Rahul Sir"), false);
    const jha = rankTeacherRows(
      [
        { group: "Teachers", value: "desk jha", label: "Chandan Jha", hint: "@ChandanJha-301", href: { kind: "teacher", slug: "ChandanJha-301" } },
        { group: "Teachers", value: "desk roman", label: "Roman Saini", hint: "@RomanSaini", href: { kind: "teacher", slug: "RomanSaini" } },
      ],
      "chandan",
    );
    assert.equal(jha[0]?.href.kind === "teacher" && jha[0].href.slug, "ChandanJha-301");
    assert.equal(jha.some((r) => r.label === "Roman Saini"), false);
    assert.ok(ranked.length <= 40);
  });

  it("includes exams, saved teachers, later items and planner actions", () => {
    const rows = buildPaletteRows({
      query: "@agsir",
      exams: [{ id: "NVLIA", name: "GATE CS", group: "Engineering" }],
      saved: [{ username: "vishalrawtiya", name: "Vishal Rawtiya" }],
      recents: [{ q: "ankitdoylasir" }],
      later: [{ lessonId: "ABCDEF", title: "PDA intro", teacher: "Ankit" }],
      history: [{ lessonId: "GHIJKL", title: "Calculus – I", teacher: "Rahul" }],
      lectures: [{ lessonId: "MNOPQR", title: "Language to DFA", teacher: "Ankit" }],
    });
    const labels = rows.map((r) => r.label);
    assert.equal(labels.includes("Search @agsir"), true);
    assert.equal(labels.includes("GATE CS"), false);
    assert.equal(labels.includes("Vishal Rawtiya"), true);
    assert.equal(labels.includes("PDA intro"), true);
    assert.equal(labels.includes("Calculus – I"), true);
    assert.equal(labels.includes("Language to DFA"), true);
    assert.equal(labels.includes("Log study"), true);
    assert.equal(labels.includes("Start class"), true);
    assert.equal(labels.includes("Tasks"), true);
    assert.equal(labels.includes("Saved classes"), true);
    const savedClasses = rows.find((r) => r.label === "Saved classes");
    assert.deepEqual(savedClasses?.href, { kind: "path", to: "/offline" });
    const search = rows.find((r) => r.label === "Search @agsir");
    assert.deepEqual(search?.href, { kind: "search", q: "agsir" });
  });

  it("matches exams by name when the query is an exam, not a username", () => {
    const exams = [
      { id: "NVLIA", name: "GATE CS", group: "Engineering", family: "GATE" },
      { id: "TMUVD", name: "IIT JEE", group: "Engineering" },
      { id: "YOTUH", name: "NEET UG", group: "Medical" },
    ];
    assert.deepEqual(
      matchingExams(exams, "gate").map((e) => e.name),
      ["GATE CS"],
    );
    assert.equal(matchingExams(exams, "").length, 3);
    const rows = buildPaletteRows({
      query: "gate",
      exams,
      saved: [],
      recents: [],
      later: [],
      history: [],
      lectures: [],
    });
    assert.equal(rows.some((r) => r.label === "GATE CS"), true);
    assert.equal(rows.some((r) => r.label === "NEET UG"), false);
    const exam = rows.find((r) => r.label === "GATE CS");
    assert.deepEqual(exam?.href, { kind: "exam", id: "NVLIA" });
  });

  it("offers a play jump when the query is a lesson id", () => {
    const rows = buildPaletteRows({
      query: "2O24MEDDGPTI2AZ00YMV",
      exams: [],
      saved: [],
      recents: [],
      later: [],
      history: [],
      lectures: [],
    });
    const play = rows.find((r) => r.label.startsWith("Play "));
    assert.deepEqual(play?.href, { kind: "play", lessonId: "2O24MEDDGPTI2AZ00YMV", title: "Class" });
  });

  it("groups teachers before exams so a username query surfaces first", () => {
    const grouped = groupPaletteRows(
      buildPaletteRows({
        query: "agsir",
        exams: [{ id: "NVLIA", name: "GATE CS", group: "Engineering" }],
        saved: [],
        recents: [],
        later: [],
        history: [],
        lectures: [],
      }),
    );
    assert.equal(grouped[0]?.group, "Teachers");
    assert.equal(grouped[0]?.items[0]?.label, "Search @agsir");
  });

  it("only WriteLine binds Ctrl/Cmd+K; shortcuts skip modifier keys", () => {
    const palette = readFileSync(new URL("../components/folio/write-line.tsx", import.meta.url), "utf8");
    const shortcuts = readFileSync(new URL("../components/planner/shortcuts.tsx", import.meta.url), "utf8");
    const root = readFileSync(new URL("../routes/__root.tsx", import.meta.url), "utf8");
    const css = readStyles(new URL("../styles.css", import.meta.url));
    assert.equal((palette.match(/key\.toLowerCase\(\) === "k"/g) ?? []).length, 1);
    assert.match(palette, /e\.metaKey \|\| e\.ctrlKey/);
    assert.match(palette, /role="dialog"/);
    assert.match(palette, /aria-modal="true"/);
    assert.match(palette, /if \(!open\) return \[\]/);
    assert.match(palette, /searchDesk/);
    assert.match(palette, /COPY\.writeWhere/);
    assert.match(palette, /write-line-overlay/);
    assert.match(palette, /teacherNameQuery/);
    assert.match(palette, /mode === "teachers"/);
    const ua = readFileSync(new URL("../../../backend/src/integrations/unacademy/educator.ts", import.meta.url), "utf8");
    assert.match(ua, /search\/autocomplete/);
    assert.match(ua, /usersFromAutocomplete/);
    assert.match(ua, /seek8:/);
    assert.match(ua, /extraNameQueries/);
    assert.match(ua, /listingNextUrl/);
    assert.match(css, /\.write-line-overlay/);
    assert.match(css, /@keyframes write-line/);
    const shell = readFileSync(new URL("../components/shell/app-shell.tsx", import.meta.url), "utf8");
    assert.match(shell, /openCommandPalette/);
    assert.match(shell, /COPY\.search/);
    assert.match(shortcuts, /if \(e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey\) return/);
    assert.equal((root.match(/<CommandPalette/g) ?? []).length, 1);
  });

  it("writes verb-first copy and ranks a lead line of eight", () => {
    const empty = writeLineLead({ query: "", history: [], hasPlan: false });
    assert.equal(writeLineCopy(empty), "Lay out a plan");
    const resume = writeLineLead({
      query: "",
      history: [{ lessonId: "ABC", title: "Gauss law" }],
      hasPlan: true,
    });
    assert.equal(writeLineCopy(resume), "Continue");
    const search = writeLineLead({ query: "electrostatics", history: [], hasPlan: false });
    assert.equal(writeLineCopy(search), "Look for electrostatics");
    const find = writeLineCopy({
      group: "Teachers",
      value: "search teacher agsir",
      label: "Search @agsir",
      href: { kind: "search", q: "agsir" },
    });
    assert.equal(find, "Find @agsir");
    assert.equal(
      writeLineCopy({
        group: "Jump",
        value: "tasks today planner",
        label: "Tasks",
        href: { kind: "path", to: "/planner/today" },
      }),
      "Open today’s tasks",
    );
    const ranked = rankWriteLine(
      buildPaletteRows({
        query: "",
        exams: [{ id: "YOTUH", name: "NEET UG", group: "Medical" }],
        saved: [],
        recents: [],
        later: [],
        history: [{ lessonId: "ABC", title: "Gauss law" }],
        lectures: [],
      }),
      resume,
    );
    assert.equal(ranked.length, 8);
    assert.equal(ranked[0]?.label, "Jump to last class");
    const grouped = groupWriteLine(ranked);
    assert.equal(grouped[0]?.group, "");
    assert.equal(grouped[0]?.items[0]?.label, "Jump to last class");
  });
});
