import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  crashFromCourse,
  crashPlateCaption,
  isCrashName,
  mergeCrashDoors,
  parseBatchHref,
  parseCrashBanner,
  tidyCrashName,
} from "@inkboard/shared/crash-doors";

describe("crash doors", () => {
  it("keeps one-shot names and drops year-long batches", () => {
    assert.equal(isCrashName("Crash Course : Batch for GATE CSIT"), true);
    assert.equal(isCrashName("Final Strike CS"), true);
    assert.equal(isCrashName("CN One Shot"), true);
    assert.equal(isCrashName("Foundation Batch for GATE 2028"), false);
    assert.equal(isCrashName("Complete GATE CS syllabus"), false);
  });

  it("pulls batch uid from Unacademy store links", () => {
    assert.deepEqual(
      parseBatchHref("https://unacademy.com/store/batch/crash-course-for-gate-psus-2027-csit/HM4XRD9B"),
      { slug: "crash-course-for-gate-psus-2027-csit", uid: "HM4XRD9B" },
    );
    assert.deepEqual(parseBatchHref("/batch/foundation-batch/CVJ3J71X"), {
      slug: "foundation-batch",
      uid: "CVJ3J71X",
    });
    assert.equal(parseBatchHref("https://unacademy.com/scholarship/UGST"), null);
  });

  it("parses crash banners and skips subscribe ads", () => {
    const door = parseCrashBanner({
      title: "Crash Course : Batch for ?GATE & PSU?s 2027 - CSIT",
      click_url: "https://unacademy.com/store/batch/crash-course-for-gate-psus-2027-csit/HM4XRD9B",
    });
    assert.equal(door?.uid, "HM4XRD9B");
    assert.equal(door?.kind, "batch");
    assert.equal(door?.name.includes("GATE"), true);
    assert.equal(
      parseCrashBanner({
        title: "ICONIC PRO",
        click_url: "https://unacademy.com/goal/NVLIA/subscribe?plan_type=iconic_pro",
      }),
      null,
    );
    assert.equal(tidyCrashName("Crash Course : Batch for GATE"), "Batch for GATE");
  });

  it("merges course rows without duplicating a banner batch", () => {
    const banner = parseCrashBanner({
      title: "Crash Course CSIT",
      click_url: "/store/batch/crash/HM4XRD9B",
    });
    const course = crashFromCourse({ uid: "HM4XRD9B", name: "Crash Course CSIT", slug: "crash" });
    const other = crashFromCourse({ uid: "ABCDE1", name: "CN One Shot", slug: "cn-one-shot", authorName: "Ankit" });
    const rows = mergeCrashDoors([banner, course, other, null]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.uid, "HM4XRD9B");
    assert.equal(crashPlateCaption(2), "2 crash");
  });
});
