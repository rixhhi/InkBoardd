/** Janus HTTP videoroom listener (Unacademy 0.x / 1.x compatible). */

export function janusTx() {
  return Math.random().toString(36).slice(2, 12);
}

export function janusCreate(token: string, transaction = janusTx()) {
  return { janus: "create", token, transaction };
}

export function janusAttach(token: string, transaction = janusTx()) {
  return { janus: "attach", plugin: "janus.plugin.videoroom", token, transaction };
}

export function janusKeepalive(token: string, transaction = janusTx()) {
  return { janus: "keepalive", token, transaction };
}

export function janusDestroy(token: string, transaction = janusTx()) {
  return { janus: "destroy", token, transaction };
}

/** Plugin body must carry the full Janus token — a room pin is not enough.
 * Unacademy liveweb joins as Janus videoroom `listener` (not stock `subscriber`). */
export function janusJoin(opts: {
  room: number;
  feed: number;
  token: string;
  transaction?: string;
  ptype?: "listener" | "subscriber";
}) {
  return {
    janus: "message",
    token: opts.token,
    transaction: opts.transaction || janusTx(),
    body: {
      request: "join",
      room: opts.room,
      ptype: opts.ptype || "listener",
      feed: opts.feed,
      token: opts.token,
      offer_audio: true,
      offer_video: true,
      offer_data: true,
      data: true,
      audio: true,
      video: true,
    },
  };
}

export function janusStart(opts: { room: number; token: string; sdp: string; transaction?: string }) {
  return {
    janus: "message",
    token: opts.token,
    transaction: opts.transaction || janusTx(),
    body: { request: "start", room: opts.room },
    jsep: { type: "answer", sdp: opts.sdp },
  };
}

export function janusTrickle(opts: {
  token: string;
  candidate: RTCIceCandidate | null;
  transaction?: string;
}) {
  const transaction = opts.transaction || janusTx();
  if (!opts.candidate) {
    return { janus: "trickle", token: opts.token, transaction, candidate: { completed: true } };
  }
  return {
    janus: "trickle",
    token: opts.token,
    transaction,
    candidate: {
      candidate: opts.candidate.candidate,
      sdpMid: opts.candidate.sdpMid,
      sdpMLineIndex: opts.candidate.sdpMLineIndex,
    },
  };
}

export type JanusEvent = {
  janus: string;
  error?: string;
  attached?: boolean;
  hangup?: boolean;
  webrtcup?: boolean;
  jsep?: { type: string; sdp: string };
};

export function parseJanusEvent(raw: unknown): JanusEvent[] {
  const rows = Array.isArray(raw) ? raw : [raw];
  const out: JanusEvent[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const e = row as Record<string, unknown>;
    const janus = typeof e.janus === "string" ? e.janus : "";
    const plugin = e.plugindata && typeof e.plugindata === "object" ? (e.plugindata as Record<string, unknown>) : {};
    const data = plugin.data && typeof plugin.data === "object" ? (plugin.data as Record<string, unknown>) : {};
    const jsepRaw = e.jsep && typeof e.jsep === "object" ? (e.jsep as Record<string, unknown>) : null;
    const error =
      typeof data.error === "string"
        ? data.error
        : typeof e.error === "object" && e.error && typeof (e.error as { reason?: string }).reason === "string"
          ? (e.error as { reason: string }).reason
          : janus === "error" && typeof e.error === "string"
            ? e.error
            : "";
    const jsep =
      jsepRaw && typeof jsepRaw.sdp === "string" && typeof jsepRaw.type === "string"
        ? { type: jsepRaw.type, sdp: jsepRaw.sdp }
        : undefined;
    out.push({
      janus,
      error: error || undefined,
      attached: data.videoroom === "attached",
      hangup: janus === "hangup" || data.videoroom === "unpublished" || data.videoroom === "leaving",
      webrtcup: janus === "webrtcup",
      jsep,
    });
  }
  return out;
}

export function sdpHasData(sdp: string) {
  return /m=application\s/i.test(sdp);
}

export async function janusPost(url: string, body: unknown, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Janus ${res.status}`);
  return res.json();
}

export async function janusPoll(sessionUrl: string, signal?: AbortSignal) {
  const res = await fetch(`${sessionUrl}?maxev=1&rid=${Date.now()}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`Janus poll ${res.status}`);
  return res.json();
}
