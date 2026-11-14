import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectPages } from "./paged.ts";

type Page = { results: number[]; next: string | null };

function site(pages: Page[]) {
  const asked: string[] = [];
  return {
    asked,
    fetchPage: async (url: string) => {
      asked.push(url);
      return pages[Number(url.slice(1))] ?? null;
    },
  };
}

const rows = (p: unknown) => (p as Page).results;
const next = (p: unknown) => (p as Page).next;

describe("collectPages", () => {
  it("returns just the first page when there is no next link", async () => {
    const s = site([]);
    const out = await collectPages({ first: { results: [1, 2], next: null }, rows, next, fetchPage: s.fetchPage, maxPages: 5, budgetMs: 1000 });
    assert.deepEqual(out.rows, [1, 2]);
    assert.equal(out.pages, 1);
    assert.equal(out.truncated, false);
    assert.deepEqual(s.asked, []);
  });

  it("follows next links in order and concatenates rows", async () => {
    const s = site([
      { results: [3, 4], next: "p1" },
      { results: [5], next: null },
    ]);
    const first = { results: [1, 2], next: "p0" };
    const out = await collectPages({ first, rows, next, fetchPage: s.fetchPage, maxPages: 9, budgetMs: 1000 });
    assert.deepEqual(out.rows, [1, 2, 3, 4, 5]);
    assert.equal(out.pages, 3);
    assert.deepEqual(s.asked, ["p0", "p1"]);
  });

  it("stops at maxPages", async () => {
    const forever = async () => ({ results: [9], next: "again" });
    const out = await collectPages({ first: { results: [0], next: "again" }, rows, next, fetchPage: forever, maxPages: 4, budgetMs: 1000 });
    assert.equal(out.pages, 4);
    assert.equal(out.rows.length, 4);
  });

  it("drops later pages once the time budget is spent but keeps what it has", async () => {
    let t = 0;
    const slow = async () => {
      t += 4000; // every page costs 4s of the fake clock
      return { results: [7], next: "more" };
    };
    const out = await collectPages({
      first: { results: [0], next: "more" },
      rows,
      next,
      fetchPage: slow,
      maxPages: 12,
      budgetMs: 6000,
      now: () => t,
    });
    // page 2 is fetched at t=0 (within budget), page 3 at t=4000 (within), page 4 at t=8000 (over)
    assert.equal(out.pages, 3);
    assert.equal(out.truncated, true);
    assert.deepEqual(out.rows, [0, 7, 7]);
  });

  it("treats a failed page as the end of the listing", async () => {
    const boom = async () => {
      throw new Error("502");
    };
    const out = await collectPages({ first: { results: [1], next: "x" }, rows, next, fetchPage: boom, maxPages: 5, budgetMs: 1000 });
    assert.deepEqual(out.rows, [1]);
    assert.equal(out.truncated, false);
  });
});
