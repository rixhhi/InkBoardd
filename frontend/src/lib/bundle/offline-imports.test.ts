import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const srcRoot = join(frontendRoot, "src");

function specs(rel: string) {
  return [...readFileSync(join(frontendRoot, rel), "utf8").matchAll(/from ["']@\/([^"']+)["']/g)].map((m) =>
    (m[1] ?? "").replace(/\.tsx?$/, ""),
  );
}

function onDisk(spec: string) {
  const base = join(srcRoot, spec);
  return existsSync(`${base}.ts`) || existsSync(`${base}.tsx`) || existsSync(base);
}

describe("offline library imports", () => {
  it("every @/ import from saved-class player lands on a src file", () => {
    const missing: string[] = [];
    for (const file of ["src/features/offline/app.tsx", "src/features/offline/player/offline-player.tsx"]) {
      for (const spec of specs(file)) {
        if (!onDisk(spec)) missing.push(`${file} → @/${spec}`);
      }
    }
    assert.deepEqual(missing, []);
  });
});
