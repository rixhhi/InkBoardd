import type { UaLesson } from "./parse-lesson.ts";

export function notesHref(opts: {
  url?: string | null;
  id?: string | null;
  title?: string;
  kind?: "notes" | "slides";
  view?: boolean;
}) {
  const params = new URLSearchParams();
  if (opts.url) params.set("u", opts.url);
  else if (opts.id && opts.title) {
    params.set("id", opts.id);
    params.set("title", opts.title);
    if (opts.kind) params.set("kind", opts.kind);
  } else {
    return "";
  }
  if (opts.view) params.set("view", "1");
  return `/api/notes?${params.toString()}`;
}

function isPdfUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().endsWith(".pdf") || u.hostname.endsWith("uacdn.net");
  } catch (err) {
    console.warn("[notes] invalid pdf url", err instanceof Error ? err.message : err);
    return false;
  }
}

export function resourceLinks(lesson: UaLesson) {
  const notes =
    lesson.notesUrl
      ? notesHref({ url: lesson.notesUrl })
      : lesson.replayId
        ? notesHref({ id: lesson.replayId, title: lesson.title, kind: "notes" })
        : "";
  const slides =
    lesson.slidesUrl
      ? notesHref({ url: lesson.slidesUrl })
      : lesson.replayId
        ? notesHref({ id: lesson.replayId, title: lesson.title, kind: "slides" })
        : "";
  const dppPdf = lesson.dppUrl && isPdfUrl(lesson.dppUrl) ? notesHref({ url: lesson.dppUrl }) : "";
  return {
    notes,
    slides,
    dppPdf,
    dppName: lesson.dppName || "DPP",
  };
}
