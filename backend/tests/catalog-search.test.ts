import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { findCatalog, forgetCatalog, rememberCatalog, trigramEnabled } from "../src/repositories/postgres/catalog-search.ts";
import { postgresConfigured } from "../src/repositories/postgres/client.ts";

const ids = ["zz-fts-gauss", "zz-fts-mole", "zz-fts-cell"];

describe("catalog full text", () => {
  after(async () => {
    if (!postgresConfigured()) return;
    await forgetCatalog(ids);
  });

  it("ranks a title match ahead of a topic match", async () => {
    if (!postgresConfigured()) return;
    await rememberCatalog([
      { id: ids[0]!, title: "Optics bench", topic: "Gauss law notes", educator: "ada", href: "/teacher/ada" },
      { id: ids[1]!, title: "Gauss law", topic: "electrostatics", educator: "ada", href: "/teacher/ada" },
      { id: ids[2]!, title: "Cell division", topic: "biology", educator: "gauss", href: "/teacher/gauss" },
    ]);
    const hits = await findCatalog("gauss");
    const mine = hits.filter((hit) => ids.includes(hit.id));
    assert.ok(mine.length >= 2);
    assert.equal(mine[0]?.id, ids[1]);
    const fuzzy = await trigramEnabled();
    assert.equal(typeof fuzzy, "boolean");
  });
});
