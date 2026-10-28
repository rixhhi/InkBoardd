import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleNav } from "./nav.ts";
import { effectivePerms } from "./session.ts";

const ids = (o: Parameters<typeof visibleNav>[0]) => visibleNav(o).map((i) => i.id);
const perms = { live: true, planner: true, downloads: false, search: false, browse: false };

describe("role-aware navigation", () => {
  it("admins see every section, including Admin", () => {
    assert.deepEqual(ids({ admin: true, live: false, planner: false, browse: false }), ["home", "browse", "library", "live", "planner", "admin"]);
  });
  it("members never see Admin", () => {
    assert.ok(!ids({ admin: false, live: true, planner: true, browse: true }).includes("admin"));
  });
  it("members lose Browse unless the admin allows it", () => {
    assert.deepEqual(ids({ admin: false, live: false, planner: true, browse: false }), ["home", "library", "planner"]);
    assert.deepEqual(ids({ admin: false, live: false, planner: true, browse: true }), ["home", "browse", "library", "planner"]);
  });
  it("members lose sections the admin switched off", () => {
    assert.deepEqual(ids({ admin: false, live: true, planner: false, browse: false }), ["home", "library", "live"]);
  });
});

describe("member permissions", () => {
  it("live needs the switch and a shared exam", () => {
    assert.equal(effectivePerms({ staff: false, open: false, perms, shares: [] }).live, false);
    assert.equal(effectivePerms({ staff: false, open: false, perms, shares: [{ kind: "course" }] }).live, false);
    assert.equal(effectivePerms({ staff: false, open: false, perms, shares: [{ kind: "exam" }] }).live, true);
    assert.equal(effectivePerms({ staff: false, open: false, perms: { ...perms, live: false }, shares: [{ kind: "exam" }] }).live, false);
  });
  it("open mode turns on browse and search", () => {
    const p = effectivePerms({ staff: false, open: true, perms, shares: [] });
    assert.equal(p.browse, true);
    assert.equal(p.search, true);
    assert.equal(p.live, true);
  });
  it("staff get everything", () => {
    assert.deepEqual(effectivePerms({ staff: true, open: false, perms, shares: [] }), { live: true, planner: true, downloads: true, search: true, browse: true });
  });
});
