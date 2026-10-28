import { createHash } from "node:crypto";

export type SummaryChapter = { t: number; label: string };
export type SummaryNote = { seconds: number; note: string };
export type SummaryInput = { title: string; chapters: SummaryChapter[]; notes: SummaryNote[] };
export type SummaryResult = { source: "board" | "model"; bullets: string[] };

/** Non-reasoning chat model. grok-3-mini is no longer in the xAI model list. */
export const DEFAULT_XAI_MODEL = "grok-4.20-non-reasoning";

const MAX_CHAPTERS = 40;
const MAX_NOTES = 20;
const MAX_SECONDS = 12 * 60 * 60;

type CacheEntry = { at: number; bullets: string[] };
const MAX_CACHE = 500;
const memory = new Map<string, CacheEntry>();

function evictOldest(cache: Map<string, CacheEntry>) {
  if (cache.size <= MAX_CACHE) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  const toRemove = oldest.slice(0, cache.size - MAX_CACHE);
  for (const [key] of toRemove) cache.delete(key);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function finiteTime(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_SECONDS) return null;
  return n;
}

export function clockLabel(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function normalizeSummaryInput(raw: unknown): SummaryInput {
  const rec = asRecord(raw);
  if (!rec) throw new Error("invalid summary");
  const chapters: SummaryChapter[] = [];
  for (const row of Array.isArray(rec.chapters) ? rec.chapters.slice(0, MAX_CHAPTERS) : []) {
    const item = asRecord(row);
    if (!item) continue;
    const t = finiteTime(item.t);
    const label = clean(item.label, 120);
    if (t == null || !label) continue;
    chapters.push({ t, label });
  }
  const notes: SummaryNote[] = [];
  for (const row of Array.isArray(rec.notes) ? rec.notes.slice(0, MAX_NOTES) : []) {
    const item = asRecord(row);
    if (!item) continue;
    const seconds = finiteTime(item.seconds);
    const note = clean(item.note, 240);
    if (seconds == null || !note) continue;
    notes.push({ seconds, note });
  }
  if (!chapters.length && !notes.length) throw new Error("A chapter or a pin is required");
  return { title: clean(rec.title, 160) || "Class", chapters, notes };
}

/** Outline from the board. Not a model. */
export function boardBullets(input: SummaryInput): string[] {
  const out: string[] = [];
  for (const ch of input.chapters) {
    if (out.length >= 8) break;
    out.push(`${ch.label} · ${clockLabel(ch.t)}`);
  }
  for (const note of input.notes) {
    if (out.length >= 8) break;
    out.push(`${note.note} · ${clockLabel(note.seconds)}`);
  }
  return out;
}

export function outlineText(input: SummaryInput): string {
  const lines = [`Class: ${input.title}`];
  if (input.chapters.length) {
    lines.push("Chapters:");
    for (const ch of input.chapters) lines.push(`${clockLabel(ch.t)} ${ch.label}`);
  }
  if (input.notes.length) {
    lines.push("Pins:");
    for (const note of input.notes) lines.push(`${clockLabel(note.seconds)} ${note.note}`);
  }
  return lines.join("\n");
}

export function parseSummaryText(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
    if (line.length < 3) continue;
    out.push(line.slice(0, 180));
    if (out.length >= 8) break;
  }
  return out;
}

function cacheKey(input: SummaryInput): string {
  return createHash("sha256").update(outlineText(input)).digest("hex");
}

export async function summarizeClass(
  input: SummaryInput,
  opts: {
    apiKey?: string | null;
    fetchImpl?: typeof fetch;
    now?: () => number;
    cache?: Map<string, CacheEntry>;
    ttlMs?: number;
  } = {},
): Promise<SummaryResult> {
  const apiKey = opts.apiKey?.trim() || "";
  if (!apiKey) return { source: "board", bullets: boardBullets(input) };

  const cache = opts.cache ?? memory;
  const now = opts.now?.() ?? Date.now();
  const ttl = opts.ttlMs ?? 6 * 60 * 60 * 1000;
  const id = cacheKey(input);
  const hit = cache.get(id);
  if (hit && now - hit.at < ttl) return { source: "model", bullets: hit.bullets };

  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.XAI_MODEL?.trim() || DEFAULT_XAI_MODEL,
        max_tokens: 400,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You write short revision bullets for one class. Use only the outline given. Do not invent facts, formulas, or teachers. 5 to 8 lines. One bullet per line. No title.",
          },
          { role: "user", content: outlineText(input) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("Summary is unavailable right now");
  }
  if (!res.ok) throw new Error("Summary is unavailable right now");
  let body: { choices?: { message?: { content?: string } }[] };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new Error("Summary is unavailable right now");
  }
  const text = body.choices?.[0]?.message?.content;
  const bullets = typeof text === "string" ? parseSummaryText(text) : [];
  if (!bullets.length) return { source: "board", bullets: boardBullets(input) };
  cache.set(id, { at: now, bullets });
  evictOldest(cache);
  return { source: "model", bullets };
}
