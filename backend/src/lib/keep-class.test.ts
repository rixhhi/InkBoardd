import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("Keep this class is reachable", () => {
  it("wires the player, shelf, ledger, and Write Line", () => {
    const player = src("../../../frontend/src/components/class-player.tsx");
    const more = src("../../../frontend/src/components/player-transport.tsx");
    const course = ["course-page.tsx", "course/catalog-shelf.tsx", "course/live-shelf.tsx"].map((f) => src(`../../../frontend/src/pages/${f}`)).join("\n");
    const ledger = src("../../../frontend/src/components/folio/ledger.tsx");
    const palette = src("../../../shared/src/lib/command-palette.ts");
    const locker = src("../../../frontend/src/components/notes-locker.tsx");
    // The tray row in the transport opens the dialog the player renders.
    assert.match(more, /id: "keep", label: COPY\.keepThisClass[\s\S]{0,80}onSelect: \(\) => setKeepOpen\(true\)/);
    assert.match(player, /SaveClassDialog/);
    assert.match(player, /onClose=\{\(\) => setKeepOpen\(false\)\}/);
    assert.match(course, /SaveClassButton/);
    assert.match(course, /variant="line"/);
    assert.match(ledger, /COPY\.savedClasses/);
    assert.match(ledger, /to="\/offline"/);
    assert.match(palette, /offline saved classes/);
    assert.match(locker, /COPY\.notesArePdfs/);
  });
});
