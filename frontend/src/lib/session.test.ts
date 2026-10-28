import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fmtMinutes, shareHref } from "./session.ts";
import { safeNext } from "../pages/auth-page.tsx";

describe("session helpers", () => {
  it("only follows same-site paths after sign-in", () => {
    assert.equal(safeNext("/course/ABC"), "/course/ABC");
    for (const bad of ["https://evil.example", "//evil.example", "/\\\\evil.example", "/login", "/setup", 42, undefined]) assert.equal(safeNext(bad), "/", String(bad));
  });
  it("links each share to its page", () => {
    assert.deepEqual(shareHref({ kind: "exam", ref: "TMUVD", label: "" }), { to: "/exam/$goalId", params: { goalId: "TMUVD" } });
    assert.equal(shareHref({ kind: "lesson", ref: "ABCDEFGH", label: "Kinematics" }).search?.title, "Kinematics");
  });
  it("formats minutes", () => {
    assert.equal(fmtMinutes(90), "2 min");
    assert.equal(fmtMinutes(3 * 3600 + 600), "3h 10m");
  });
});
