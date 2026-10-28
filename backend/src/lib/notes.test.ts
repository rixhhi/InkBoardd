import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notesHref, resourceLinks } from "@inkboard/shared/notes";

function lesson(partial: Record<string, unknown> = {}) {
  return {
    uid: "c1",
    title: "Grammar Part I",
    slug: "grammar-part-i",
    durationSec: 3600,
    liveAt: null,
    replayId: "ABC123XYZ",
    playable: true,
    rank: 1,
    week: 1,
    status: "replay",
    notesUrl: null,
    slidesUrl: null,
    dppUrl: null,
    dppName: null,
    ...partial,
  } as Parameters<typeof resourceLinks>[0];
}

describe("notes links", () => {
  it("builds a proxy href from a direct pdf url", () => {
    const href = notesHref({ url: "https://player.uacdn.net/slides_pdf/x/y_with_anno.pdf" });
    assert.match(href, /^\/api\/notes\?/);
    assert.match(href, /u=/);
  });

  it("builds a proxy href from replay id + title", () => {
    const href = notesHref({ id: "ABC123XYZ", title: "Grammar Part I", kind: "notes", view: true });
    assert.match(href, /id=ABC123XYZ/);
    assert.match(href, /kind=notes/);
    assert.match(href, /view=1/);
  });

  it("returns empty when neither url nor id/title is given", () => {
    assert.equal(notesHref({}), "");
  });

  it("exposes notes, class pdf, and dpp when they exist", () => {
    const links = resourceLinks(
      lesson({
        notesUrl: "https://player.uacdn.net/slides_pdf/a/n_with_anno.pdf",
        slidesUrl: "https://player.uacdn.net/slides_pdf/a/n_no_anno.pdf",
        dppUrl: "https://static.uacdn.net/dpp/sheet.pdf",
        dppName: "Week 1 DPP",
      }),
    );
    assert.ok(links.notes.includes("/api/notes"));
    assert.ok(links.slides.includes("/api/notes"));
    assert.ok(links.dppPdf.includes("/api/notes"));
    assert.equal(links.dppName, "Week 1 DPP");
  });

  it("skips non-pdf dpp links (practice quizzes)", () => {
    const links = resourceLinks(lesson({ dppUrl: "https://unacademy.com/practice/xyz" }));
    assert.equal(links.dppPdf, "");
  });
});
