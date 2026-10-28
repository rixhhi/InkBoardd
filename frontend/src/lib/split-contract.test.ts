import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function src(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("frontend/backend split contract", () => {
  it("catalog client talks HTTP, not createServerFn", () => {
    const ua = src("./unacademy.ts");
    assert.match(ua, /apiJson/);
    assert.match(ua, /\/api\/exams\//);
    assert.match(ua, /\/api\/courses\//);
    assert.match(ua, /\/api\/live\/feed/);
    assert.doesNotMatch(ua, /createServerFn/);
    assert.doesNotMatch(ua, /unacademy\.com\/api/);
  });

  it("lesson client talks HTTP and rejects junk locally", () => {
    const lessons = src("./lesson-api.ts");
    assert.match(lessons, /\/api\/lessons\//);
    assert.match(lessons, /\/api\/lessons\/probe/);
    assert.match(lessons, /Invalid lesson id/);
    assert.doesNotMatch(lessons, /createServerFn/);
  });

  it("desk search is a GET wrapper that short-circuits one character", () => {
    const search = src("./jump-search.ts");
    assert.match(search, /\/api\/search\/desk/);
    assert.match(search, /q\.length < 2/);
    assert.doesNotMatch(search, /createServerFn/);
  });

  it("api client surfaces code + status", () => {
    const client = src("./api-client.ts");
    assert.match(client, /class ApiError/);
    assert.match(client, /application\/json/);
  });
});
