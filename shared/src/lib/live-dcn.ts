/** Live DCN arrives over Unacademy's class websocket and Janus datachannel. */

export const LIVE_PLUGINS = new Set(["cw", "dcn", "mcn"]);

const PLUGIN_ALIAS: Record<string, string> = {
  cw: "cw",
  dcn: "dcn",
  mcn: "cw",
  canvaswrapper: "cw",
  drawingboardcontrols: "dcn",
};

export function livePluginName(raw: string) {
  return PLUGIN_ALIAS[raw.trim().toLowerCase()] || "";
}

export type LiveRawEvent = {
  plugin: string;
  p_time?: number;
  data?: Record<string, unknown>;
  id?: number;
};

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function asNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseJson(raw: string): unknown {
  const t = raw.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
  if (t.length > 4_000_000) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function liveClassTopic(classId: string) {
  return `chat:liveclass:${classId}`;
}

export function liveUserTopic(classId: string, userId: string) {
  return `chat:liveclass:${classId}:uid:${userId}`;
}

export function liveSubscribeBody(jwt: string, classId: string, userId: string) {
  return {
    token: jwt,
    subscriptions: [liveClassTopic(classId), liveUserTopic(classId, userId)],
  };
}

export function liveHistoryBody(classId: string, goalUid: string, now = Date.now()) {
  return {
    messages: [
      {
        topic: liveClassTopic(classId),
        text: JSON.stringify({
          command: "QUERY_HISTORY",
          text: JSON.stringify({
            time: now,
            time_direction: "Before",
            limit: 200,
            direction: "DESC",
            goal_uid: goalUid,
          }),
        }),
      },
    ],
  };
}

export function liveHeartbeat() {
  return { heart_beat: "ping" };
}

export function liveWsUrl(domain: string): string {
  const host = domain
    .trim()
    .replace(/^wss?:\/\//i, "")
    .replace(/\/.*$/, "");
  if (!/^(?:[a-z0-9-]+\.)*unacademy\.com$/i.test(host)) return "wss://ws.unacademy.com/ws";
  return `wss://${host}/ws`;
}

/** Decode JWT payload without verifying — only used for uid / goal_uid on the live token. */
export function jwtFields(jwt: string): { uid: string; goalUid: string } {
  const parts = jwt.split(".");
  if (parts.length < 2) return { uid: "", goalUid: "" };
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(b64 + pad)
        : Buffer.from(b64 + pad, "base64").toString("utf8");
    const row = asObj(JSON.parse(json)) || {};
    return { uid: asStr(row.uid), goalUid: asStr(row.goal_uid) };
  } catch {
    return { uid: "", goalUid: "" };
  }
}

const DCN_E = new Set(["as", "sc", "cc", "pstc", "estc", "mc", "sbc", "st"]);
const CW_E = new Set(["d", "u", "m", "zm", "pn", "tf", "pdo2", "dlos", "cio", "ea", "un", "pdo", "hda", "rs"]);
const SKIP_E = new Set(["p"]);

function eventCode(o: Record<string, unknown>) {
  const direct = asStr(o.e) || asStr(o.type);
  if (direct) return direct;
  let inner = asObj(o.data);
  for (let i = 0; i < 3 && inner; i += 1) {
    const e = asStr(inner.e) || asStr(inner.type);
    if (e) return e;
    inner = asObj(inner.data);
  }
  return "";
}

function inferPlugin(o: Record<string, unknown>) {
  const e = eventCode(o);
  if (DCN_E.has(e)) return "dcn";
  if (CW_E.has(e)) return "cw";
  return "";
}

export function asLiveEvent(node: unknown, fallbackUs: number): LiveRawEvent | null {
  const o = asObj(node);
  if (!o) return null;
  const rawData = asObj(o.data) ?? o;
  const data = normalizeLiveData(rawData);
  const code = eventCode({ ...o, ...data, data });
  if (SKIP_E.has(code)) return null;
  let plugin = livePluginName(asStr(o.plugin));
  if (plugin === "dcn" && CW_E.has(code)) plugin = "cw";
  if (plugin === "cw" && DCN_E.has(code)) plugin = "dcn";
  if (!plugin) plugin = inferPlugin({ ...o, ...data, data });
  if (!plugin) return null;
  const ev: LiveRawEvent = {
    plugin,
    p_time: liveEventTimeUs(o, fallbackUs),
    data,
  };
  const id = asNum(o.id, Number.NaN);
  if (Number.isFinite(id)) ev.id = id;
  return ev;
}

/** Live history uses `ct` (unix ms). Packed DCN uses `p_time` in microseconds. */
export function liveEventTimeUs(o: Record<string, unknown>, fallback = 0): number {
  const p = asNum(o.p_time, Number.NaN);
  if (Number.isFinite(p) && p > 0) return p;
  const nested = asObj(o.data);
  const ct = asNum(o.ct, asNum(nested?.ct, Number.NaN));
  if (!Number.isFinite(ct) || ct <= 0) return fallback;
  if (ct >= 1e14) return ct;
  return ct * 1000;
}

export function liveEventCode(ev: LiveRawEvent) {
  return eventCode(asObj(ev.data) || {});
}

export function isSnapshotTick(ev: LiveRawEvent) {
  return liveEventCode(ev) === "st";
}

function absSlideUrl(url: string) {
  const t = url.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  return `https://uadoc.uacdn.net/${t.replace(/^\/+/, "").replace(/^s3\/uploads\//, "")}`;
}

/** Liveweb uses `type`/`url`/`index`/`objectId`; packed replays use `e`/`u`/`i`/`p`.
 * Proxy history nests `{ id: canvas, data: { e, p } }` — flatten so compactEvents sees `e`. */
export function normalizeLiveData(raw: Record<string, unknown>): Record<string, unknown> {
  let node: Record<string, unknown> = raw;
  let canvasId = asNum(raw.id, Number.NaN);
  for (let i = 0; i < 4; i += 1) {
    const nested = asObj(node.data);
    if (!nested) break;
    const hasE = asStr(nested.e) || asStr(nested.type);
    if (!hasE && !asObj(nested.p)) break;
    const cid = asNum(node.id, Number.NaN);
    if (Number.isFinite(cid) && cid >= 0 && cid <= 64) canvasId = cid;
    node = nested;
  }
  const e = asStr(node.e) || asStr(node.type);
  const data: Record<string, unknown> = { ...node, e };
  if (Number.isFinite(canvasId) && data.id == null) data.id = canvasId;
  if (data.i == null && (raw.index != null || node.index != null)) data.i = node.index ?? raw.index;
  if (!asStr(data.u)) {
    const url = absSlideUrl(
      asStr(node.url) || asStr(raw.url) || asStr(node.staticImgUrl) || asStr(raw.publicUrl) || asStr(node.publicUrl) || asStr(raw.backgroundImage),
    );
    if (url) data.u = url;
  }
  if (!asStr(data.bc) && asStr(node.backgroundColor || raw.backgroundColor)) data.bc = node.backgroundColor || raw.backgroundColor;
  if (!asStr(data.c) && asStr(node.color || raw.color)) data.c = node.color || raw.color;
  if (!asStr(data.m) && (node.mode != null || raw.mode != null)) data.m = node.mode ?? raw.mode;
  if (data.s == null && (node.size != null || raw.size != null)) data.s = node.size ?? raw.size;
  if (e === "sc" && data.s == null && (node.index != null || raw.index != null)) data.s = node.index ?? raw.index;
  const p = asObj(data.p) || asObj(node.p) || asObj(raw.p) || {};
  const oid = asStr(p.oid) || asStr(data.objectId) || asStr(node.objectId) || asStr(raw.objectId) || asStr(raw.oid);
  const x = p.x ?? data.x ?? node.x ?? raw.x;
  const y = p.y ?? data.y ?? node.y ?? raw.y;
  if (x != null || y != null || oid) data.p = { ...p, x, y, oid };
  return data;
}

/**
 * Pull cw/dcn/mcn events out of a websocket DATA envelope, HISTORY page,
 * BROADCAST command, or a Janus datachannel payload.
 */
export function extractLiveEvents(raw: unknown, fallbackUs = 0): LiveRawEvent[] {
  return extractLiveBundle(raw, fallbackUs).events;
}

export function extractLiveBundle(raw: unknown, fallbackUs = 0): { events: LiveRawEvent[]; snapshots: number } {
  const out: LiveRawEvent[] = [];
  const seen = new WeakSet<object>();
  const keys = new Set<string>();
  let snapshots = 0;

  const walk = (node: unknown, depth: number) => {
    if (node == null || depth > 10) return;
    if (typeof node === "string") {
      const parsed = parseJson(node);
      if (parsed != null) walk(parsed, depth + 1);
      return;
    }
    if (Array.isArray(node)) {
      for (const row of node) walk(row, depth + 1);
      return;
    }
    const o = asObj(node);
    if (!o || seen.has(o)) return;
    seen.add(o);

    const ev = asLiveEvent(o, fallbackUs);
    if (ev) {
      if (isSnapshotTick(ev)) {
        snapshots += 1;
        return;
      }
      const k = eventKey(ev);
      if (!keys.has(k)) {
        keys.add(k);
        out.push(ev);
      }
      return;
    }

    const command = asStr(o.command);
    if (command === "BROADCAST" || command === "SEND" || command === "QUERY_HISTORY") {
      walk(o.text, depth + 1);
    }
    walk(o.text, depth + 1);
    walk(o.message, depth + 1);
    walk(o.messages, depth + 1);
    walk(o.data, depth + 1);
    walk(o.payload, depth + 1);
  };

  walk(raw, 0);
  return { events: out, snapshots };
}

function asBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof Uint8Array !== "undefined" && data instanceof Uint8Array) return data;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  return null;
}

function isGzipBytes(bytes: Uint8Array) {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function inflateGzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length > 2_000_000) throw new Error("gzip too big");
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    if (buf.byteLength > 2_000_000) throw new Error("gzip too big");
    return new Uint8Array(buf);
  }
  const { gunzipSync } = await import("node:zlib");
  return new Uint8Array(gunzipSync(bytes, { maxOutputLength: 2_000_000 }));
}

export function decodeDataChannel(data: unknown): unknown {
  if (typeof data === "string") {
    return parseJson(data) ?? data;
  }
  const bytes = asBytes(data);
  if (!bytes) return data;
  if (isGzipBytes(bytes)) return bytes;
  const text = new TextDecoder().decode(bytes);
  return parseJson(text) ?? text;
}

/** Inflate gzip Janus payloads, then parse JSON. Handles Blob (browser datachannel). */
export async function decodeLivePayload(data: unknown): Promise<unknown> {
  let raw: unknown = data;
  if (typeof Blob !== "undefined" && raw instanceof Blob) {
    try {
      raw = await raw.arrayBuffer();
    } catch {
      return null;
    }
  }
  if (typeof raw === "string") return parseJson(raw) ?? raw;
  const bytes = asBytes(raw);
  if (!bytes) return decodeDataChannel(raw);
  if (isGzipBytes(bytes)) {
    try {
      const inflated = await inflateGzip(bytes);
      const text = new TextDecoder().decode(inflated);
      return parseJson(text) ?? text;
    } catch {
      return null;
    }
  }
  const text = new TextDecoder().decode(bytes);
  return parseJson(text) ?? text;
}

/** Unacademy INFO frames: two "subscribed to" then heartbeats say pong. */
export function socketInfoKind(raw: unknown): "subscribed" | "pong" | null {
  const o = asObj(raw);
  if (!o) return null;
  if (asStr(o.type) !== "INFO") return null;
  const text = asStr(o.text).toLowerCase();
  if (text.includes("subscribed to")) return "subscribed";
  if (text.includes("pong")) return "pong";
  return null;
}

export function eventKey(ev: LiveRawEvent) {
  const oid =
    asStr(asObj(asObj(ev.data)?.p)?.oid) ||
    asStr(asObj(asObj(ev.data)?.data)?.e) ||
    asStr(asObj(ev.data)?.e);
  return `${ev.plugin}:${ev.id ?? ""}:${ev.p_time ?? 0}:${oid}:${JSON.stringify(ev.data).slice(0, 96)}`;
}

export function mergeLiveEvents(store: LiveRawEvent[], incoming: LiveRawEvent[], keys: Set<string>) {
  let added = 0;
  let maxUs = 0;
  for (const ev of incoming) {
    const k = eventKey(ev);
    if (keys.has(k)) continue;
    keys.add(k);
    store.push(ev);
    added += 1;
    const us = asNum(ev.p_time);
    if (us > maxUs) maxUs = us;
  }
  return { added, maxUs };
}

/** Paint a little ahead of the last event so the stroke currently being drawn is visible. */
export const LIVE_INK_LEAD_MS = 1600;

/** Live clock: last DCN p_time (ms) plus wall time since that event arrived, plus a short lead. */
export function liveClockMs(originPtimeMs: number, originWall: number, now: number, leadMs = LIVE_INK_LEAD_MS) {
  if (!Number.isFinite(originPtimeMs) || !Number.isFinite(originWall)) return 0;
  const lead = Number.isFinite(leadMs) ? Math.max(0, leadMs) : 0;
  return Math.max(0, originPtimeMs + Math.max(0, now - originWall) + lead);
}

/** Newest packed ink / slide time. Live paint must never sit behind this. */
export function lastBoardMs(tl: {
  strokes?: { t?: number; te?: number }[];
  slides?: { t?: number }[];
  switches?: { t?: number }[];
}) {
  let m = 0;
  for (const s of tl.strokes ?? []) {
    const t = Number(s.t);
    const te = Number(s.te);
    if (Number.isFinite(t)) m = Math.max(m, t);
    if (Number.isFinite(te)) m = Math.max(m, te);
  }
  for (const s of tl.slides ?? []) {
    const t = Number(s.t);
    if (Number.isFinite(t)) m = Math.max(m, t);
  }
  for (const s of tl.switches ?? []) {
    const t = Number(s.t);
    if (Number.isFinite(t)) m = Math.max(m, t);
  }
  return m;
}

/** Clock used to paint live ink: wall-adjusted DCN time, but never behind the last packed stroke. */
export function livePaintClock(
  tl: Parameters<typeof lastBoardMs>[0],
  origin: { p: number; wall: number },
  now: number,
  leadMs = LIVE_INK_LEAD_MS,
) {
  const lead = Number.isFinite(leadMs) ? Math.max(0, leadMs) : 0;
  return Math.max(liveClockMs(origin.p, origin.wall, now, lead), lastBoardMs(tl) + lead);
}

export function bumpLiveOrigin(
  origin: { p: number; wall: number },
  pTimeUs: number,
  now: number,
): { p: number; wall: number } {
  const t = pTimeUs / 1000;
  if (!Number.isFinite(t) || t < origin.p) return origin;
  return { p: t, wall: now };
}

const FIRST_SLIDE_HOST = "u3hm9ytk66.execute-api.ap-southeast-1.amazonaws.com";

export function isFirstSlideHost(url: URL) {
  return (
    url.protocol === "https:" &&
    url.hostname === FIRST_SLIDE_HOST &&
    url.pathname.includes("first_slide")
  );
}

export const FIRST_SLIDE_URL = `https://${FIRST_SLIDE_HOST}/first_slide_edge/get_slide`;

export type FirstSlideTheme = "LIGHT_THEME" | "DARK_THEME";

export type FirstSlideMeta = {
  className?: string;
  courseName?: string;
  educatorName?: string;
  rank?: string | number;
  special?: boolean;
  theme?: FirstSlideTheme;
};

const ASCII = /^[ -~\t\n\r]+$/;

function asciiField(v: unknown, max = 160) {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (!s || s.length > max || !ASCII.test(s)) return "";
  return s;
}

/** Liveweb posts names + LIGHT_THEME/DARK_THEME. `{ class_name: uid }` mints a blank page. */
export function firstSlideBody(meta: FirstSlideMeta) {
  const className = asciiField(meta.className);
  const course = asciiField(meta.courseName) || className;
  const educator = asciiField(meta.educatorName, 80) || "Educator";
  const rank = asciiField(meta.rank, 8) || "1";
  const theme: FirstSlideTheme = meta.theme === "DARK_THEME" ? "DARK_THEME" : "LIGHT_THEME";
  return {
    version: "v2",
    class_name: className,
    course_name: course,
    educator_name: educator,
    rank,
    theme,
    is_special: Boolean(meta.special),
  };
}

export function firstSlideHasName(body: Record<string, unknown>) {
  return typeof body.class_name === "string" && body.class_name.trim().length > 0;
}

/** Liveweb skips the POST unless every string field is non-empty ASCII. */
export function firstSlideReady(body: Record<string, unknown>) {
  return (
    firstSlideHasName(body) &&
    ASCII.test(String(body.course_name || "")) &&
    ASCII.test(String(body.educator_name || "")) &&
    ASCII.test(String(body.rank || "")) &&
    (body.theme === "LIGHT_THEME" || body.theme === "DARK_THEME") &&
    body.version === "v2"
  );
}

export function firstSlideTheme(uadoc: boolean, canvas: boolean): FirstSlideTheme {
  return uadoc && !canvas ? "LIGHT_THEME" : "DARK_THEME";
}

/** AWS first_slide returns a raw URL string, a quoted string, or { publicUrl }. */
export function parseFirstSlideBody(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https:\/\//i.test(t)) return t.split(/\s/)[0]!;
  try {
    const j = JSON.parse(t) as unknown;
    if (typeof j === "string" && /^https:\/\//i.test(j)) return j;
    const o = asObj(j);
    if (!o) return "";
    for (const key of ["publicUrl", "url", "data", "slide"]) {
      const v = o[key];
      if (typeof v === "string" && /^https:\/\//i.test(v)) return v;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const inner = asObj(v);
        if (!inner) continue;
        const u = inner.publicUrl || inner.url;
        if (typeof u === "string" && /^https:\/\//i.test(u)) return u;
      }
    }
  } catch {
    const m = t.match(/https:\/\/[^\s"'<>]+/);
    if (m) return m[0];
  }
  return "";
}

export function seedSlideEvents(url: string): LiveRawEvent[] {
  if (!url || isRuledPaper(url) || isMintedTitleCard(url)) return [];
  const light = /#fff/i.test(url);
  return [
    { plugin: "dcn", p_time: 0, data: { e: "as", i: 0, uid: "live0", u: url, bc: light ? "#FFFFFF" : "#202022" } },
    { plugin: "dcn", p_time: 0, data: { e: "sc", s: 0 } },
  ];
}

export function liveBoardSrc(classId: string, bust = Date.now()) {
  if (!/^[A-Za-z0-9]{4,16}$/.test(classId)) return "";
  return `/api/live-slide?uid=${encodeURIComponent(classId)}&t=${bust}`;
}

export function liveSlideSrc(abs: string, bust = Date.now()) {
  if (!/^https:\/\//i.test(abs)) return "";
  try {
    const host = new URL(abs).hostname;
    if (!(host === "uacdn.net" || host.endsWith(".uacdn.net"))) return "";
  } catch {
    return "";
  }
  const v = bust > 0 ? `&v=${bust}` : "";
  return `/api/slide?u=${encodeURIComponent(abs)}&live=1${v}`;
}

/** Recover the upstream slide URL from `/api/slide?u=` or an absolute CDN link. */
export function upstreamSlideUrl(url: string) {
  const m = url.match(/[?&]u=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]!);
    } catch {
      return m[1]!;
    }
  }
  return url;
}

/** UADoc JPEGs are overwritten in place as the teacher writes — not immutable slides. */
export function isLiveBoardRaster(url: string) {
  try {
    const abs = upstreamSlideUrl(url);
    const u = new URL(abs);
    if (u.hostname !== "uadoc.uacdn.net") return false;
    if (isRuledPaper(abs)) return false;
    return /\.jpe?g$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function refreshLiveSlides<T extends { slides: { uid: string; url?: string }[] }>(tl: T, _bust = 0): T {
  let changed = false;
  const slides = tl.slides.map((s) => {
    if (!s.url || !isLiveBoardRaster(s.url)) return s;
    const next = liveSlideSrc(upstreamSlideUrl(s.url), 0);
    if (!next || next === s.url) return s;
    changed = true;
    return { ...s, url: next };
  });
  return changed ? { ...tl, slides } : tl;
}

export function isPdfNotes(url: string) {
  const abs = upstreamSlideUrl(url);
  return /\.pdf(?:$|[?#])/i.test(abs);
}

/** UUID JPEGs at the UADoc root are minted title cards (white empty page), not the live board. */
export function isMintedTitleCard(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname !== "uadoc.uacdn.net") return false;
    return /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpe?g$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export const RULED_LIGHT = "https://uadoc.uacdn.net/live_class/background/Light.jpg";
export const RULED_DARK = "https://uadoc.uacdn.net/live_class/background/Dark.jpg";

function slideUrlOf(ev: LiveRawEvent) {
  const d = asObj(ev.data);
  return asStr(d?.u) || asStr(d?.su) || asStr(d?.publicUrl) || asStr(d?.url) || asStr(d?.staticImgUrl) || asStr(d?.bg);
}

function isAddSlide(ev: LiveRawEvent) {
  if (ev.plugin !== "dcn") return false;
  const d = asObj(ev.data);
  const e = asStr(d?.e) || asStr(d?.type);
  return e === "as";
}

export function hasSlideAdd(events: LiveRawEvent[]) {
  return events.some((ev) => isAddSlide(ev) && Boolean(slideUrlOf(ev)));
}

/** Page add or change — debounce these so a burst cannot flip the deck. */
export function isLiveSlideNav(ev: LiveRawEvent) {
  if (ev.plugin !== "dcn") return false;
  const d = asObj(ev.data);
  const e = asStr(d?.e) || asStr(d?.type);
  return e === "as" || e === "sc";
}

export function hasLiveSlideNav(events: LiveRawEvent[]) {
  return events.some(isLiveSlideNav);
}

export function hasRealSlide(events: LiveRawEvent[]) {
  return events.some((ev) => {
    if (!isAddSlide(ev)) return false;
    const u = slideUrlOf(ev);
    return Boolean(u) && !isRuledPaper(u);
  });
}

/** Ruled Light/Dark paper is empty. Live `as` UUID JPEGs are the writable UADoc canvas — keep them. */
export function overlayLiveSnapshot(events: LiveRawEvent[], seedUrl: string, _uadoc = false) {
  const withoutSeed = events.filter((ev) => {
    const d = asObj(ev.data);
    if (ev.plugin === "dcn" && asStr(d?.uid) === "live0") return false;
    const u = slideUrlOf(ev);
    if (u && isRuledPaper(u)) return false;
    return true;
  });
  if (hasRealSlide(withoutSeed)) return withoutSeed;
  const seed = seedUrl && !isRuledPaper(seedUrl) && !isMintedTitleCard(seedUrl) ? seedUrl : "";
  if (seed) return [...seedSlideEvents(seed), ...withoutSeed];
  return withoutSeed;
}

export function isRuledPaper(url: string) {
  return /\/live_class\/background\/(?:Light|Dark)\.jpg/i.test(url);
}

/** Packed timeline has a real page or ink — not blank paper. UUID UADoc JPEGs are the live canvas. */
export function timelineHasBoard(tl: {
  strokes?: { oid?: string }[];
  slides?: { uid: string; url?: string }[];
}) {
  if ((tl.strokes?.length ?? 0) > 0) return true;
  return (tl.slides ?? []).some((s) => {
    if (!s.url || s.uid === "blank") return false;
    const abs = upstreamSlideUrl(s.url);
    if (isRuledPaper(abs)) return false;
    return true;
  });
}

/** UADoc classes write into a UUID JPEG. Pin that raster unless a PDF is the current page. */
export function pinLiveRaster<T extends { slides: { uid: string; url?: string; t?: number }[]; switches: { t: number; uid: string }[] }>(
  tl: T,
): T {
  const last = tl.switches.length ? tl.switches[tl.switches.length - 1] : undefined;
  const on = last ? tl.slides.find((s) => s.uid === last.uid) : undefined;
  if (on?.url && isPdfNotes(on.url)) return tl;
  const rasters = tl.slides.filter((s) => {
    if (!s.url || s.uid === "blank") return false;
    return isLiveBoardRaster(s.url);
  });
  const live = rasters[rasters.length - 1];
  if (!live) return tl;
  if (last?.uid === live.uid) return tl;
  const t = Math.max(0, ...tl.switches.map((s) => s.t), live.t ?? 0);
  return {
    ...tl,
    switches: [...tl.switches, { t, uid: live.uid }],
  };
}

/** `as` inserts a slide but live often never sends `sc`. Pin the last real page if we are still on blank. */
export function pinLiveSlide<T extends { slides: { uid: string; url?: string }[]; switches: { t: number; uid: string }[] }>(
  tl: T,
): T {
  const isBoard = (s: { uid: string; url?: string }) => {
    if (!s.url || s.uid === "blank") return false;
    const abs = upstreamSlideUrl(s.url);
    if (isRuledPaper(abs)) return false;
    return true;
  };
  const reals = tl.slides.filter(isBoard);
  const real = reals[reals.length - 1];
  if (!real) return tl;
  const last = tl.switches.length ? tl.switches[tl.switches.length - 1] : undefined;
  const on = last ? tl.slides.find((s) => s.uid === last.uid) : tl.slides[0];
  if (on && isBoard(on)) return tl;
  return {
    ...tl,
    switches: [{ t: 0, uid: real.uid }, ...tl.switches.filter((s) => s.uid !== "blank" && s.uid !== real.uid)],
  };
}

/** Live cannot scrub. Keep only the current page so a clock walk cannot flip through the deck. */
export function pinLiveNow<T extends { switches: { t: number; uid: string }[] }>(tl: T): T {
  const last = tl.switches.length ? tl.switches[tl.switches.length - 1] : undefined;
  if (!last) return tl;
  if (tl.switches.length === 1 && last.t === 0) return tl;
  return { ...tl, switches: [{ t: 0, uid: last.uid }] };
}

export const LIVE_COMPACT_MS = 80;
/** Wait for a slide-change burst to finish, then paint once. */
export const LIVE_SLIDE_SETTLE_MS = 360;
export const LIVE_INK_COMPACT_MS = 16;
/** History pages arrive oldest-first. Do not pack until the dump goes quiet. */
export const LIVE_HISTORY_SOAK_MS = 1000;

export function liveHistoryDoneSse() {
  return "event: history-done\ndata: {}\n\n";
}

/** A reconnect dump must not rebuild the board. Pack only the first catch-up. */
export function shouldPackHistoryDone(catchingUp: boolean, packedOnce: boolean) {
  return catchingUp || !packedOnce;
}

/** Trailing wait before packing. Catch-up / page-change bursts share one paint. */
export function liveCompactDelay(opts: {
  packedOnce: boolean;
  added: number;
  nav: boolean;
  catchingUp?: boolean;
}) {
  if (!opts.packedOnce || opts.catchingUp) return LIVE_HISTORY_SOAK_MS;
  if (opts.nav || opts.added > 40) return LIVE_SLIDE_SETTLE_MS;
  return LIVE_INK_COMPACT_MS;
}

/** After the first pack, a 80+ event burst is an SSE reconnect dump — merge keys, do not rebuild. */
export function shouldPackLiveBurst(opts: { packedOnce: boolean; catchingUp: boolean; added: number }) {
  if (!opts.packedOnce || opts.catchingUp) return true;
  return opts.added < 80;
}





/** Live UADoc draws on canvas 0 (the blank packed page). Put that ink on the visible slide. */
export function remapLiveInk<T extends {
  slides: { uid: string; url?: string }[];
  switches: { t: number; uid: string }[];
  strokes: { uid: string }[];
  erases?: { uid: string }[];
  cams?: { uid: string }[];
  images?: { uid: string }[];
}>(tl: T): T {
  const last = tl.switches.length ? tl.switches[tl.switches.length - 1] : undefined;
  const on = last ? tl.slides.find((s) => s.uid === last.uid) : undefined;
  if (!on || on.uid === "blank") return tl;
  const map = (uid: string) => (uid === "blank" || uid === "live0" ? on.uid : uid);
  return {
    ...tl,
    strokes: tl.strokes.map((s) => (s.uid === on.uid ? s : { ...s, uid: map(s.uid) })),
    erases: (tl.erases ?? []).map((s) => (s.uid === on.uid ? s : { ...s, uid: map(s.uid) })),
    cams: (tl.cams ?? []).map((s) => (s.uid === on.uid ? s : { ...s, uid: map(s.uid) })),
    images: (tl.images ?? []).map((s) => (s.uid === on.uid ? s : { ...s, uid: map(s.uid) })),
  };
}

/** Camera fills the stage only when Unacademy is streaming the board as video. Otherwise always board + lantern. */
export function liveFillCamera(opts: { streamCanvas: boolean; boardful?: boolean }) {
  return opts.streamCanvas;
}

/** DCN ink is the writing. Reloading the UADoc JPEG fights it and flashes the board. */
export function shouldReloadLiveRaster(opts: { hasInk: boolean; url: string }) {
  if (opts.hasInk) return false;
  if (!opts.url.includes("live=1")) return false;
  return isLiveBoardRaster(upstreamSlideUrl(opts.url));
}


export const LIVE_PROXY_HOST = "liveclass-proxy.uacdn.net";
export const LIVE_PROXY_HISTORY_LIMIT = 25_000;
export const LIVE_PROXY_MAX_PAGES = 24;
export const LIVE_WS_HISTORY_PAGES = 24;

export function isProxyToken(token: string) {
  return /^[A-Za-z0-9._-]{8,4096}$/.test(token.trim());
}

/** liveweb: GET liveclass-proxy.uacdn.net/v1/api/history/?token=&offset=&limit= */
export function liveProxyHistoryUrl(token: string, offset = 0, limit = LIVE_PROXY_HISTORY_LIMIT) {
  if (!isProxyToken(token)) return "";
  const off = Math.max(0, Math.min(500_000, Math.floor(Number(offset) || 0)));
  const lim = Math.max(1, Math.min(LIVE_PROXY_HISTORY_LIMIT, Math.floor(Number(limit) || LIVE_PROXY_HISTORY_LIMIT)));
  const u = new URL(`https://${LIVE_PROXY_HOST}/v1/api/history/`);
  u.searchParams.set("token", token.trim());
  u.searchParams.set("offset", String(off));
  u.searchParams.set("limit", String(lim));
  return u.toString();
}

function asArr(v: unknown) {
  return Array.isArray(v) ? v : [];
}

/** Janus videoroom history: `{ plugindata: { data: { list: [{ data: json }], has_more } } }`. */
export function parseProxyHistory(body: unknown): { events: LiveRawEvent[]; hasMore: boolean; count: number } {
  const row = asObj(body) || {};
  const plugin = asObj(row.plugindata) || {};
  const data = asObj(plugin.data) || asObj(row.data) || row;
  const list = asArr(data.list).length ? asArr(data.list) : asArr(row.list);
  const events: LiveRawEvent[] = [];
  for (const item of list) {
    const o = asObj(item) || {};
    const raw = "data" in o ? o.data : item;
    const parsed = typeof raw === "string" ? parseJson(raw) : raw;
    if (parsed == null) continue;
    const fallback = asNum(
      o.p_time,
      asNum(asObj(parsed)?.p_time, liveEventTimeUs(asObj(parsed) || o, 0)),
    );
    events.push(...extractLiveEvents(parsed, fallback));
  }
  const hasMore = data.has_more === true || row.has_more === true;
  return { events, hasMore, count: list.length };
}

export async function pullProxyHistoryPages(
  token: string,
  getJson: (url: string) => Promise<unknown>,
): Promise<LiveRawEvent[]> {
  const out: LiveRawEvent[] = [];
  let offset = 0;
  for (let page = 0; page < LIVE_PROXY_MAX_PAGES; page += 1) {
    const url = liveProxyHistoryUrl(token, offset);
    if (!url) break;
    let body: unknown;
    try {
      body = await getJson(url);
    } catch {
      break;
    }
    const { events, hasMore, count } = parseProxyHistory(body);
    out.push(...events);
    if (!hasMore || !count) break;
    offset += count;
    if (out.length > 80_000) break;
  }
  return out;
}

export function liveBoardStreamUrl(classId: string) {
  if (!/^[A-Za-z0-9]{4,16}$/.test(classId)) return "";
  return `/api/live-board?uid=${encodeURIComponent(classId)}`;
}

export const HANDOUTS_HOST = "handouts.unacademy.com";
export const HANDOUTS_LIST_URL = `https://${HANDOUTS_HOST}/api/v1/handouts`;

export function isHandoutsHost(url: URL) {
  return url.protocol === "https:" && url.hostname === HANDOUTS_HOST;
}

export function isHandoutToken(token: string) {
  return /^[A-Za-z0-9._-]{8,4096}$/.test(token.trim());
}

/** GET /api/v1/handouts → items[].slide_url for presented PDFs. */
export function parseHandoutSlides(body: unknown): string[] {
  const row = asObj(body) || {};
  const items = asArr(row.items).length ? asArr(row.items) : asArr(row.results);
  const urls: string[] = [];
  for (const item of items) {
    const o = asObj(item) || {};
    const details = asObj(o.details) || {};
    const u =
      asStr(o.slide_url) ||
      asStr(o.slideUrl) ||
      asStr(details.slide_url) ||
      asStr(details.slideUrl) ||
      asStr(o.url);
    if (!/^https:\/\//i.test(u)) continue;
    try {
      const host = new URL(u).hostname;
      if (!(host === "uacdn.net" || host.endsWith(".uacdn.net"))) continue;
    } catch {
      continue;
    }
    if (isRuledPaper(u)) continue;
    if (isMintedTitleCard(u)) continue;
    urls.push(u);
  }
  return urls;
}

export function seedHandoutEvents(urls: string[]): LiveRawEvent[] {
  const out: LiveRawEvent[] = [];
  urls.forEach((u, i) => {
    out.push({ plugin: "dcn", p_time: i, data: { e: "as", i, uid: `hand${i}`, u, bc: "#202022" } });
  });
  if (out.length) out.push({ plugin: "dcn", p_time: urls.length, data: { e: "sc", s: 0 } });
  return out;
}

export function encodeLiveSse(events: LiveRawEvent[]) {
  if (!events.length) return "";
  return `data: ${JSON.stringify(events)}\n\n`;
}

/**
 * Keep Unacademy's class websocket open on the server (browser Origin is often refused)
 * and push cw/dcn events. Pages QUERY_HISTORY then stays for BROADCAST.
 */
export function watchLiveSocket(opts: {
  jwt: string;
  classId: string;
  goalUid: string;
  uid: string;
  wsDomain?: string;
  signal?: AbortSignal;
  onEvents: (events: LiveRawEvent[]) => void;
  onReady?: () => void;
}): Promise<void> {
  const url = liveWsUrl(opts.wsDomain || "ws.unacademy.com");
  const keys = new Set<string>();
  return new Promise((resolve) => {
    let settled = false;
    let sub = 0;
    let pages = 0;
    let ping = 0;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve();
      return;
    }
    const finish = () => {
      if (settled) return;
      settled = true;
      windowClear(ping);
      try {
        opts.signal?.removeEventListener("abort", onAbort);
      } catch {
        /* ignore */
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve();
    };
    const onAbort = () => finish();
    opts.signal?.addEventListener("abort", onAbort);
    if (opts.signal?.aborted) {
      finish();
      return;
    }

    const askHistory = (at = Date.now()) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (pages >= LIVE_WS_HISTORY_PAGES) return;
      pages += 1;
      ws.send(JSON.stringify(liveHistoryBody(opts.classId, opts.goalUid, at)));
    };

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(liveSubscribeBody(opts.jwt, opts.classId, opts.uid || "AN_INK")));
    });
    ws.addEventListener("message", (ev) => {
      void decodeLivePayload(ev.data).then((parsed) => {
        if (settled || parsed == null) return;
        const kind = socketInfoKind(parsed);
        if (kind === "subscribed") {
          sub += 1;
          if (sub >= 1) {
            opts.onReady?.();
            askHistory();
          }
          return;
        }
        if (kind === "pong") return;
        const incoming = extractLiveEvents(parsed);
        if (!incoming.length) return;
        const unique: LiveRawEvent[] = [];
        for (const row of incoming) {
          const k = eventKey(row);
          if (keys.has(k)) continue;
          keys.add(k);
          unique.push(row);
        }
        if (unique.length) opts.onEvents(unique);
        const obj = parsed && typeof parsed === "object" ? (parsed as { type?: string }) : null;
        if ((obj?.type === "HISTORY" || obj?.type === "DATA") && unique.length > 20 && pages < LIVE_WS_HISTORY_PAGES) {
          const oldest = unique.reduce((m, ev) => Math.min(m, ev.p_time ?? m), Date.now() * 1000);
          askHistory(Math.max(0, oldest / 1000 - 1));
        }
      });
    });
    ws.addEventListener("error", () => finish());
    ws.addEventListener("close", () => finish());
    ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(liveHeartbeat()));
        } catch {
          finish();
        }
      }
    }, 20_000) as unknown as number;
  });
}

/** Stay on the class websocket until abort. A drop must not close the SSE door. */
export async function watchLiveSocketLoop(opts: Parameters<typeof watchLiveSocket>[0]): Promise<void> {
  while (!opts.signal?.aborted) {
    await watchLiveSocket(opts);
    if (opts.signal?.aborted) return;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function windowClear(id: number) {
  try {
    clearInterval(id);
  } catch {
    /* ignore */
  }
}

/** Server-side: subscribe, ask history, collect cw/dcn for a short window. Browser WS may be origin-blocked. */
export function pullLiveHistory(opts: {
  jwt: string;
  classId: string;
  goalUid: string;
  uid: string;
  wsDomain?: string;
  ms?: number;
}): Promise<LiveRawEvent[]> {
  const wait = Math.min(4_000, Math.max(400, opts.ms ?? 1_800));
  const events: LiveRawEvent[] = [];
  const keys = new Set<string>();
  const url = liveWsUrl(opts.wsDomain || "ws.unacademy.com");
  return new Promise((resolve) => {
    let settled = false;
    let sub = 0;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolve([]);
      return;
    }
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(events);
    };
    const timer = setTimeout(finish, wait);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(liveSubscribeBody(opts.jwt, opts.classId, opts.uid || "AN_INK")));
    });
    ws.addEventListener("message", (ev) => {
      void decodeLivePayload(ev.data).then((parsed) => {
        if (parsed == null) return;
        const kind = socketInfoKind(parsed);
        if (kind === "subscribed") {
          sub += 1;
          if (sub >= 2) {
            ws.send(JSON.stringify(liveHistoryBody(opts.classId, opts.goalUid)));
          }
          return;
        }
        if (kind === "pong") return;
        mergeLiveEvents(events, extractLiveEvents(parsed), keys);
      });
    });
    ws.addEventListener("error", () => finish());
    ws.addEventListener("close", () => finish());
  });
}

