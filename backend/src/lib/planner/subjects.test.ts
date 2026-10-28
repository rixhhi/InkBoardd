import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  subjectHatchClass,
  subjectHatchClassFor,
  subjectIdOf,
  subjectMark,
  SUBJECT_MARK,
  subjectWash,
} from "@inkboard/shared/planner/subjects";

describe("subject palette", () => {
  it("maps common labels", () => {
    assert.equal(subjectIdOf("Physics"), "physics");
    assert.equal(subjectIdOf("GATE CS"), "cs");
    assert.equal(subjectIdOf("TOC"), "cs");
    assert.equal(subjectIdOf("DS & AI"), "cs");
    assert.equal(subjectIdOf(null), "other");
  });

  it("does not paint every GATE paper as CS", () => {
    assert.equal(subjectIdOf("GATE Civil"), "other");
    assert.equal(subjectIdOf("Organic Chemistry"), "chemistry");
    assert.equal(subjectIdOf("Electrostatics"), "physics");
    assert.equal(subjectIdOf("Electronics"), "other");
    assert.equal(subjectIdOf("Zoology"), "biology");
    assert.equal(subjectIdOf("Botany"), "biology");
  });

  it("builds a 12% wash for chips", () => {
    const wash = subjectWash("physics");
    assert.match(wash.background, /12%/);
    assert.match(wash.color, /--color-sub-physics/);
  });

  it("maps hatch classes and two-letter marks, not a rainbow", () => {
    assert.equal(subjectHatchClass("physics"), "hatch-physics");
    assert.equal(subjectHatchClass("maths"), "hatch-maths");
    assert.equal(SUBJECT_MARK.physics, "Ph");
    assert.equal(SUBJECT_MARK.chemistry, "Ch");
    assert.equal(SUBJECT_MARK.other, "·");
  });

  it("seals plates from the name, never a stray middot", () => {
    assert.equal(subjectMark("Physics"), "Ph");
    assert.equal(subjectMark("DS & AI"), "DS");
    assert.equal(subjectMark("Social Science"), "SS");
    assert.equal(subjectMark("Zoology"), "Zo");
    assert.equal(subjectMark("Botany"), "Bo");
    assert.equal(subjectMark("Mathematics"), "Ma");
    assert.equal(subjectMark("Mechanical Engineering"), "ME");
    assert.equal(subjectMark("GATE CS"), "CS");
    assert.equal(subjectMark("General Studies"), "GS");
    assert.notEqual(subjectMark("Civil Engineering"), "·");
    assert.notEqual(subjectMark("DS & AI"), "·");
  });

  it("gives every unmapped plate a hatch, not a blank tile", () => {
    assert.equal(subjectHatchClassFor("Physics"), "hatch-physics");
    assert.match(subjectHatchClassFor("Civil Engineering"), /^hatch-other(?:-[1-3])?$/);
    assert.match(subjectHatchClassFor("Social Science"), /^hatch-other(?:-[1-3])?$/);
    assert.notEqual(subjectHatchClassFor("Electronics"), "hatch-cs");
  });
});
