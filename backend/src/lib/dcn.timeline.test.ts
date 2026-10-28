import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { affineAt, camAt, compactEvents, eraserHits, firstInkSec, followEraser, notesSlug, pendingTimeline, slideAt, strokeWidthPx, visibleImages, visibleStrokes } from "@inkboard/shared/dcn";

function ev(plugin: string, p_time: number, data: Record<string, unknown>) {
  return { plugin, p_time, data };
}

describe("slide timeline", () => {
  it("follows slide switches instead of stacking every page", () => {
    const tl = compactEvents("LESSON", [
      [
        ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
        ev("dcn", 500_000, { e: "sc", s: 1 }),
        ev("dcn", 2_000_000, { e: "as", i: 2, uid: "s1", u: "https://static.uacdn.net/s1.pdf?page=2" }),
        ev("dcn", 5_000_000, { e: "sc", s: 2 }),
      ],
    ]);
    assert.equal(slideAt(tl, 0).uid, "blank");
    assert.equal(slideAt(tl, 1_000).uid, "s0");
    assert.equal(slideAt(tl, 6_000).uid, "s1");
    assert.ok(slideAt(tl, 1_000).url?.startsWith("/api/slide?u="));
    const decoded = decodeURIComponent((slideAt(tl, 1_000).url || "").split("u=")[1] || "");
    assert.match(decoded, /page=1/);
    assert.equal(tl.kind, "board");
  });

  it("inserting a page at index 2 does not pile every stroke on one board", () => {
    const cw = (t: number, id: number, oid: string, x: number) => ({
      plugin: "cw",
      p_time: t,
      data: { id, data: { e: "d", p: { x, y: 0.2, oid } } },
    });
    const up = (t: number, id: number, x: number) => ({
      plugin: "cw",
      p_time: t,
      data: { id, data: { e: "u", p: { x, y: 0.3 } } },
    });
    const tl = compactEvents("LESSON", [
      [
        ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
        ev("dcn", 100_000, { e: "sc", s: 1 }),
        cw(200_000, 1, "a", 0.1),
        up(220_000, 1, 0.2),
        ev("dcn", 400_000, { e: "as", i: 2, uid: "s1", u: "https://static.uacdn.net/s1.pdf?page=2" }),
        ev("dcn", 500_000, { e: "sc", s: 2 }),
        cw(600_000, 2, "b", 0.3),
        up(620_000, 2, 0.4),
        ev("dcn", 800_000, { e: "as", i: 2, uid: "s2", u: "https://static.uacdn.net/s2.pdf?page=3" }),
        ev("dcn", 900_000, { e: "sc", s: 2 }),
        cw(1_000_000, 2, "c", 0.5),
        up(1_020_000, 2, 0.6),
      ],
    ]);
    assert.equal(visibleStrokes(tl, 2_000, "s0").length, 1);
    assert.equal(visibleStrokes(tl, 2_000, "s1").length, 1);
    assert.equal(visibleStrokes(tl, 2_000, "s2").length, 1);
    assert.equal(slideAt(tl, 1_100).uid, "s2");
    assert.equal(visibleStrokes(tl, 1_100, slideAt(tl, 1_100).uid).length, 1);
  });

  it("a new blank board does not keep the cover JPEG", () => {
    const tl = compactEvents("LESSON", [
      [
        ev("dcn", 0, { e: "as", i: 1, uid: "cover", u: "https://uadoc.uacdn.net/cover.jpg" }),
        ev("dcn", 100_000, { e: "sc", s: 1 }),
        ev("dcn", 2_000_000, { e: "as", i: 2, uid: "blank2", u: "" }),
        ev("dcn", 2_100_000, { e: "sc", s: 2 }),
      ],
    ]);
    assert.ok(slideAt(tl, 500).url);
    const blank = slideAt(tl, 2_200);
    assert.equal(blank.uid, "blank2");
    assert.equal(blank.url, undefined);
  });

  it("tags ink by the canvas id so writing stays on its own page", () => {
    const tl = compactEvents("LESSON", [
      [
        ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
        ev("dcn", 100_000, { e: "as", i: 2, uid: "s1", u: "https://static.uacdn.net/s1.pdf?page=2" }),
        ev("dcn", 500_000, { e: "sc", s: 1 }),
        {
          plugin: "cw",
          p_time: 1_000_000,
          data: { id: 1, data: { e: "d", p: { x: 0.1, y: 0.1, oid: "ink" } } },
        },
        {
          plugin: "cw",
          p_time: 1_200_000,
          data: { id: 1, data: { e: "u", p: { x: 0.2, y: 0.2 } } },
        },
      ],
    ]);
    assert.equal(visibleStrokes(tl, 2000, "s0").length, 1);
    assert.equal(visibleStrokes(tl, 2000, "s1").length, 0);
    assert.equal(visibleStrokes(tl, 2000, "blank").length, 0);
  });

  it("pendingTimeline paints chrome before notes load", () => {
    const tl = pendingTimeline("ABC123", "Calculus – I");
    assert.equal(tl.id, "ABC123");
    assert.equal(tl.title, "Calculus – I");
    assert.equal(tl.kind, "video");
    assert.equal(tl.videoUrl, "");
    assert.equal(slideAt(tl, 0).uid, "blank");
  });

  it("drops strokes after an erase-all on that slide", () => {
    const tl = compactEvents("LESSON", [
      [
        ev("cw", 1_000_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "ink" } }),
        ev("cw", 1_200_000, { e: "u", p: { x: 0.2, y: 0.2 } }),
        ev("cw", 3_000_000, { e: "ea" }),
      ],
    ]);
    assert.equal(visibleStrokes(tl, 2000, "blank").length, 1);
    assert.equal(visibleStrokes(tl, 4000, "blank").length, 0);
  });

  it("tracks zoom and pan per slide", () => {
    const tl = compactEvents("LESSON", [
      [
        ev("cw", 1_000_000, { e: "zm", v: 2 }),
        ev("cw", 2_000_000, { e: "pn", v: { x: 0.1, y: -0.2 } }),
      ],
    ]);
    assert.equal(camAt(tl, 500, "blank").z, 1);
    assert.equal(camAt(tl, 1_500, "blank").z, 2);
    const pan = camAt(tl, 3_000, "blank");
    assert.equal(pan.z, 2);
    assert.equal(pan.x, 0.1);
    assert.equal(pan.y, -0.2);
  });

  it("ignores cursor p events so they cannot scribble across a stroke", () => {
    const tl = compactEvents("LESSON", [
      [
        ev("cw", 1_000_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "ink" } }),
        ev("cw", 1_100_000, { e: "m", p: { x: 0.12, y: 0.11 } }),
        ev("cw", 1_150_000, { e: "p", p: { x: 0.9, y: 0.9 } }),
        ev("cw", 1_200_000, { e: "m", p: { x: 0.14, y: 0.12 } }),
        ev("cw", 1_300_000, { e: "u", p: { x: 0.15, y: 0.13 } }),
      ],
    ]);
    const st = visibleStrokes(tl, 2000, "blank")[0]!;
    assert.ok(st);
    const xs = st.p.filter((_, i) => i % 2 === 0);
    assert.ok(xs.every((x) => x < 0.3), `stroke included cursor jump: ${xs}`);
    assert.equal(xs.length, 4);
  });

  it("builds Unacademy-style notes slugs and stroke widths", () => {
    assert.equal(notesSlug("Markovnikov's Rule & Addition"), "Markovnikovs_Rule__Addition");
    assert.equal(notesSlug("Addition of X2, Lactonization"), "Addition_of_X2_Lactonization");
    assert.equal(notesSlug("Counting Techniques - Part I"), "Counting_Techniques__Part_I");
    assert.ok(strokeWidthPx(0.5, 1280, "marker") > 1);
    assert.ok(strokeWidthPx(0.5, 1280, "marker") < 8);
    assert.ok(strokeWidthPx(5, 1280, "eraser") > strokeWidthPx(0.5, 1280, "marker"));
    assert.ok(strokeWidthPx(2, 1280, "marker_highlighter") < 40);
  });

  it("skip-intro time is the first real ink after 4s", () => {
    const early = compactEvents("L", [[
      ev("cw", 1_000_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "a" } }),
      ev("cw", 1_200_000, { e: "u", p: { x: 0.2, y: 0.2 } }),
    ]]);
    assert.equal(firstInkSec(early), 0);
    const late = compactEvents("L", [[
      ev("cw", 12_000_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "a" } }),
      ev("cw", 12_200_000, { e: "u", p: { x: 0.2, y: 0.2 } }),
    ]]);
    assert.ok(firstInkSec(late) >= 11);
  });

  it("tf selection ids match p.oid, never aId or s0", () => {
    const tl = compactEvents("LESSON", [[
      {
        plugin: "cw",
        p_time: 1_000_000,
        data: { id: 0, data: { e: "d", aId: "dash-uuid", p: { x: 0.2, y: 0.4, oid: "ink_oid" } } },
      },
      {
        plugin: "cw",
        p_time: 1_200_000,
        data: { id: 0, data: { e: "u", p: { x: 0.21, y: 0.41 } } },
      },
    ]]);
    assert.equal(tl.strokes[0]?.oid, "ink_oid");
  });

  it("applies every tf ts sample as an incremental delta, not the last as absolute", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 0.10, y: 0.20, oid: "ink_oid" } }),
      nested(1_100_000, { e: "u", p: { x: 0.10, y: 0.20 } }),
      nested(2_000_000, { e: "tf", t: "s", data: { ids: ["ink_oid"] } }),
      nested(2_100_000, { e: "tf", t: "ts", data: { dx: 0.05, dy: 0.01 } }),
      nested(2_200_000, { e: "tf", t: "ts", data: { dx: 0.05, dy: 0.01 } }),
      nested(2_300_000, { e: "tf", t: "e", data: {} }),
    ]]);
    assert.equal(tl.shifts.length, 2);
    const st = visibleStrokes(tl, 3_000, "blank")[0]!;
    assert.ok(Math.abs(st.p[0]! - 0.20) < 1e-9, `expected summed dx 0.10, got ${st.p[0]}`);
    assert.ok(Math.abs(st.p[1]! - 0.22) < 1e-9, `expected summed dy 0.02, got ${st.p[1]}`);
  });

  it("a drag of a paste also moves the few clones missing from the id list", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push(nested(1_000_000 + i * 20_000, { e: "d", p: { x: 0.05 * i, y: 0.2, oid: `s${i}` } }));
      events.push(nested(1_010_000 + i * 20_000, { e: "u", p: { x: 0.05 * i, y: 0.2 } }));
      events.push(nested(2_000_000 + i * 1_000, {
        e: "pdo2",
        aId: "paste-1",
        path: { copyId: `s${i}`, pasteId: `p${i}`, sx: 1, sy: 1, dx: 0, dy: 0, eraserPaths: [] },
      }));
    }
    const picked = Array.from({ length: 9 }, (_, i) => `p${i}`);
    events.push(nested(3_000_000, { e: "tf", t: "s", data: { ids: picked } }));
    events.push(nested(3_100_000, { e: "tf", t: "ts", data: { dx: 0.1, dy: 0 } }));
    events.push(nested(3_200_000, { e: "tf", t: "e", data: {} }));
    const tl = compactEvents("LESSON", [events]);
    const vis = visibleStrokes(tl, 4_000, "blank");
    const at = (oid: string) => vis.find((s) => s.oid === oid)!;
    assert.ok(Math.abs(at("p0").p[0]! - 0.1) < 1e-9);
    assert.ok(Math.abs(at("p9").p[0]! - 0.55) < 1e-9, "the omitted clone moves with the paste");
    assert.ok(Math.abs(at("s9").p[0]! - 0.45) < 1e-9, "the source stroke stays");
  });

  it("a drag of a paste also moves the strokes stored on it as eraser paths", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 0.4, y: 0.5, oid: "digit" } }),
      nested(1_100_000, { e: "u", p: { x: 0.42, y: 0.55 } }),
      nested(1_200_000, { e: "d", p: { x: 0.2, y: 0.3, oid: "src" } }),
      nested(1_300_000, { e: "u", p: { x: 0.25, y: 0.3 } }),
      nested(2_000_000, {
        e: "pdo2",
        aId: "paste-1",
        path: {
          copyId: "src",
          pasteId: "copy",
          sx: 1,
          sy: 1,
          dx: 0.1,
          dy: 0,
          eraserPaths: [{ id: "digit", cloneId: "digit-copy", sx: 1, sy: 1, dx: 0.2, dy: 0 }],
        },
      }),
      nested(3_000_000, { e: "tf", t: "s", data: { ids: ["copy"] } }),
      nested(3_100_000, { e: "tf", t: "ts", data: { dx: 0.1, dy: 0 } }),
      nested(3_200_000, { e: "tf", t: "e", data: {} }),
    ]]);
    const vis = visibleStrokes(tl, 4_000, "blank");
    const digit = vis.find((s) => s.oid === "digit-copy");
    const srcDigit = vis.find((s) => s.oid === "digit");
    assert.ok(digit, "the attached clone is on the board");
    assert.ok(Math.abs(digit!.p[0]! - 0.7) < 1e-9, "the attached digit moves with the paste");
    assert.ok(Math.abs(srcDigit!.p[0]! - 0.4) < 1e-9, "the original digit stays");
  });

  it("renames a stroke when the board sends new ids after a move", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 0.2, y: 0.3, oid: "old" } }),
      nested(1_100_000, { e: "u", p: { x: 0.4, y: 0.5 } }),
      nested(2_000_000, { e: "u", oids: ["old"], peids: ["old"], eids: ["new"], p: { x: 0.9, y: 0.9, shouldDraw: true } }),
      nested(2_100_000, { e: "tf", t: "s", data: { ids: ["new"] } }),
      nested(2_200_000, { e: "tf", t: "ts", data: { dx: 0.1, dy: 0 } }),
      nested(2_300_000, { e: "tf", t: "e", data: {} }),
    ]]);
    const vis = visibleStrokes(tl, 3_000, "blank");
    assert.equal(vis.length, 1);
    assert.equal(vis[0]!.oid, "new");
    assert.ok(Math.abs(vis[0]!.p[0]! - 0.3) < 1e-9, "the renamed stroke still takes the drag");
    assert.ok(vis[0]!.p.length >= 4, "the rename point is not drawn as ink");
  });

  it("a drag that still names the old paste ids moves the renamed strokes", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 0.2, y: 0.3, oid: "src" } }),
      nested(1_100_000, { e: "u", p: { x: 0.25, y: 0.3 } }),
      nested(2_000_000, {
        e: "pdo2",
        aId: "paste-1",
        path: { copyId: "src", pasteId: "old", sx: 1, sy: 1, dx: 0, dy: 0, eraserPaths: [] },
      }),
      nested(2_500_000, { e: "u", oids: ["old"], peids: ["old"], eids: ["now"], p: { x: 0, y: 0, shouldDraw: false } }),
      nested(3_000_000, { e: "tf", t: "s", data: { ids: ["old"] } }),
      nested(3_100_000, { e: "tf", t: "ts", data: { dx: -0.18, dy: 0.04 } }),
      nested(3_200_000, { e: "tf", t: "e", data: {} }),
    ]]);
    const vis = visibleStrokes(tl, 4_000, "blank");
    const now = vis.find((s) => s.oid === "now");
    const src = vis.find((s) => s.oid === "src");
    assert.ok(now, "the renamed clone is still on the board");
    assert.ok(Math.abs(now!.p[0]! - 0.02) < 1e-9, "the drag follows the rename");
    assert.ok(Math.abs(src!.p[0]! - 0.2) < 1e-9, "the source stays");
  });

  it("a renamed clone keeps an earlier eraser gap when a drag names the old id", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", m: "marker", p: { x: 0.2, y: 0.4, oid: "src" } }),
      nested(1_100_000, { e: "u", p: { x: 0.8, y: 0.4 } }),
      nested(2_000_000, {
        e: "pdo2",
        aId: "paste-1",
        path: { copyId: "src", pasteId: "old", sx: 1, sy: 1, dx: 0, dy: 0, eraserPaths: [] },
      }),
      nested(2_200_000, { e: "u", oids: ["old"], peids: ["old"], eids: ["now"], p: { x: 0, y: 0, shouldDraw: false } }),
      nested(2_400_000, { e: "mc", m: "eraser" }),
      nested(2_500_000, { e: "d", m: "eraser", p: { x: 0.4, y: 0.4, oid: "cut" } }),
      nested(2_600_000, { e: "m", p: { x: 0.6, y: 0.4 } }),
      nested(2_700_000, { e: "u", p: { x: 0.6, y: 0.4 } }),
      nested(3_000_000, { e: "tf", t: "s", data: { ids: ["old"] } }),
      nested(3_100_000, { e: "tf", t: "ts", data: { dx: 0.15, dy: 0 } }),
      nested(3_200_000, { e: "tf", t: "e", data: {} }),
    ]]);
    const vis = visibleStrokes(tl, 4_000, "blank");
    const now = vis.find((s) => s.oid === "now")!;
    assert.ok(Math.abs(now.p[0]! - 0.35) < 1e-9);
    const hit = eraserHits(tl).find((h) => h.eraser === "cut" && h.oid === "now");
    assert.ok(hit, "the eraser stays bound to the renamed stroke");
    const gap = followEraser(tl.strokes.find((s) => s.oid === "cut")!.p, hit!.at, affineAt(tl, 4_000, "now"));
    assert.ok(Math.abs(gap[0]! - 0.55) < 1e-6, "the gap moves with the stroke");
    const shift = tl.shifts.find((s) => s.oids.includes("now"));
    assert.equal(new Set(shift!.oids).size, shift!.oids.length);
  });

  it("a rename after a drag does not move a different stroke", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 0.2, y: 0.2, oid: "a" } }),
      nested(1_100_000, { e: "u", p: { x: 0.3, y: 0.2 } }),
      nested(1_200_000, { e: "d", p: { x: 0.6, y: 0.2, oid: "b" } }),
      nested(1_300_000, { e: "u", p: { x: 0.7, y: 0.2 } }),
      nested(2_000_000, { e: "tf", t: "s", data: { ids: ["a"] } }),
      nested(2_100_000, { e: "tf", t: "ts", data: { dx: 0.1, dy: 0 } }),
      nested(2_200_000, { e: "tf", t: "e", data: {} }),
      nested(3_000_000, { e: "u", oids: ["b"], peids: ["b"], eids: ["c"], p: { x: 0, y: 0, shouldDraw: false } }),
    ]]);
    const vis = visibleStrokes(tl, 4_000, "blank");
    assert.ok(Math.abs(vis.find((s) => s.oid === "a")!.p[0]! - 0.3) < 1e-9);
    assert.ok(Math.abs(vis.find((s) => s.oid === "c")!.p[0]! - 0.6) < 1e-9);
    assert.equal(tl.shifts[0]!.oids.includes("c"), false);
  });

  it("a small selection does not pull in the rest of a paste", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push(nested(1_000_000 + i * 20_000, { e: "d", p: { x: 0.1 * i, y: 0.2, oid: `s${i}` } }));
      events.push(nested(1_010_000 + i * 20_000, { e: "u", p: { x: 0.1 * i, y: 0.2 } }));
      events.push(nested(2_000_000 + i * 1_000, {
        e: "pdo2",
        aId: "paste-1",
        path: { copyId: `s${i}`, pasteId: `p${i}`, sx: 1, sy: 1, dx: 0, dy: 0, eraserPaths: [] },
      }));
    }
    events.push(nested(3_000_000, { e: "tf", t: "s", data: { ids: ["p0", "p1"] } }));
    events.push(nested(3_100_000, { e: "tf", t: "ts", data: { dx: 0.2, dy: 0 } }));
    const tl = compactEvents("LESSON", [events]);
    const vis = visibleStrokes(tl, 4_000, "blank");
    const p0 = vis.find((s) => s.oid === "p0")!;
    const p2 = vis.find((s) => s.oid === "p2")!;
    assert.ok(Math.abs(p0.p[0]! - 0.2) < 1e-9);
    assert.ok(Math.abs(p2.p[0]! - 0.2) < 1e-9, "an unselected clone stays put");
  });

  it("one extra id does not drop the rest of a nearly complete paste", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const events = [
      nested(500_000, { e: "d", p: { x: 0.4, y: 0.2, oid: "extra" } }),
      nested(510_000, { e: "u", p: { x: 0.4, y: 0.2 } }),
    ];
    for (let i = 0; i < 10; i++) {
      events.push(nested(1_000_000 + i * 20_000, { e: "d", p: { x: 0.1, y: 0.2, oid: `s${i}` } }));
      events.push(nested(1_010_000 + i * 20_000, { e: "u", p: { x: 0.1, y: 0.2 } }));
      events.push(nested(2_000_000 + i * 1_000, {
        e: "pdo2",
        aId: "paste-1",
        path: { copyId: `s${i}`, pasteId: `p${i}`, sx: 1, sy: 1, dx: 0.3, dy: 0, eraserPaths: [] },
      }));
    }
    const named = ["extra", ...Array.from({ length: 9 }, (_, i) => `p${i}`)];
    events.push(nested(3_000_000, { e: "tf", t: "s", data: { ids: named } }));
    events.push(nested(3_100_000, { e: "tf", t: "ts", data: { dx: -0.18, dy: 0 } }));
    const tl = compactEvents("LESSON", [events]);
    const vis = visibleStrokes(tl, 4_000, "blank");
    const p9 = vis.find((s) => s.oid === "p9")!;
    const extra = vis.find((s) => s.oid === "extra")!;
    assert.ok(Math.abs(p9.p[0]! - 0.22) < 1e-9, "the omitted clone moves with the paste");
    assert.ok(Math.abs(extra.p[0]! - 0.22) < 1e-9, "the extra selected stroke still moves");
  });

  it("multiplies tf sl samples, and a final 1.0 frame does not undo them", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const sl = (sx: number, dx: number) => ({
      e: "tf",
      t: "sl",
      data: { sx, sy: 1, m: { sx: String(sx), sy: "1", dx: String(dx), dy: "0" }, cx: 0, cy: 0 },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 1, y: 0.5, oid: "ink_oid" } }),
      nested(1_100_000, { e: "u", p: { x: 1, y: 0.5 } }),
      nested(2_000_000, { e: "tf", t: "s", data: { ids: ["ink_oid"] } }),
      nested(2_100_000, sl(0.9, 0)),
      nested(2_200_000, sl(0.9, 0)),
      nested(2_300_000, sl(1, 0)),
      nested(2_400_000, { e: "tf", t: "e", data: {} }),
    ]]);
    assert.equal(tl.shifts.length, 3);
    const st = visibleStrokes(tl, 3_000, "blank")[0]!;
    assert.ok(Math.abs(st.p[0]! - 0.81) < 1e-9, `0.9 * 0.9, the last 1.0 is not a reset, got ${st.p[0]}`);
  });

  it("a pinch multiplies every sample about the same pivot", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const cx = 0.9995;
    const cy = 0.0288;
    const sl = (sx: number, sy = 1) => {
      const dx = (1 - sx) * cx;
      const dy = (1 - sy) * cy;
      return {
        e: "tf",
        t: "sl",
        data: {
          sx,
          sy,
          cx,
          cy,
          m: { sx: String(sx), sy: String(sy), dx: String(dx), dy: String(dy), shx: "0", shy: "0" },
        },
      };
    };
    const events = [
      nested(1_000_000, { e: "d", p: { x: 0.2, y: 0.5, oid: "old" } }),
      nested(1_100_000, { e: "u", p: { x: 0.2, y: 0.5 } }),
      nested(1_200_000, { e: "d", p: { x: cx, y: cy, oid: "pivot" } }),
      nested(1_300_000, { e: "u", p: { x: cx, y: cy } }),
      nested(2_000_000, { e: "tf", t: "s", data: { ids: ["old", "pivot"] } }),
      nested(2_100_000, sl(0.9, 0.95)),
      nested(2_200_000, sl(0.8, 0.9)),
    ];
    const tl = compactEvents("LESSON", [events]);
    const mid = visibleStrokes(tl, 2_150, "blank").find((s) => s.oid === "old")!;
    const played = compactEvents("LESSON", [[...events.slice(0, 5), events[5]!]]);
    const stepped = visibleStrokes(played, 3_000, "blank").find((s) => s.oid === "old")!;
    assert.ok(Math.abs(mid.p[0]! - stepped.p[0]!) < 1e-9, "seeking into the gesture matches playing to that sample");
    const done = visibleStrokes(tl, 3_000, "blank");
    const old = done.find((s) => s.oid === "old")!;
    const pivot = done.find((s) => s.oid === "pivot")!;
    const sx = 0.9 * 0.8;
    const sy = 0.95 * 0.9;
    assert.ok(Math.abs(old.p[0]! - (sx * 0.2 + (1 - sx) * cx)) < 1e-9, `scaled x ${old.p[0]}`);
    assert.ok(Math.abs(old.p[1]! - (sy * 0.5 + (1 - sy) * cy)) < 1e-9, `scaled y ${old.p[1]}`);
    assert.ok(Math.abs(pivot.p[0]! - cx) < 1e-6, "the pivot stays put");
    events.push(nested(4_000_000, { e: "d", p: { x: 0.7, y: 0.8, oid: "newer" } }));
    events.push(nested(4_100_000, { e: "u", p: { x: 0.7, y: 0.8 } }));
    const after = visibleStrokes(compactEvents("LESSON", [events]), 5_000, "blank");
    const fresh = after.find((s) => s.oid === "newer")!;
    const moved = after.find((s) => s.oid === "old")!;
    assert.ok(Math.abs(fresh.p[0]! - 0.7) < 1e-9, "ink drawn after the pinch is not scaled");
    const oldBox = [Math.min(moved.p[0]!, moved.p[2] ?? moved.p[0]!), Math.max(moved.p[0]!, moved.p[2] ?? moved.p[0]!)];
    assert.ok(oldBox[1]! < fresh.p[0]!, "the scaled old stroke no longer sits on the new one");
  });

  it("pdo2 and dlos address strokes by p.oid", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 0.2, y: 0.2, oid: "keep" } }),
      nested(1_100_000, { e: "u", p: { x: 0.2, y: 0.2 } }),
      nested(1_200_000, { e: "d", p: { x: 0.4, y: 0.4, oid: "drop" } }),
      nested(1_300_000, { e: "u", p: { x: 0.4, y: 0.4 } }),
      nested(2_000_000, { e: "pdo2", objects: [{ oid: "keep", dx: 0.1, dy: 0 }] }),
      nested(3_000_000, { e: "dlos", ids: ["drop"] }),
    ]]);
    const vis = visibleStrokes(tl, 4_000, "blank");
    assert.equal(vis.length, 1);
    assert.equal(vis[0]?.oid, "keep");
    assert.ok(Math.abs(vis[0]!.p[0]! - 0.3) < 1e-9);
  });

  it("pdo2 path.copyId pastes a clone onto the dest slide with baked scale/shift", () => {
    const nested = (t: number, id: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      nested(1_000_000, 1, { e: "d", p: { x: 0.2, y: 0.4, oid: "src" } }),
      nested(1_100_000, 1, { e: "u", p: { x: 0.6, y: 0.4 } }),
      ev("dcn", 2_000_000, { e: "as", i: 2, uid: "s1", bc: "#202022" }),
      ev("dcn", 2_010_000, { e: "sc", s: 2 }),
      nested(2_100_000, 2, {
        e: "pdo2",
        path: {
          copyId: "src",
          pasteId: "dst",
          sx: 0.5,
          sy: 1,
          dx: 0.1,
          dy: 0,
          shx: 0,
          shy: 0,
          eraserPaths: [],
        },
      }),
    ]]);
    const orig = visibleStrokes(tl, 3_000, "s0");
    assert.equal(orig.length, 1);
    assert.equal(orig[0]?.oid, "src");
    assert.equal(orig[0]?.p[0], 0.2);
    assert.equal(visibleStrokes(tl, 2_050, "s1").length, 0);
    const pasted = visibleStrokes(tl, 3_000, "s1");
    assert.equal(pasted.length, 1);
    assert.equal(pasted[0]?.oid, "dst");
    assert.ok(Math.abs(pasted[0]!.p[0]! - 0.2) < 1e-9);
    assert.ok(Math.abs(pasted[0]!.p[1]! - 0.4) < 1e-9);
    assert.ok(Math.abs(pasted[0]!.p[2]! - 0.4) < 1e-9);
  });

  it("pdo2 copy with identity transform still clones onto a new page", () => {
    const nested = (t: number, id: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      nested(1_000_000, 1, { e: "d", p: { x: 0.3, y: 0.3, oid: "tri" } }),
      nested(1_100_000, 1, { e: "u", p: { x: 0.5, y: 0.5 } }),
      ev("dcn", 2_000_000, { e: "as", i: 2, uid: "s1" }),
      ev("dcn", 2_010_000, { e: "sc", s: 2 }),
      nested(2_100_000, 2, {
        e: "pdo2",
        path: { copyId: "tri", pasteId: "tri2", sx: 1, sy: 1, dx: 0, dy: 0, eraserPaths: [] },
      }),
    ]]);
    assert.equal(visibleStrokes(tl, 3_000, "s0").length, 1);
    assert.equal(visibleStrokes(tl, 3_000, "s1").length, 1);
    assert.equal(visibleStrokes(tl, 3_000, "s1")[0]?.oid, "tri2");
  });

  it("pdo2 pasteId can be copied again, and eraserPaths clone with it", () => {
    const nested = (t: number, id: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      nested(1_000_000, 1, { e: "d", p: { x: 0.1, y: 0.1, oid: "ink" } }),
      nested(1_100_000, 1, { e: "u", p: { x: 0.2, y: 0.1 } }),
      nested(1_200_000, 1, { e: "d", p: { x: 0.15, y: 0.1, oid: "er" }, m: "eraser" }),
      nested(1_400_000, 1, { e: "u", p: { x: 0.15, y: 0.1 } }),
      ev("dcn", 2_000_000, { e: "as", i: 2, uid: "s1" }),
      ev("dcn", 2_010_000, { e: "sc", s: 2 }),
      nested(2_100_000, 2, {
        e: "pdo2",
        path: {
          copyId: "ink",
          pasteId: "ink2",
          sx: 1,
          sy: 1,
          dx: 0.05,
          dy: 0,
          eraserPaths: [{ id: "er", cloneId: "er2", sx: 1, sy: 1, dx: 0.05, dy: 0 }],
        },
      }),
      ev("dcn", 3_000_000, { e: "as", i: 3, uid: "s2" }),
      ev("dcn", 3_010_000, { e: "sc", s: 3 }),
      nested(3_100_000, 3, {
        e: "pdo2",
        path: { copyId: "ink2", pasteId: "ink3", sx: 1, sy: 1, dx: 0.05, dy: 0, eraserPaths: [] }, // from the original: 0.05 baked in ink2 + 0 new
      }),
    ]]);
    const page1 = visibleStrokes(tl, 4_000, "s1");
    assert.equal(page1.length, 2);
    assert.deepEqual(page1.map((s) => s.oid).sort(), ["er2", "ink2"]);
    const page2 = visibleStrokes(tl, 4_000, "s2");
    assert.equal(page2.length, 1);
    assert.equal(page2[0]?.oid, "ink3");
    assert.ok(Math.abs(page2[0]!.p[0]! - 0.15) < 1e-9);
  });

  it("pdo2 copy of a moved clone uses the on-screen position (affine is measured from the original)", () => {
    const nested = (t: number, id: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id, data: inner },
    });
    // Real lecture shape: a -> paste (b) on s1 -> drag b -> paste b again onto s2.
    // The 2nd paste's dx/dy is (1st paste dx/dy) + (drag dx/dy), not a delta from b.p.
    const d1 = { dx: -0.2, dy: 0.3 };
    const drag = { dx: 0.05, dy: -0.6 };
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      nested(1_000_000, 1, { e: "d", p: { x: 0.4, y: 0.7, oid: "a" } }),
      nested(1_100_000, 1, { e: "u", p: { x: 0.5, y: 0.8 } }),
      ev("dcn", 2_000_000, { e: "as", i: 2, uid: "s1" }),
      ev("dcn", 2_010_000, { e: "sc", s: 2 }),
      nested(2_100_000, 2, { e: "pdo2", path: { copyId: "a", pasteId: "b", sx: 1, sy: 1, shx: 0, shy: 0, ...d1, eraserPaths: [] } }),
      nested(2_200_000, 2, { e: "tf", t: "s", data: { ids: ["b"] } }),
      nested(2_210_000, 2, { e: "tf", t: "ts", data: { dx: 0.02, dy: -0.25 } }),
      nested(2_220_000, 2, { e: "tf", t: "ts", data: { dx: 0.03, dy: -0.35 } }),
      nested(2_230_000, 2, { e: "tf", t: "e", data: {} }),
      ev("dcn", 3_000_000, { e: "as", i: 3, uid: "s2" }),
      ev("dcn", 3_010_000, { e: "sc", s: 3 }),
      nested(3_100_000, 3, {
        e: "pdo2",
        path: { copyId: "b", pasteId: "c", sx: 1, sy: 1, shx: 0, shy: 0, dx: d1.dx + drag.dx, dy: d1.dy + drag.dy, eraserPaths: [] },
      }),
    ]]);
    const stored = tl.strokes.find((st) => st.oid === "b")!;
    const shown = visibleStrokes(tl, 2_500, "s1").find((st) => st.oid === "b")!;
    const c = visibleStrokes(tl, 4_000, "s2").find((st) => st.oid === "c")!;
    assert.ok(c);
    // stored b = a + first paste; on screen it is also moved by the drag.
    assert.ok(Math.abs(stored.p[0]! - (0.4 + d1.dx)) < 1e-9);
    const drift = affineAt(tl, 2_500, "b");
    assert.ok(Math.abs(drift.dx - drag.dx) < 1e-9);
    assert.ok(Math.abs(drift.dy - drag.dy) < 1e-9);
    // c must land exactly where b was on screen when it was copied.
    assert.ok(Math.abs(c.p[0]! - shown.p[0]!) < 1e-9, `x ${c.p[0]} vs ${shown.p[0]}`);
    assert.ok(Math.abs(c.p[1]! - shown.p[1]!) < 1e-9, `y ${c.p[1]} vs ${shown.p[1]}`);
    assert.ok(Math.abs(c.p[0]! - (0.4 + d1.dx + drag.dx)) < 1e-9);
    assert.ok(Math.abs(c.p[1]! - (0.7 + d1.dy + drag.dy)) < 1e-9);
  });

  it("pdo2 copy of a clone with the usual paste nudge lands one nudge from the source, not two", () => {
    const nested = (t: number, id: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id, data: inner },
    });
    const nudge = { dx: 0.023, dy: 0.04 };
    const first = { dx: -0.2, dy: 0.3 };
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      nested(1_000_000, 1, { e: "d", p: { x: 0.4, y: 0.7, oid: "a" } }),
      nested(1_100_000, 1, { e: "u", p: { x: 0.5, y: 0.8 } }),
      ev("dcn", 2_000_000, { e: "as", i: 2, uid: "s1" }),
      ev("dcn", 2_010_000, { e: "sc", s: 2 }),
      nested(2_100_000, 2, { e: "pdo2", path: { copyId: "a", pasteId: "b", sx: 1, sy: 1, shx: 0, shy: 0, ...first, eraserPaths: [] } }),
      ev("dcn", 3_000_000, { e: "as", i: 3, uid: "s2" }),
      ev("dcn", 3_010_000, { e: "sc", s: 3 }),
      // b is pasted again with the nudge: Unacademy sends first + nudge (from the original).
      nested(3_100_000, 3, {
        e: "pdo2",
        path: { copyId: "b", pasteId: "c", sx: 1, sy: 1, shx: 0, shy: 0, dx: first.dx + nudge.dx, dy: first.dy + nudge.dy, eraserPaths: [] },
      }),
    ]]);
    const b = visibleStrokes(tl, 4_000, "s1").find((st) => st.oid === "b")!;
    const c = visibleStrokes(tl, 4_000, "s2").find((st) => st.oid === "c")!;
    assert.ok(Math.abs(c.p[0]! - (b.p[0]! + nudge.dx)) < 1e-9, `x ${c.p[0]} vs ${b.p[0]! + nudge.dx}`);
    assert.ok(Math.abs(c.p[1]! - (b.p[1]! + nudge.dy)) < 1e-9, `y ${c.p[1]} vs ${b.p[1]! + nudge.dy}`);
    assert.ok(Math.abs(c.p[0]! - (0.4 + first.dx + nudge.dx)) < 1e-9);
  });

  it("eraserPaths clone of an already-pasted eraser uses the original, not a second offset", () => {
    const nested = (t: number, id: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id, data: inner },
    });
    const first = { sx: 1, sy: 1, shx: 0, shy: 0, dx: 0.05, dy: 0 };
    const again = { sx: 1, sy: 1, shx: 0, shy: 0, dx: 0.07, dy: 0 };
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      nested(1_000_000, 1, { e: "d", p: { x: 0.15, y: 0.2, oid: "er" }, m: "eraser" }),
      nested(1_100_000, 1, { e: "u", p: { x: 0.15, y: 0.2 } }),
      ev("dcn", 2_000_000, { e: "as", i: 2, uid: "s1" }),
      ev("dcn", 2_010_000, { e: "sc", s: 2 }),
      nested(2_100_000, 2, {
        e: "pdo2",
        path: { copyId: "er", pasteId: "holder", ...first, eraserPaths: [{ id: "er", cloneId: "er2", ...first }] },
      }),
      ev("dcn", 3_000_000, { e: "as", i: 3, uid: "s2" }),
      ev("dcn", 3_010_000, { e: "sc", s: 3 }),
      nested(3_100_000, 3, {
        e: "pdo2",
        path: { copyId: "holder", pasteId: "holder2", ...again, eraserPaths: [{ id: "er2", cloneId: "er3", ...again }] },
      }),
    ]]);
    const er2 = tl.strokes.find((st) => st.oid === "er2")!;
    const er3 = tl.strokes.find((st) => st.oid === "er3")!;
    assert.ok(er2 && er3);
    assert.ok(Math.abs(er2.p[0]! - 0.2) < 1e-9, `er2 ${er2.p[0]}`);
    // 0.15 + 0.07. The old path added 0.07 on top of er2 and landed at 0.27.
    assert.ok(Math.abs(er3.p[0]! - 0.22) < 1e-9, `er3 ${er3.p[0]}`);
    assert.ok(Math.abs(er3.p[1]! - 0.2) < 1e-9);
  });

  it("rotates selected ink around the handle (tf r), incremental", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 0.5, y: 0.2, oid: "ink" } }),
      nested(1_100_000, { e: "u", p: { x: 0.5, y: 0.2 } }),
      nested(2_000_000, { e: "tf", t: "s", data: { ids: ["ink"] } }),
      nested(2_100_000, { e: "tf", t: "r", data: { dg: 90, cx: 0.5, cy: 0.5 } }),
      nested(2_200_000, { e: "tf", t: "e", data: {} }),
    ]]);
    const st = visibleStrokes(tl, 3_000, "blank")[0]!;
    assert.ok(Math.abs(st.p[0]! - 0.8) < 1e-9, `x ${st.p[0]}`);
    assert.ok(Math.abs(st.p[1]! - 0.5) < 1e-9, `y ${st.p[1]}`);
  });

  it("pdo v1 paths paste full strokes onto the dest page", () => {
    const nested = (t: number, id: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      nested(1_000_000, 1, { e: "d", p: { x: 0.1, y: 0.1, oid: "src" } }),
      nested(1_100_000, 1, { e: "u", p: { x: 0.2, y: 0.2 } }),
      ev("dcn", 2_000_000, { e: "as", i: 2, uid: "s1" }),
      ev("dcn", 2_010_000, { e: "sc", s: 2 }),
      nested(2_100_000, 2, {
        e: "pdo",
        paths: [{
          id: "dst",
          copyId: "src",
          mode: "marker",
          strokeColor: "#fff",
          strokeSize: 0.5,
          ppts: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }],
          shift: { sx: 1, sy: 1, dx: 0.05, dy: 0, shx: 0, shy: 0 },
        }],
      }),
    ]]);
    assert.equal(visibleStrokes(tl, 3_000, "s0").length, 1);
    const pasted = visibleStrokes(tl, 3_000, "s1");
    assert.equal(pasted.length, 1);
    assert.equal(pasted[0]?.oid, "dst");
    assert.ok(Math.abs(pasted[0]!.p[0]! - 0.15) < 1e-9);
  });

  it("cio with src/sp/ep is a photo on the board, not a new slide", () => {
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      {
        plugin: "cw",
        p_time: 2_000_000,
        data: {
          id: 1,
          data: {
            e: "cio",
            oid: "pic",
            src: "https://uadoc.uacdn.net/live_class/x/shot.png",
            sp: { x: 0.1, y: 0.2 },
            ep: { x: 0.4, y: 0.5 },
          },
        },
      },
    ]]);
    assert.equal(tl.slides.filter((s) => s.uid !== "blank").length, 1);
    assert.equal(tl.images.length, 1);
    assert.equal(visibleImages(tl, 3_000, "s0").length, 1);
    assert.equal(tl.images[0]?.oid, "pic");
    assert.equal(tl.images[0]?.uid, "s0");
    assert.equal(tl.images[0]?.x0, 0.1);
    assert.equal(tl.images[0]?.y1, 0.5);
    assert.match(tl.images[0]?.url || "", /\/api\/slide\?u=/);
  });

  it("rs rotates the slide 90° at a time", () => {
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      { plugin: "cw", p_time: 2_000_000, data: { id: 1, data: { e: "rs" } } },
      { plugin: "cw", p_time: 3_000_000, data: { id: 1, data: { e: "rs" } } },
    ]]);
    const cam = camAt(tl, 4_000, "s0");
    assert.equal(cam.r, 180);
  });

  it("accepts liveweb rotate aliases (degree / centerX)", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 0.5, y: 0.2, oid: "ink" } }),
      nested(1_100_000, { e: "u", p: { x: 0.5, y: 0.2 } }),
      nested(2_000_000, { e: "tf", t: "s", data: { ids: ["ink"] } }),
      nested(2_100_000, { e: "tf", t: "r", data: { degree: 90, centerX: 0.5, centerY: 0.5 } }),
    ]]);
    const st = visibleStrokes(tl, 3_000, "blank")[0]!;
    assert.ok(Math.abs(st.p[0]! - 0.8) < 1e-9, `x ${st.p[0]}`);
    assert.ok(Math.abs(st.p[1]! - 0.5) < 1e-9, `y ${st.p[1]}`);
  });

  it("applies scale matrix dx and shear from liveweb sl.m", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      nested(1_000_000, { e: "d", p: { x: 0.2, y: 0.2, oid: "ink" } }),
      nested(1_100_000, { e: "u", p: { x: 0.2, y: 0.2 } }),
      nested(2_000_000, { e: "tf", t: "s", data: { ids: ["ink"] } }),
      nested(2_100_000, { e: "tf", t: "sl", data: { sx: 1, sy: 1, m: { sx: 1, sy: 1, shx: 0, shy: 0, dx: 0.1, dy: 0 } } }),
    ]]);
    const st = visibleStrokes(tl, 3_000, "blank")[0]!;
    assert.ok(Math.abs(st.p[0]! - 0.3) < 1e-9, `x ${st.p[0]}`);
    assert.ok(Math.abs(st.p[1]! - 0.2) < 1e-9, `y ${st.p[1]}`);
  });

  it("moves the omitted tail of a paste when the drag names almost every stroke", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const events: ReturnType<typeof nested>[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(nested(1_000_000 + i, { e: "d", p: { x: 0.1 * i, y: 0.2, oid: `s${i}` } }));
      events.push(nested(1_100_000 + i, { e: "u", p: { x: 0.1 * i, y: 0.2 } }));
      events.push(nested(2_000_000 + i, {
        e: "pdo2",
        aId: "batch",
        path: { copyId: `s${i}`, pasteId: `p${i}`, sx: 1, sy: 1, dx: 0, dy: 0 },
      }));
    }
    events.push(nested(3_000_000, { e: "tf", t: "s", data: { ids: Array.from({ length: 9 }, (_, i) => `p${i}`) } }));
    events.push(nested(3_100_000, { e: "tf", t: "ts", data: { dx: -0.18, dy: 0 } }));
    const moved = visibleStrokes(compactEvents("LESSON", [events]), 4_000, "blank").find((s) => s.oid === "p9");
    assert.ok(moved);
    assert.ok(Math.abs(moved.p[0]! - 0.72) < 1e-9, `tail x ${moved.p[0]}`);

    const partial = events.slice(0, -2);
    partial.push(nested(3_000_000, { e: "tf", t: "s", data: { ids: ["p0", "p1"] } }));
    partial.push(nested(3_100_000, { e: "tf", t: "ts", data: { dx: -0.18, dy: 0 } }));
    const left = visibleStrokes(compactEvents("LESSON", [partial]), 4_000, "blank").find((s) => s.oid === "p9");
    assert.ok(left);
    assert.ok(Math.abs(left.p[0]! - 0.9) < 1e-9, `untouched x ${left.p[0]}`);
  });

  it("cio uses Unacademy imgSrc/objectId/startPoint and pg is a board gif", () => {
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" }),
      ev("dcn", 1_000, { e: "sc", s: 1 }),
      {
        plugin: "cw",
        p_time: 2_000_000,
        data: {
          id: 1,
          data: {
            e: "cio",
            objectId: "pic2",
            imgSrc: "https://uadoc.uacdn.net/live_class/x/shot.png",
            startPoint: { x: 0.2, y: 0.2 },
            endPoint: { x: 0.5, y: 0.6 },
          },
        },
      },
      {
        plugin: "cw",
        p_time: 3_000_000,
        data: {
          id: 1,
          data: {
            e: "pg",
            imgSrc: "https://uadoc.uacdn.net/live_class/x/sticker.gif",
            startPoint: { x: 0.6, y: 0.6 },
            endPoint: { x: 0.8, y: 0.8 },
          },
        },
      },
    ]]);
    assert.equal(tl.images.length, 2);
    assert.equal(visibleImages(tl, 4_000, "s0").length, 2);
    assert.equal(tl.images[0]?.oid, "pic2");
    assert.equal(tl.images[1]?.oid, "pg_3000");
  });

  it("draws circle, arrow and dashed-line tools", () => {
    const nested = (t: number, inner: Record<string, unknown>) => ({
      plugin: "cw",
      p_time: t,
      data: { id: 0, data: inner },
    });
    const tl = compactEvents("LESSON", [[
      ev("dcn", 0, { e: "mc", m: "circle" }),
      nested(1_000_000, { e: "d", p: { x: 0.2, y: 0.2, oid: "c" } }),
      nested(1_100_000, { e: "u", p: { x: 0.4, y: 0.5 } }),
      ev("dcn", 2_000_000, { e: "mc", m: "arrow" }),
      nested(2_100_000, { e: "d", p: { x: 0.1, y: 0.1, oid: "a" } }),
      nested(2_200_000, { e: "u", p: { x: 0.3, y: 0.3 } }),
      ev("dcn", 3_000_000, { e: "mc", m: "dashed-line" }),
      nested(3_100_000, { e: "d", p: { x: 0.5, y: 0.1, oid: "d" } }),
      nested(3_200_000, { e: "u", p: { x: 0.8, y: 0.1 } }),
    ]]);
    const vis = visibleStrokes(tl, 4_000, "blank");
    assert.deepEqual(vis.map((s) => s.m).sort(), ["arrow", "circle", "dashed_line"]);
  });
});



