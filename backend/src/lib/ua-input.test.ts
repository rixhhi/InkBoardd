import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BatchScheduleInput,
  ClassDetailInput,
  LiveSlideInput,
  CourseDetailInput,
  EducatorPageInput,
  ExamHubInput,
  SearchEducatorsInput,
  TestSeriesItemsInput,
} from "@inkboard/shared/ua-input";

describe("Unacademy server-fn inputs", () => {
  it("accepts a teacher page and clamps offset", () => {
    const d = EducatorPageInput.parse({ username: "agsir", offset: 9999, sort: "popular" });
    assert.equal(d.username, "agsir");
    assert.equal(d.offset, 500);
    assert.equal(d.sort, "popular");
  });

  it("rejects a short search and an unknown exam", () => {
    assert.throws(() => SearchEducatorsInput.parse({ q: "a" }), /2 characters/);
    assert.throws(() => ExamHubInput.parse({ goalId: "not-an-exam" }), /Unknown exam/);
  });

  it("keeps optional slug/teacher empty as undefined", () => {
    const d = CourseDetailInput.parse({ uid: "ABCD1234", slug: "  ", teacher: "" });
    assert.equal(d.uid, "ABCD1234");
    assert.equal(d.slug, undefined);
    assert.equal(d.teacher, undefined);
  });

  it("class id must be 4–16 alphanumerics", () => {
    assert.throws(() => ClassDetailInput.parse({ uid: "ab" }), /Invalid class id/);
    const d = ClassDetailInput.parse({ uid: "U1791Z3MHK6" });
    assert.equal(d.slug, "u1791z3mhk6");
    const slide = LiveSlideInput.parse({
      uid: "J8OT6NOW",
      className: "Ask me anything about Neet ug",
      educatorName: "Ajay Mishra (Akm)",
      special: true,
    });
    assert.equal(slide.theme, "LIGHT_THEME");
    assert.equal(slide.className, "Ask me anything about Neet ug");
    assert.equal(slide.special, true);
  });

  it("batch schedule rank is only kept when finite", () => {
    const d = BatchScheduleInput.parse({ uid: "BATCH01", past: 1, rank: 12 });
    assert.equal(d.past, true);
    assert.equal(d.rank, 12);
    assert.equal(BatchScheduleInput.parse({ uid: "BATCH01", rank: "12" }).rank, undefined);
  });

  it("test series uid is a course-like id", () => {
    assert.equal(TestSeriesItemsInput.parse({ uid: "635S57NH" }).uid, "635S57NH");
    assert.throws(() => TestSeriesItemsInput.parse({ uid: "x" }), /Invalid test series id/);
  });
});
