import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextCoursePage, rankRelatedCourses, relatedCourseScore, sheldonOffsetFromNext } from "@inkboard/shared/related-replays";

describe("related replay course ranking", () => {
  it("prefers a same-series short course over a huge comprehensive dump", () => {
    const lt = "Computer Networks For LT GRADE";
    const isro = relatedCourseScore(lt, "Computer Networks for ISRO");
    const comprehensive = relatedCourseScore(lt, "Comprehensive Course on Computer Networks");
    const pyq = relatedCourseScore(lt, "Computer Networks- GATE PYQ's");
    assert.ok(isro > comprehensive, `${isro} vs ${comprehensive}`);
    assert.ok(isro > pyq, `${isro} vs ${pyq}`);
    const ranked = rankRelatedCourses(lt, [
      { uid: "BIG", name: "Comprehensive Course on Computer Networks", itemCount: 107, slug: "comp-107" },
      { uid: "ISRO", name: "Computer Networks for ISRO", itemCount: 24, slug: "cn-isro" },
      { uid: "PYQ", name: "Computer Networks- GATE PYQ's", itemCount: 20, slug: "pyq" },
      { uid: "SELF", name: "Computer Networks For LT GRADE", itemCount: 20, slug: "lt" },
    ], "SELF");
    assert.equal(ranked[0]?.uid, "ISRO");
    assert.ok(!ranked.some((c) => c.uid === "SELF"));
  });

  it("pages the rest of a 12-item Unacademy course list", () => {
    assert.equal(nextCoursePage(0, 12, 29, true), 12);
    assert.equal(nextCoursePage(12, 12, 29, true), 24);
    assert.equal(nextCoursePage(24, 5, 29, false), null);
    assert.equal(nextCoursePage(0, 29, 29, false), null);
    assert.equal(
      sheldonOffsetFromNext(
        "https://api.unacademy.com/sheldon/v1/list/course?limit=12&offset=12&type=popular&username=ankitdoylasir",
      ),
      12,
    );
    assert.equal(sheldonOffsetFromNext(""), null);
    const rankedIsro = rankRelatedCourses("Computer Networks For LT GRADE", [
      { uid: "RYM889ZJ", name: "Comprehensive Course on Computer Networks", itemCount: 78, slug: "comp-846" },
      { uid: "S3EFAY2Q", name: "Computer Networks For LT GRADE", itemCount: 20, slug: "lt" },
      { uid: "QAYN4MG4", name: "Computer Networks for ISRO", itemCount: 24, slug: "cn-isro" },
      { uid: "7RT6BH8A", name: "Computer Networks- GATE PYQ's", itemCount: 20, slug: "pyq" },
      { uid: "19OWGQXJ", name: "Course on Theory of computation for ISRO", itemCount: 3, slug: "toc-isro" },
    ], "S3EFAY2Q");
    assert.equal(rankedIsro[0]?.uid, "QAYN4MG4");
    assert.ok(!rankedIsro.some((c) => c.uid === "19OWGQXJ"));
  });

});
