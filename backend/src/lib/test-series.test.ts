import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  durationCaption,
  parseTestItem,
  parseTestItemPage,
  parseTestSeries,
  parseTestSeriesPage,
  quizCaption,
  seriesCaption,
  seriesShortName,
  sittingDate,
  testSeriesItemsUrl,
  testSeriesListUrl,
  testsPlateCaption,
} from "@inkboard/shared/test-series";

const SERIES = {
  name: "UA CSIT - GATE 2027 & 2028 Test Series by Unacademy",
  uid: "635S57NH",
  slug: "ua-csit-gate-2027-2028-test-series-by-unacademy",
  starts_at: "2025-11-20T11:30:00Z",
  ends_at: "2026-11-05T12:30:00Z",
  item_count: 51,
  next_session: {
    type: "quiz",
    properties: {
      title: "Multi-Subject Test: Theory of Computation",
      uid: "RTJ3S7W1HX",
      start_time: "2026-10-08T11:30:00Z",
    },
  },
};

const ITEM = {
  rank: 1,
  type: "quiz",
  properties: {
    title: "GATE PYQ - 2016",
    uid: "WF4G6U13MG",
    start_time: "2025-11-20T11:30:00Z",
    duration: 3600,
    num_questions: 55,
    slug: "gate-pyq-2016",
  },
};

describe("test series catalog", () => {
  it("parses a series row and a quiz item", () => {
    const s = parseTestSeries(SERIES);
    assert.equal(s?.uid, "635S57NH");
    assert.equal(s?.itemCount, 51);
    assert.equal(s?.nextUid, "RTJ3S7W1HX");
    const q = parseTestItem(ITEM);
    assert.equal(q?.uid, "WF4G6U13MG");
    assert.equal(q?.questions, 55);
    assert.equal(q?.durationSec, 3600);
  });

  it("drops junk rows and keeps unique series", () => {
    const page = parseTestSeriesPage({ results: [SERIES, SERIES, { uid: "x", name: "no" }] });
    assert.equal(page.length, 1);
    assert.equal(parseTestSeries({ uid: "ab", name: "Hi" }), null);
  });

  it("reads pagination offset from next", () => {
    const page = parseTestItemPage({
      count: 51,
      next: "https://api.unacademy.com/api/v1/uplus/programmes/635S57NH/items/?limit=20&offset=20",
      results: [ITEM],
    });
    assert.equal(page.nextOffset, 20);
    assert.equal(page.total, 51);
  });

  it("shortens series names and writes captions", () => {
    assert.equal(seriesShortName(SERIES.name), "UA CSIT - GATE 2027 & 2028");
    assert.equal(seriesCaption(parseTestSeries(SERIES)!), "51 tests");
    assert.equal(testsPlateCaption(5), "5 series");
    assert.equal(testsPlateCaption(1), "1 series");
    assert.equal(quizCaption(parseTestItem(ITEM)!), "55 Q · 1h");
    assert.equal(durationCaption(4800), "1h 20m");
  });

  it("sits a future slot on that IST day, a past slot on today", () => {
    assert.equal(sittingDate("2026-10-08T11:30:00Z", "2026-10-06"), "2026-10-08");
    assert.equal(sittingDate("2025-11-20T11:30:00Z", "2026-10-06"), "2026-10-06");
    assert.equal(sittingDate(null, "2026-10-06"), "2026-10-06");
  });

  it("lists series from the frontend API, not www", () => {
    assert.match(testSeriesListUrl("NVLIA"), /api-frontend\.unacademy\.com/);
    assert.match(testSeriesListUrl("NVLIA"), /type=1/);
    assert.match(testSeriesItemsUrl("635S57NH", 20), /programmes\/635S57NH\/items\/\?limit=20&offset=20/);
  });
});
