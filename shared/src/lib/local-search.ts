export type LocalHit = {
  title: string;
  href: string;
  kind: "task" | "note";
};

/** Titles that contain the query. A title that starts with it comes first. */
export function searchLocal(items: LocalHit[], query: string): LocalHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return items
    .flatMap((item) => {
      const title = item.title.trim();
      const at = title.toLowerCase().indexOf(needle);
      if (!title || at < 0) return [];
      return [{ item: { ...item, title }, rank: at === 0 ? 0 : 1 }];
    })
    .sort((a, b) => a.rank - b.rank || a.item.title.localeCompare(b.item.title))
    .slice(0, 8)
    .map((row) => row.item);
}

export function lectureHref(lessonId: string, seconds = 0): string {
  const id = lessonId.trim();
  const at = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `/play/${encodeURIComponent(id)}?t=${at}`;
}

export type StudyDoc = {
  title: string;
  text: string;
  href: string;
  kind: "task" | "note" | "bookmark";
};

export type StudyHit = StudyDoc & {
  snippet: { before: string; match: string; after: string };
};

function snippetAt(source: string, at: number, length: number): StudyHit["snippet"] {
  const start = Math.max(0, at - 24);
  const end = Math.min(source.length, at + length + 24);
  return {
    before: `${start > 0 ? "…" : ""}${source.slice(start, at)}`,
    match: source.slice(at, at + length),
    after: `${source.slice(at + length, end)}${end < source.length ? "…" : ""}`,
  };
}

/** Title matches outrank note matches. The snippet is the text around the match, not HTML. */
export function searchStudy(docs: StudyDoc[], query: string): StudyHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return docs
    .flatMap((doc) => {
      const title = doc.title.trim();
      const text = doc.text.trim();
      const titleAt = title.toLowerCase().indexOf(needle);
      const textAt = titleAt >= 0 ? -1 : text.toLowerCase().indexOf(needle);
      if (titleAt < 0 && textAt < 0) return [];
      const inTitle = titleAt >= 0;
      return [
        {
          ...doc,
          title: title || text,
          rank: inTitle ? (titleAt === 0 ? 0 : 1) : 2,
          snippet: snippetAt(inTitle ? title : text, inTitle ? titleAt : textAt, needle.length),
        },
      ];
    })
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .slice(0, 8)
    .map(({ rank: _rank, ...hit }) => hit);
}

