import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const routesDir = fileURLToPath(new URL("../../src/routes", import.meta.url));

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...routeFiles(path));
    else if (name.name.endsWith(".ts")) out.push(path);
  }
  return out;
}

describe("backend split contract", () => {
  it("route files are Fastify wiring, not TanStack Start", () => {
    const files = routeFiles(routesDir);
    assert.ok(files.some((f) => f.endsWith("catalog.ts")));
    assert.ok(files.some((f) => f.endsWith("lessons.ts")));
    assert.ok(files.some((f) => f.endsWith("live.ts")));
    assert.ok(files.some((f) => f.endsWith("media.ts")));
    assert.ok(files.some((f) => f.endsWith("jobs.ts")));
    assert.ok(files.some((f) => f.endsWith("live-board.ts")));
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /@tanstack\/react-start/, file);
      assert.doesNotMatch(src, /createServerFn/, file);
    }
  });

  it("app factory registers catalog, media, live, jobs, health", () => {
    const app = readFileSync(new URL("../../src/app.ts", import.meta.url), "utf8");
    for (const name of [
      "registerHealth",
      "registerCatalog",
      "registerLessons",
      "registerMedia",
      "registerLive",
      "registerSearch",
      "registerJobs",
    ]) {
      assert.match(app, new RegExp(name));
    }
  });

  it("jobs refuse path-like lesson ids in the route itself", () => {
    const src = readFileSync(new URL("../../src/routes/jobs.ts", import.meta.url), "utf8");
    assert.match(src, /\/api\/jobs\/lectures/);
    assert.match(src, /Invalid lesson id/);
    assert.match(src, /A-Za-z0-9_-\]\{6,40\}/);
  });
});
