import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { budgetReport, checkBudget, TOTAL } from "../../scripts/bundle-budget.mjs";

describe("bundle budget", () => {
  it("counts the entry graph as first load and every js file as the total", () => {
    const root = mkdtempSync(join(tmpdir(), "ink-budget-"));
    const assets = join(root, "assets");
    mkdirSync(assets);
    writeFileSync(join(assets, "entry.js"), "a".repeat(1000));
    writeFileSync(join(assets, "shared.js"), "b".repeat(2000));
    writeFileSync(join(assets, "lazy.js"), "c".repeat(4000));
    writeFileSync(
      join(root, "manifest.json"),
      JSON.stringify({
        "index.html": { file: "assets/entry.js", isEntry: true, imports: ["shared.js"] },
        "shared.js": { file: "assets/shared.js" },
        "lazy.js": { file: "assets/lazy.js", isDynamicEntry: true },
      }),
    );
    const result = checkBudget(root);
    assert.equal(result.firstLoad, 3000);
    assert.equal(result.total, 7000);
    assert.equal(result.ok, true);
  });

  it("fails when first load is over the cap even if the total is not", () => {
    const root = mkdtempSync(join(tmpdir(), "ink-budget-big-"));
    writeFileSync(join(root, "app.js"), "x".repeat(1_600_001));
    writeFileSync(join(root, "index.html"), '<script type="module" src="./app.js"></script>');
    const result = checkBudget(root);
    assert.equal(result.firstLoad, 1_600_001);
    assert.equal(result.ok, false);
  });

  it("counts shell plus home from a nested TanStack manifest and ignores other routes", () => {
    const root = mkdtempSync(join(tmpdir(), "ink-budget-start-"));
    const staticDir = join(root, ".vercel", "output", "static");
    const assets = join(staticDir, "assets");
    const manifestDir = join(
      root,
      ".vercel",
      "output",
      "functions",
      "__server.func",
      ".vercel",
      "output",
      "static",
      "assets",
    );
    mkdirSync(assets, { recursive: true });
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(join(assets, "shell.js"), "s".repeat(100));
    writeFileSync(join(assets, "home.js"), "h".repeat(50));
    writeFileSync(join(assets, "lazy.js"), "l".repeat(80));
    writeFileSync(
      join(manifestDir, "_tanstack-start-manifest_abc.mjs"),
      [
        "export default {",
        "\t__root__: {",
        '\t\tassets: ["/assets/shell.js"]',
        "\t},",
        '\t"/": {',
        '\t\tassets: ["/assets/shell.js", "/assets/home.js"]',
        "\t},",
        '\t"/play/$id": {',
        '\t\tassets: ["/assets/lazy.js"]',
        "\t}",
        "}",
        "",
      ].join("\n"),
    );
    const result = checkBudget(staticDir);
    assert.equal(result.firstLoad, 150);
    assert.equal(result.total, 230);
    assert.equal(result.ok, true);
  });

  it("warns and still enforces the total when first load cannot be measured", () => {
    const root = mkdtempSync(join(tmpdir(), "ink-budget-miss-"));
    writeFileSync(join(root, "lazy.js"), "x".repeat(32));
    const loose = checkBudget(root, {});
    assert.equal(loose.firstLoad, 0);
    assert.equal(loose.ok, true);
    const warned = budgetReport(loose, {});
    assert.equal(warned.fail, false);
    assert.equal(warned.lines[0]?.[0], "warn");
    assert.match(String(warned.lines[0]?.[1]), /Enforcing the total only/);

    assert.equal(checkBudget(root, { CI: "1" }).ok, true);
    assert.equal(budgetReport(loose, { CI: "1" }).fail, false);
    assert.equal(budgetReport(loose, { CI: "true" }).lines[0]?.[0], "warn");
    const strict = budgetReport(loose, { BUDGET_STRICT: "1" });
    assert.equal(strict.fail, true);
    assert.equal(strict.lines[0]?.[0], "error");

    writeFileSync(join(root, "big.js"), "x".repeat(TOTAL + 1));
    const over = checkBudget(root, {});
    assert.equal(over.firstLoad, 0);
    assert.equal(over.ok, false);
    assert.ok(budgetReport(over, {}).lines.some((line) => line[0] === "error" && /Total bundle budget/.test(line[1] ?? "")));
  });

  it("turns strict mode on only for the CI budget step, not the Vercel build", () => {
    const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
    const budget = ci.slice(ci.indexOf("frontend build"));
    assert.match(budget, /BUDGET_STRICT:\s*"1"/);
    assert.doesNotMatch(ci.slice(0, ci.indexOf("frontend build")), /BUDGET_STRICT/);
    const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
    const pkg = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    assert.doesNotMatch(vercel, /BUDGET_STRICT/);
    assert.doesNotMatch(pkg, /BUDGET_STRICT/);
  });
});
