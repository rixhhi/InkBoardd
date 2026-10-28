import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { allowRate, resetProxyLimits } from "@inkboard/shared/cdn-proxy";
import type { UaLesson } from "@inkboard/shared/parse-lesson";
import {
  NOTES_GAP_MIN_MS,
  NOTES_RETRY_BACKOFF_MS,
  collectNotesFiles,
  downloadNotesCopy,
  fetchNotesZip,
  groupSavedByWeek,
  notesFileCounts,
  notesZipReport,
  notesZipSummary,
  shouldSplitByWeek,
  uniquePath,
  weekFolderName,
  windowsSafeName,
} from "@inkboard/shared/notes-zip";

function lesson(partial: Partial<UaLesson> & { uid: string; title: string }): UaLesson {
  return {
    slug: "",
    durationSec: 60,
    liveAt: null,
    replayId: null,
    playable: true,
    rank: 0,
    week: 1,
    status: "replay",
    notesUrl: null,
    slidesUrl: null,
    dppUrl: null,
    dppName: null,
    thumbnail: "",
    ...partial,
  };
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

function makeFetch(
  table: Record<
    string,
    { status: number; body?: Uint8Array; retryAfter?: string; throwOnce?: boolean; statusSeq?: number[] }
  >,
) {
  const hits: string[] = [];
  const thrown = new Set<string>();
  const counts = new Map<string, number>();
  const fetchFn = (async (url: string) => {
    hits.push(String(url));
    const key = String(url);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    const row = table[key];
    if (!row) return new Response("missing", { status: 404 });
    if (row.throwOnce && !thrown.has(key)) {
      thrown.add(key);
      throw new TypeError("network down");
    }
    const status = row.statusSeq ? row.statusSeq[Math.min(n - 1, row.statusSeq.length - 1)]! : row.status;
    const headers: Record<string, string> = { "content-type": "application/pdf" };
    if (row.retryAfter) headers["Retry-After"] = row.retryAfter;
    const body = new Uint8Array(row.body ?? PDF);
    return new Response(body.buffer, { status, headers });
  }) as typeof fetch;
  return { fetchFn, hits };
}

describe("notes zip collect", () => {
  it("counts notes + class PDF + DPP from the same list", () => {
    const files = collectNotesFiles([
      lesson({
        uid: "a",
        title: "Counting Techniques - Part I",
        rank: 1,
        week: 1,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
        slidesUrl: "https://player.uacdn.net/slides_pdf/x/a_no_anno.pdf",
        dppUrl: "https://player.uacdn.net/dpp/a.pdf",
        dppName: "DPP 1",
      }),
    ]);
    assert.equal(files.length, 3);
    assert.ok(files.every((f) => f.source === "known"));
    assert.equal(downloadNotesCopy(files.length), "Download all notes (3 files)");
    assert.equal(files[0]?.zipPath, "Week 1/01 Counting Techniques - Part I - notes.pdf");
    assert.equal(files[1]?.zipPath, "Week 1/01 Counting Techniques - Part I - class.pdf");
    assert.equal(files[2]?.zipPath, "Week 1/01 Counting Techniques - Part I - dpp.pdf");
  });

  it("labels guessed files separately from known ones", () => {
    const files = collectNotesFiles([
      lesson({
        uid: "a",
        title: "Known",
        rank: 1,
        week: 1,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
      }),
      lesson({
        uid: "b",
        title: "Guessed",
        rank: 2,
        week: 1,
        replayId: "GHIJKL",
      }),
    ]);
    const counts = notesFileCounts(files);
    assert.equal(counts.known, 1);
    assert.equal(counts.guessed, 2);
    assert.equal(downloadNotesCopy(counts.known, counts.guessed), "Download all notes (1 known + 2 possible)");
    assert.equal(files.find((f) => f.lesson === "Guessed" && f.label === "Notes")?.source, "guessed");
  });

  it("uses position in the group when rank is empty", () => {
    const files = collectNotesFiles([
      lesson({
        uid: "a",
        title: "First",
        rank: 0,
        week: 2,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
      }),
      lesson({
        uid: "b",
        title: "Second",
        week: 2,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/b_with_anno.pdf",
      }),
    ]);
    assert.equal(files[0]?.zipPath, "Week 2/01 First - notes.pdf");
    assert.equal(files[1]?.zipPath, "Week 2/02 Second - notes.pdf");
  });

  it("puts courses without weeks under All classes", () => {
    const files = collectNotesFiles([
      lesson({
        uid: "a",
        title: "Solo",
        week: null,
        rank: 1,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
      }),
    ]);
    assert.equal(weekFolderName(null), "All classes");
    assert.equal(files[0]?.zipPath, "All classes/01 Solo - notes.pdf");
  });

  it("de-duplicates colliding names", () => {
    const taken = new Set<string>();
    assert.equal(uniquePath("Week 1/01 Foo - notes.pdf", taken), "Week 1/01 Foo - notes.pdf");
    assert.equal(uniquePath("Week 1/01 Foo - notes.pdf", taken), "Week 1/01 Foo - notes (2).pdf");
    assert.equal(uniquePath("Week 1/01 FOO - notes.pdf", taken), "Week 1/01 FOO - notes (3).pdf");
  });

  it("sanitises Windows-illegal names", () => {
    assert.equal(windowsSafeName('A <>:"/\\|?* B'), "A B");
    assert.equal(windowsSafeName("  dots...  "), "dots");
  });
});

describe("notes zip fetch", () => {
  it("skips 404 and keeps going", async () => {
    const lessons = collectNotesFiles([
      lesson({
        uid: "a",
        title: "A",
        rank: 1,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
      }),
      lesson({
        uid: "b",
        title: "B",
        rank: 2,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/b_with_anno.pdf",
      }),
    ]);
    const { fetchFn, hits } = makeFetch({
      [lessons[0]!.href]: { status: 404 },
      [lessons[1]!.href]: { status: 200, body: PDF },
    });
    const sleeps: number[] = [];
    const result = await fetchNotesZip(lessons, {
      fetch: fetchFn,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    assert.equal(result.saved.length, 1);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0]?.reason, "HTTP 404");
    assert.equal(hits.length, 2);
    assert.ok(sleeps.every((ms) => ms >= NOTES_GAP_MIN_MS || ms === NOTES_RETRY_BACKOFF_MS));
  });

  it("lists guessed 404s as not on the CDN", async () => {
    const files = collectNotesFiles([
      lesson({
        uid: "a",
        title: "Guessed",
        rank: 1,
        replayId: "ABCDEFGH",
      }),
    ]);
    const notes = files.find((f) => f.label === "Notes")!;
    const { fetchFn, hits } = makeFetch({
      [notes.href]: { status: 404 },
    });
    const result = await fetchNotesZip([notes], {
      fetch: fetchFn,
      sleep: async () => {},
    });
    assert.equal(hits.length, 1);
    assert.equal(result.missing[0]?.reason, "not on the CDN");
    assert.equal(result.missing[0]?.guessed, true);
  });

  it("does not retry a 404", async () => {
    const files = collectNotesFiles([
      lesson({
        uid: "a",
        title: "A",
        rank: 1,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
      }),
    ]);
    const { fetchFn, hits } = makeFetch({
      [files[0]!.href]: { status: 404 },
    });
    await fetchNotesZip(files, { fetch: fetchFn, sleep: async () => {} });
    assert.equal(hits.length, 1);
  });

  it("retries a 503 once then saves", async () => {
    const files = collectNotesFiles([
      lesson({
        uid: "a",
        title: "A",
        rank: 1,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
      }),
    ]);
    const { fetchFn, hits } = makeFetch({
      [files[0]!.href]: { status: 200, body: PDF, statusSeq: [503, 200] },
    });
    const sleeps: number[] = [];
    const result = await fetchNotesZip(files, {
      fetch: fetchFn,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.equal(hits.length, 2);
    assert.equal(result.saved.length, 1);
    assert.ok(sleeps.includes(NOTES_RETRY_BACKOFF_MS));
  });

  it("stops the whole run on 429 and keeps what it has", async () => {
    const lessons = collectNotesFiles([
      lesson({
        uid: "a",
        title: "A",
        rank: 1,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
      }),
      lesson({
        uid: "b",
        title: "B",
        rank: 2,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/b_with_anno.pdf",
      }),
      lesson({
        uid: "c",
        title: "C",
        rank: 3,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/c_with_anno.pdf",
      }),
    ]);
    const { fetchFn, hits } = makeFetch({
      [lessons[0]!.href]: { status: 200, body: PDF },
      [lessons[1]!.href]: { status: 429, retryAfter: "60" },
      [lessons[2]!.href]: { status: 200, body: PDF },
    });
    const result = await fetchNotesZip(lessons, {
      fetch: fetchFn,
      sleep: async () => {},
      random: () => 0,
    });
    assert.equal(result.saved.length, 1);
    assert.equal(result.stopped?.status, 429);
    assert.equal(result.stopped?.retryAfter, "60");
    assert.equal(hits.length, 2);
    assert.match(notesZipReport(result), /Stopped: HTTP 429/);
    assert.equal(notesZipSummary(1, 0), "Saved 1 file");
  });

  it("cancels without fetching the rest", async () => {
    const lessons = collectNotesFiles([
      lesson({
        uid: "a",
        title: "A",
        rank: 1,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
      }),
      lesson({
        uid: "b",
        title: "B",
        rank: 2,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/b_with_anno.pdf",
      }),
    ]);
    const ctrl = new AbortController();
    const { fetchFn, hits } = makeFetch({
      [lessons[0]!.href]: { status: 200, body: PDF },
      [lessons[1]!.href]: { status: 200, body: PDF },
    });
    const result = await fetchNotesZip(lessons, {
      fetch: fetchFn,
      signal: ctrl.signal,
      random: () => 0,
      sleep: async () => {
        ctrl.abort();
      },
    });
    assert.equal(result.cancelled, true);
    assert.equal(result.saved.length, 1);
    assert.equal(hits.length, 1);
  });

  it("retries a network error once, then moves on", async () => {
    const lessons = collectNotesFiles([
      lesson({
        uid: "a",
        title: "A",
        rank: 1,
        notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
      }),
    ]);
    const { fetchFn, hits } = makeFetch({
      [lessons[0]!.href]: { status: 200, body: PDF, throwOnce: true },
    });
    const sleeps: number[] = [];
    const result = await fetchNotesZip(lessons, {
      fetch: fetchFn,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    assert.equal(result.saved.length, 1);
    assert.equal(hits.length, 2);
    assert.ok(sleeps.includes(NOTES_RETRY_BACKOFF_MS));
  });

  it("pacing stays under 60 requests/min against allowRate", async () => {
    let now = 1_000_000;
    const orig = Date.now;
    Date.now = () => now;
    resetProxyLimits();
    const files = Array.from({ length: 60 }, (_, i) =>
      collectNotesFiles([
        lesson({
          uid: `u${i}`,
          title: `L${i}`,
          rank: i + 1,
          week: 1,
          notesUrl: `https://player.uacdn.net/slides_pdf/x/${i}_with_anno.pdf`,
        }),
      ])[0]!,
    );
    try {
      const result = await fetchNotesZip(files, {
        fetch: (async () => {
          assert.equal(allowRate("notes-zip"), true, "pacing produced a 429 from allowRate");
          const body = new Uint8Array(PDF);
          return new Response(body.buffer, { status: 200, headers: { "content-type": "application/pdf" } });
        }) as typeof fetch,
        sleep: async (ms) => {
          now += ms;
        },
        random: () => 0,
      });
      assert.equal(result.saved.length, 60);
      assert.equal(result.stopped, null);
    } finally {
      Date.now = orig;
      resetProxyLimits();
    }
  });

  it("splits by week when the next file would pass the size cap", async () => {
    const fat = new Uint8Array(80);
    fat[0] = 0x25;
    fat[1] = 0x50;
    fat[2] = 0x44;
    fat[3] = 0x46;
    const files = [
      ...collectNotesFiles([
        lesson({
          uid: "a",
          title: "A",
          rank: 1,
          week: 1,
          notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf",
        }),
      ]),
      ...collectNotesFiles([
        lesson({
          uid: "b",
          title: "B",
          rank: 1,
          week: 2,
          notesUrl: "https://player.uacdn.net/slides_pdf/x/b_with_anno.pdf",
        }),
      ]),
    ];
    const { fetchFn } = makeFetch({
      [files[0]!.href]: { status: 200, body: fat },
      [files[1]!.href]: { status: 200, body: fat },
    });
    assert.equal(shouldSplitByWeek(80, 80, 100), true);
    const result = await fetchNotesZip(files, {
      fetch: fetchFn,
      sleep: async () => {},
      maxBytes: 100,
    });
    assert.equal(result.splitByWeek, true);
    assert.equal(result.saved.length, 2);
    const weeks = groupSavedByWeek(result.saved);
    assert.equal(weeks.length, 2);
    assert.equal(weeks[0]?.week, "Week 1");
    assert.equal(weeks[1]?.week, "Week 2");
  });
});

describe("notes locker dialog", () => {
  it("uses the kit Dialog (focus trap + opener restore come from Radix), streams into a folder when the browser can, and keeps the zip fallback", () => {
    const src = readFileSync(new URL("../../../frontend/src/components/notes-locker.tsx", import.meta.url), "utf8");
    assert.match(src, /<Dialog/);
    assert.match(src, /dismissable=\{!busy\}/, "must not be dismissable mid-download");
    assert.match(src, /pickNotesFolder/);
    assert.match(src, /onSaved/);
    assert.match(src, /Zip per week/);
    assert.match(src, /Not on the CDN/);
    assert.doesNotMatch(src, /aria-modal/, "no hand-rolled modal left");
  });
});

describe("fetchNotesZip streaming sink", () => {
  it("hands each PDF to onSaved as it arrives and releases the bytes instead of hoarding them for a zip", async () => {
    const lessons = collectNotesFiles([
      lesson({ uid: "a", title: "A", rank: 1, notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf" }),
      lesson({ uid: "b", title: "B", rank: 2, notesUrl: "https://player.uacdn.net/slides_pdf/x/b_with_anno.pdf" }),
    ]);
    const { fetchFn } = makeFetch({
      [lessons[0]!.href]: { status: 200, body: PDF },
      [lessons[1]!.href]: { status: 200, body: PDF },
    });
    const written: string[] = [];
    const result = await fetchNotesZip(lessons, {
      fetch: fetchFn,
      sleep: async () => {},
      random: () => 0,
      maxBytes: 1, // would force splitByWeek in zip mode; irrelevant when streaming
      onSaved: async (file) => {
        assert.ok(file.bytes.length > 0, "sink receives the real bytes");
        written.push(file.path);
      },
    });
    assert.deepEqual(written, lessons.map((f) => f.zipPath));
    assert.equal(result.saved.length, 2);
    assert.ok(result.saved.every((row) => row.bytes.length === 0), "bytes released after the sink took them");
    assert.equal(result.splitByWeek, false, "no zip, so no per-week split");
  });

  it("records a sink failure as missing and keeps going", async () => {
    const lessons = collectNotesFiles([
      lesson({ uid: "a", title: "A", rank: 1, notesUrl: "https://player.uacdn.net/slides_pdf/x/a_with_anno.pdf" }),
      lesson({ uid: "b", title: "B", rank: 2, notesUrl: "https://player.uacdn.net/slides_pdf/x/b_with_anno.pdf" }),
    ]);
    const { fetchFn } = makeFetch({
      [lessons[0]!.href]: { status: 200, body: PDF },
      [lessons[1]!.href]: { status: 200, body: PDF },
    });
    let n = 0;
    const result = await fetchNotesZip(lessons, {
      fetch: fetchFn,
      sleep: async () => {},
      random: () => 0,
      onSaved: async () => {
        n += 1;
        if (n === 1) throw new Error("disk full");
      },
    });
    assert.equal(result.saved.length, 1);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0]?.reason, "disk full");
  });
});
