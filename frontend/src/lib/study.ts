export type SilenceRange = { start: number; end: number };

export type ChapterMark = { t: number; label: string; uid: string };

type ChapterSource = {
  durationMs: number;
  slides: { t: number; uid: string }[];
  switches: { t: number; uid: string }[];
};

/** One tick per board change. Switches win; slide timestamps are the fallback. */
export function boardChapters(timeline: ChapterSource): ChapterMark[] {
  const events = timeline.switches.length ? timeline.switches : timeline.slides;
  const cap = timeline.durationMs > 0 ? timeline.durationMs / 1000 : Number.POSITIVE_INFINITY;
  const marks: ChapterMark[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    const sec = ev.t / 1000;
    if (!Number.isFinite(sec) || sec < 0 || sec > cap + 1) continue;
    const key = `${ev.uid}:${Math.round(sec)}`;
    if (seen.has(key)) continue;
    const prev = marks[marks.length - 1];
    if (prev && prev.uid === ev.uid && Math.abs(prev.t - sec) < 1.5) continue;
    seen.add(key);
    marks.push({ t: sec, label: `Slide ${marks.length + 1}`, uid: ev.uid });
  }
  return marks;
}

export function vttClock(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const whole = Math.floor(safe);
  const ms = Math.round((safe - whole) * 1000);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const carry = ms === 1000 ? 1 : 0;
  const adj = whole + carry;
  const hh = Math.floor(adj / 3600);
  const mm = Math.floor((adj % 3600) / 60);
  const ss = adj % 60;
  const milli = ms === 1000 ? 0 : ms;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

/** WebVTT chapters. Each cue runs until the next board change. */
export function chaptersToVtt(chapters: ChapterMark[]): string {
  const lines = ["WEBVTT", ""];
  chapters.forEach((ch, i) => {
    const next = chapters[i + 1]?.t;
    const end = next != null && next > ch.t ? next : ch.t + 0.8;
    const label = ch.label.replace(/\r?\n/g, " ").trim() || "Slide";
    lines.push(String(i + 1), `${vttClock(ch.t)} --> ${vttClock(end)}`, label, "");
  });
  return lines.join("\n");
}

function tsvCell(value: string): string {
  return value.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

/** Anki-compatible tab file. Front is the prompt, back is the place in the class. */
export function revisionCards(
  title: string,
  chapters: ChapterMark[],
  notes: { seconds: number; note: string }[] = [],
): string {
  const rows = ["Front\tBack"];
  const name = tsvCell(title) || "Class";
  for (const ch of chapters) {
    rows.push(`${tsvCell(ch.label)}\t${name} · ${vttClock(ch.t).slice(0, 8)}`);
  }
  for (const note of notes) {
    const text = tsvCell(note.note);
    if (!text) continue;
    rows.push(`${text}\t${name} · ${vttClock(note.seconds).slice(0, 8)}`);
  }
  return `${rows.join("\n")}\n`;
}

export function revisionLines(
  title: string,
  chapters: ChapterMark[],
  notes: { seconds: number; note: string }[] = [],
): string[] {
  const lines = [title.trim() || "Class", ""];
  if (!chapters.length && !notes.some((n) => n.note.trim())) {
    lines.push("No chapters yet.");
    return lines;
  }
  lines.push("Chapters");
  for (const ch of chapters.slice(0, 40)) lines.push(`${vttClock(ch.t).slice(0, 8)}  ${ch.label}`);
  const kept = notes.filter((n) => n.note.trim()).slice(0, 20);
  if (kept.length) {
    lines.push("", "Pins");
    for (const note of kept) lines.push(`${vttClock(note.seconds).slice(0, 8)}  ${note.note.trim()}`);
  }
  return lines;
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** One-page study sheet. Helvetica only, no external fonts. ASCII body. */
export function revisionPdf(lines: string[]): string {
  const body = lines
    .slice(0, 42)
    .map((line) => `(${pdfEscape(line.slice(0, 90))}) Tj T*`)
    .join("\n");
  const stream = `BT /F1 11 Tf 48 760 Td 16 TL\n${body}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((obj, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return out;
}

export function parseClockQuery(query: string): number | null {
  const match = query.trim().match(/^(?:(\d+):)?(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  if (match[3] != null && match[1] != null) {
    const sec = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return Number.isFinite(sec) ? sec : null;
  }
  if (match[1] != null) {
    const sec = Number(match[1]) * 60 + Number(match[2]);
    return Number.isFinite(sec) ? sec : null;
  }
  return null;
}

export function chapterHits(query: string, chapters: ChapterMark[]): ChapterMark[] {
  const q = query.trim().toLowerCase();
  if (!q) return chapters.slice(0, 40);
  const clock = parseClockQuery(q);
  return chapters
    .filter((ch) => {
      if (ch.label.toLowerCase().includes(q)) return true;
      if (clock == null) return false;
      return Math.abs(ch.t - clock) <= 20;
    })
    .slice(0, 40);
}

export function parseSilenceFile(raw: unknown): SilenceRange[] {
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { ranges?: unknown }).ranges) ? (raw as { ranges: unknown[] }).ranges : [];
  const out: SilenceRange[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const start = Number((row as { start?: unknown }).start);
    const end = Number((row as { end?: unknown }).end);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start + 0.25) out.push({ start, end });
  }
  return out;
}

/** Jump to the end of a silence the playhead is inside. */
export function skipSilenceTo(time: number, ranges: SilenceRange[], lead = 0.15): number | null {
  for (const range of ranges) {
    if (time >= range.start - lead && time < range.end - 0.08) return range.end;
  }
  return null;
}
