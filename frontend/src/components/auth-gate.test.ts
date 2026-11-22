import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gateView } from "./auth-gate.tsx";
import { ApiError } from "../lib/api-client.ts";

const base = { hasData: false, isError: false, error: null as unknown, failedBefore: false };

describe("sign-in gate view", () => {
  it("waits only for the first answer", () => {
    assert.equal(gateView(base), "waiting");
  });
  it("is ready as soon as the server has said who is signed in", () => {
    assert.equal(gateView({ ...base, hasData: true }), "ready");
    assert.equal(gateView({ ...base, hasData: true, failedBefore: true }), "ready");
  });
  it("shows the error screen, not the spinner, when the server answers 5xx", () => {
    const error = new ApiError(500, "Something went wrong", "INTERNAL");
    assert.equal(gateView({ ...base, isError: true, error }), "down");
    assert.equal(gateView({ ...base, isError: true, error: new ApiError(503, "x", "AUTH_DB_UNAVAILABLE") }), "down");
    assert.equal(gateView({ ...base, isError: true, error: new ApiError(0, "x", "TIMEOUT") }), "down");
  });
  it("stays on the error screen while a retry is running (no flicker back to the spinner)", () => {
    const error = new ApiError(500, "x", "INTERNAL");
    assert.equal(gateView({ ...base, isError: false, error: null, failedBefore: true }), "down");
    assert.equal(gateView({ ...base, isError: false, error, failedBefore: true }), "down");
  });
  it("lets pages render when the browser is offline", () => {
    assert.equal(gateView({ ...base, isError: true, error: new ApiError(0, "x", "NETWORK") }), "offline");
  });
});
