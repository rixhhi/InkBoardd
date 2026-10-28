import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogSignal } from "./catalog-signal.ts";

describe("catalog signal", () => {
  it("treats a loaded course as fine, and a failed course as down", () => {
    assert.equal(catalogSignal("/api/courses/D7C5BI9I", true, 200), "ok");
    assert.equal(catalogSignal("/api/courses/D7C5BI9I", false, 502), "down");
    assert.equal(catalogSignal("/api/courses/D7C5BI9I", false, 404), "ignore");
  });

  it("does not raise the banner when a later lesson page fails", () => {
    assert.equal(catalogSignal("/api/courses/D7C5BI9I/lessons?offset=50", false, 502), "ignore");
    assert.equal(catalogSignal("/api/lessons/abc/probe", false, 502), "ignore");
    assert.equal(catalogSignal("/api/lessons/abc/timeline", true, 200), "ok");
  });
});
