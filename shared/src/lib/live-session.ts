/** Parse Unacademy live-class /token/ into a Janus listener session. */

export type LiveTurn = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type LiveSession = {
  classId: string;
  state: number;
  gated: boolean;
  message: string;
  room: number;
  feed: number;
  display: string;
  janusToken: string;
  janusUrl: string;
  kubeUrl: string;
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  useCanvas: boolean;
  useUadoc: boolean;
  streamCanvas: boolean;
  hlsUrl: string | null;
  jwt: string;
  wsDomain: string;
  className: string;
  courseName: string;
  educatorName: string;
  rank: string;
  special: boolean;
  proxyToken: string;
  handoutToken: string;
};

const JANUS_HOST = /^(?:[a-z0-9-]+\.)*unacademy\.com$/i;

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asStr(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function asNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asArr(v: unknown) {
  return Array.isArray(v) ? v : [];
}

/** `educator1.unacademy.com/j8ot6now` → `https://educator1.unacademy.com/j8ot6now/janus` */
export function janusHttpUrl(server: string): string {
  const raw = server.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!raw) return "";
  const host = raw.split("/")[0] || "";
  if (!JANUS_HOST.test(host)) return "";
  return `https://${raw}/janus`;
}

export function iceServersFromTurns(rows: unknown): LiveSession["iceServers"] {
  const out: LiveSession["iceServers"] = [];
  for (const row of asArr(rows)) {
    const t = asObj(row);
    const urls = t.urls;
    if (typeof urls !== "string" && !Array.isArray(urls)) continue;
    const list = Array.isArray(urls) ? urls.map(asStr).filter(Boolean) : asStr(urls);
    if (!list || (Array.isArray(list) && !list.length)) continue;
    const ice: LiveSession["iceServers"][number] = { urls: list };
    const user = asStr(t.username);
    const cred = asStr(t.credential);
    if (user) ice.username = user;
    if (cred) ice.credential = cred;
    out.push(ice);
  }
  return out;
}

function firstHls(raw: unknown, fallback: string): string | null {
  const urls = asArr(asObj(raw).urls)
    .map(asStr)
    .filter((u) => /^https:\/\//i.test(u));
  if (urls[0]) return urls[0];
  const h = asStr(fallback);
  return /^https:\/\//i.test(h) ? h : null;
}

function feedId(raw: unknown, fallback: unknown): number {
  const feeds = asArr(raw);
  const first = asObj(feeds[0]);
  return asNum(first.feed_id ?? first.id) || asNum(fallback);
}

function displayName(raw: unknown): string {
  const feeds = asArr(raw);
  const user = asObj(asObj(feeds[0]).user);
  const name = `${asStr(user.first_name)} ${asStr(user.last_name)}`.trim();
  return name;
}

function wsDomainOf(raw: unknown): string {
  const cfg = asObj(raw);
  const host = asStr(cfg.ws_domain).replace(/^wss?:\/\//i, "").replace(/\/.*$/, "");
  if (/^(?:[a-z0-9-]+\.)*unacademy\.com$/i.test(host)) return host;
  return "ws.unacademy.com";
}

/** liveweb `proxy_token` — hex with an optional `digits-` prefix. */
export function asProxyToken(raw: unknown): string {
  const t = asStr(raw).trim();
  return /^[A-Za-z0-9._-]{8,4096}$/.test(t) ? t : "";
}

export function parseLiveSession(classId: string, body: unknown, status: number): LiveSession {
  const row = asObj(body);
  const gated = status === 400 || status === 401 || status === 403;
  const message = asStr(row.message || row.error_code);
  const server = asStr(row.server);
  const kube = asStr(row.kube_domain);
  const empty: LiveSession = {
    classId,
    state: asNum(row.state),
    gated,
    message: gated ? message || "This door is Plus" : message,
    room: 0,
    feed: 0,
    display: "",
    janusToken: "",
    janusUrl: "",
    kubeUrl: "",
    iceServers: [],
    useCanvas: false,
    useUadoc: false,
    streamCanvas: false,
    hlsUrl: null,
    jwt: "",
    wsDomain: "ws.unacademy.com",
    className: "",
    courseName: "",
    educatorName: "",
    rank: "",
    special: false,
    proxyToken: "",
    handoutToken: "",
  };
  if (gated) return empty;

  const liveClass = asObj(row.live_class);
  const programme = asObj(liveClass.programme);
  const author = asObj(liveClass.author);
  const className = asStr(liveClass.name) || asStr(programme.name);
  const courseName = asStr(programme.name);
  const educatorName =
    `${asStr(author.first_name || author.firstName)} ${asStr(author.last_name || author.lastName)}`.trim() ||
    displayName(row.feeds);
  const rank = asStr(liveClass.rank) || (asNum(liveClass.rank) ? String(asNum(liveClass.rank)) : "");
  const special = liveClass.is_special === true || programme.is_special === true;

  const token = asStr(row.token);
  const room = asNum(row.room);
  const feed = feedId(row.feeds, row.feed);
  const janusUrl = janusHttpUrl(server);
  if (!token || !room || !feed || !janusUrl) {
    return {
      ...empty,
      message: empty.message || "No live picture",
      jwt: asStr(row.jwt),
      wsDomain: wsDomainOf(row.domain_config),
      className,
      courseName,
      educatorName,
      rank,
      special,
      proxyToken: asProxyToken(row.proxy_token),
      handoutToken: asProxyToken(asObj(row.handouts).access_token),
    };
  }

  const ice = [
    ...iceServersFromTurns(row.turn_servers),
    ...iceServersFromTurns(row.backup_turn_servers),
  ];

  return {
    classId,
    state: asNum(row.state),
    gated: false,
    message: "",
    room,
    feed,
    display: displayName(row.feeds),
    janusToken: token,
    janusUrl,
    kubeUrl: janusHttpUrl(kube),
    iceServers: ice,
    useCanvas: asNum(row.use_canvas) === 1 || asNum(row.use_handwriting) === 1,
    useUadoc: asNum(row.use_uadoc) === 1,
    streamCanvas: row.stream_canvas === true || asNum(row.stream_canvas) === 1,
    hlsUrl: firstHls(row.llhls, asStr(row.hls_url)),
    jwt: asStr(row.jwt),
    wsDomain: wsDomainOf(row.domain_config),
    className,
    courseName,
    educatorName,
    rank,
    special,
    proxyToken: asProxyToken(row.proxy_token),
    handoutToken: asProxyToken(asObj(row.handouts).access_token),
  };
}

export function canJoinLive(s: LiveSession) {
  if (s.gated || !s.janusUrl || !s.janusToken || !s.room || !s.feed) return false;
  return s.state === 10 || s.state === 0;
}

/** Token polls mint a new JWT; the room does not change. Remount only when this key changes. */
export function liveJoinKey(s: Pick<LiveSession, "classId" | "room" | "feed" | "janusUrl">) {
  return `${s.classId}:${s.room}:${s.feed}:${s.janusUrl}`;
}

/** Keep the last joinable session when a token poll returns an empty/error body. */
export function holdJoinableSession(held: LiveSession | undefined, next: LiveSession | undefined): LiveSession | undefined {
  if (next?.gated) return next;
  if (next && canJoinLive(next)) return next;
  if (held && canJoinLive(held)) return held;
  return next ?? held;
}

export function janusBases(s: LiveSession): string[] {
  return [s.janusUrl, s.kubeUrl].filter((u, i, a) => u && a.indexOf(u) === i);
}

export function emptyLiveSession(classId: string, extra: Partial<LiveSession> = {}): LiveSession {
  return {
    classId,
    state: 10,
    gated: false,
    message: "",
    room: 0,
    feed: 0,
    display: "",
    janusToken: "",
    janusUrl: "",
    kubeUrl: "",
    iceServers: [],
    useCanvas: false,
    useUadoc: false,
    streamCanvas: false,
    hlsUrl: null,
    jwt: "",
    wsDomain: "ws.unacademy.com",
    className: "",
    courseName: "",
    educatorName: "",
    rank: "",
    special: false,
    proxyToken: "",
    handoutToken: "",
    ...extra,
  };
}
