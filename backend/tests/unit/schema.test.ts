import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCHEMA_TIMEOUT_SQL,
  applySchema,
  formatSchemaSummary,
  schemaClientConfig,
} from "../../src/repositories/postgres/schema.ts";

describe("schema setup", () => {
  it("uses a session timeout on a client that is not limited to 4s", () => {
    const cfg = schemaClientConfig("postgresql://user:password@localhost:5432/inkboard");
    assert.equal(cfg.statement_timeout, 30_000);
    assert.equal("query_timeout" in cfg, false);
    assert.equal(SCHEMA_TIMEOUT_SQL, "SET statement_timeout = '30s'");
    assert.doesNotMatch(SCHEMA_TIMEOUT_SQL, /LOCAL/);
  });

  it("logs one summary of what was created and what was skipped", async () => {
    const seen: string[] = [];
    const report = await applySchema({
      query: async (sql: string) => {
        seen.push(sql);
        if (/pg_trgm|media_probe/.test(sql)) throw new Error("denied");
      },
    });
    assert.ok(report.created.includes("upstream_cache"));
    assert.ok(report.created.includes("upstream_cache.swr_gen"));
    assert.ok(report.skipped.some((line) => line.startsWith("media_probe")));
    assert.ok(report.skipped.some((line) => line.startsWith("pg_trgm")));
    assert.ok(report.skipped.some((line) => line.includes("catalog_search_title_trgm")));
    assert.equal(seen.some((sql) => /SET LOCAL/.test(sql)), false);
    assert.equal(seen.some((sql) => /create table if not exists jobs\b/.test(sql)), false);
    const line = formatSchemaSummary(report.created, report.skipped);
    assert.match(line, /^\[schema\] created: .+; skipped: .+$/);
    assert.equal(line.split("[schema]").length, 2);
  });

  it("reports a step as created only when it ran, and keeps the skip message", async () => {
    const report = await applySchema({
      query: async (sql: string) => {
        if (sql.includes("upstream_cache_expires_idx")) throw new Error("must be owner");
      },
    });
    assert.equal(report.created.includes("upstream_cache_expires_idx"), false);
    assert.ok(report.created.includes("upstream_cache"));
    const skipped = report.skipped.find((line) => line.startsWith("upstream_cache_expires_idx"));
    assert.equal(skipped, "upstream_cache_expires_idx (must be owner)");
    const summary = formatSchemaSummary(
      [...report.created, "upstream_cache_expires_idx"],
      report.skipped,
    );
    const createdPart = summary.split(";")[0] ?? "";
    assert.doesNotMatch(createdPart, /upstream_cache_expires_idx/);
    assert.match(summary, /skipped:.*upstream_cache_expires_idx \(must be owner\)/);
  });
});
