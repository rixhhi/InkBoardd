import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paperMatches, papersCaption, papersForExam, strikePapers } from "@inkboard/shared/exam-papers";

describe("struck syllabus", () => {
  it("lists GATE CS papers and strikes TOC from a watched title", () => {
    const papers = papersForExam("NVLIA");
    assert.ok(papers.some((p) => p.id === "toc"));
    const rows = strikePapers(papers, ["Theory of Computation — Part I", "Counting Techniques"]);
    const toc = rows.find((p) => p.id === "toc");
    const cn = rows.find((p) => p.id === "cn");
    assert.equal(toc?.struck, true);
    assert.equal(cn?.struck, false);
    assert.match(papersCaption(rows), /1 of \d+ struck/);
  });

  it("does not strike CN from a maths class, and hits CN from a networks title", () => {
    const papers = papersForExam("NVLIA");
    const cn = papers.find((p) => p.id === "cn")!;
    assert.equal(paperMatches(cn, "Probability Theory – Part VII"), false);
    assert.equal(paperMatches(cn, "Computer Networks For LT GRADE"), true);
    assert.equal(paperMatches(cn, "50 GATE PYQs on SQL"), false);
    const db = papers.find((p) => p.id === "db")!;
    assert.equal(paperMatches(db, "50 GATE PYQs on SQL & Relational Algebra"), true);
  });

  it("skips exams without a paper list", () => {
    assert.deepEqual(papersForExam("XNDUS"), []);
    assert.ok(papersForExam("TMUVD").length > 4);
    assert.ok(papersForExam("KSCGY").some((p) => p.id === "polity"));
    assert.ok(papersForExam("NVLIA").some((p) => p.id === "ga"));
    assert.ok(papersForExam("TGAUE").length > 4);
  });
});
