import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { canJoinLive, holdJoinableSession, iceServersFromTurns, janusBases, janusHttpUrl, liveJoinKey, parseLiveSession } from "@inkboard/shared/live-session";
import { janusJoin, janusStart, parseJanusEvent } from "@inkboard/shared/janus-listen";

const TOKEN =
  "1791036056,janus,janus.plugin.videoroom,janus.plugin.streaming,listen_room=9005033:qm5a3EtqTsRjuxWQNhSD7x02Qis=";

const publicBody = {
  state: 10,
  room: 9005033,
  feed: 32692400,
  token: TOKEN,
  server: "educator1.unacademy.com/j8ot6now",
  kube_domain: "janus-learner-004.unacademy.com/j8ot6now",
  use_canvas: 0,
  jwt: "eyJ",
  llhls: { is_enabled: false, urls: [] },
  hls_url: "",
  feeds: [
    {
      feed_id: 32692400,
      user: { first_name: "Ajay", last_name: "Mishra (Akm)" },
    },
  ],
  turn_servers: [
    {
      username: "u",
      credential: "c",
      urls: "turn:tcpturn.unacademy.com:8080?transport=tcp",
    },
  ],
};

describe("live session", () => {
  it("builds a Janus HTTP url only on unacademy hosts", () => {
    assert.equal(janusHttpUrl("educator1.unacademy.com/j8ot6now"), "https://educator1.unacademy.com/j8ot6now/janus");
    assert.equal(janusHttpUrl("https://janus-learner-004.unacademy.com/abc"), "https://janus-learner-004.unacademy.com/abc/janus");
    assert.equal(janusHttpUrl("evil.example.com/x"), "");
    assert.equal(janusHttpUrl("unacademy.com.evil.net/x"), "");
  });

  it("parses a public listener token", () => {
    const s = parseLiveSession("J8OT6NOW", publicBody, 200);
    assert.equal(s.gated, false);
    assert.equal(s.room, 9005033);
    assert.equal(s.feed, 32692400);
    assert.equal(s.display, "Ajay Mishra (Akm)");
    assert.equal(s.janusUrl, "https://educator1.unacademy.com/j8ot6now/janus");
    assert.equal(s.janusToken, TOKEN);
    assert.equal(canJoinLive(s), true);
    assert.deepEqual(janusBases(s)[0], s.janusUrl);
    assert.equal(s.iceServers[0]?.urls, "turn:tcpturn.unacademy.com:8080?transport=tcp");
    assert.equal(s.wsDomain, "ws.unacademy.com");
    assert.equal(s.className, "");
    assert.equal(s.streamCanvas, false);
    assert.equal(s.proxyToken, "");
  });

  it("joins a live room even while Janus state is still 0", () => {
    const s = parseLiveSession("WC23KRK1", { ...publicBody, state: 0 }, 200);
    assert.equal(canJoinLive(s), true);
    const noFeed = parseLiveSession("WC23KRK1", { ...publicBody, state: 0, feeds: [], feed: 0 }, 200);
    assert.equal(canJoinLive(noFeed), false);
  });

  it("keeps the handouts access token", () => {
    const s = parseLiveSession("WC23KRK1", {
      ...publicBody,
      live_class: { name: "World Geography Through Maps X", author: { first_name: "Sudarshan", last_name: "Gurjar" } },
      handouts: { access_token: "59bc240a03085e0a511e8c0f-dba19ed29ce969d82a09b916a7ba60b0", enabled: true },
    }, 200);
    assert.equal(s.className, "World Geography Through Maps X");
    assert.equal(s.educatorName, "Sudarshan Gurjar");
    assert.match(s.handoutToken, /^59bc240a/);
  });

  it("keeps the liveclass-proxy token from /token/", () => {
    const s = parseLiveSession("J8OT6NOW", { ...publicBody, proxy_token: "38-d90c50f8f066f7f4" }, 200);
    assert.equal(s.proxyToken, "38-d90c50f8f066f7f4");
    const bad = parseLiveSession("J8OT6NOW", { ...publicBody, proxy_token: "https://evil" }, 200);
    assert.equal(bad.proxyToken, "");
  });

  it("marks Plus doors as gated on 400", () => {
    const s = parseLiveSession("CKKXX3CV", { message: "Invalid auth token.", error_code: "E001" }, 400);
    assert.equal(s.gated, true);
    assert.equal(canJoinLive(s), false);
    assert.match(s.message, /Invalid auth token|Plus/);
  });

  it("treats E003 403 as gated only while there is no Janus room", () => {
    const s = parseLiveSession("Z1RU910O", { message: "You do not have permission to perform this action.", error_code: "E003" }, 403);
    assert.equal(s.gated, true);
    assert.equal(canJoinLive(s), false);
  });

  it("puts the full Janus token on the plugin join, not a room pin", () => {
    const msg = janusJoin({ room: 9005033, feed: 1, token: TOKEN, transaction: "t" });
    assert.equal(msg.body.ptype, "listener");
    assert.equal(msg.body.offer_data, true);
    assert.equal(msg.body.token, TOKEN);
    assert.equal(msg.token, TOKEN);
    const start = janusStart({ room: 9, token: TOKEN, sdp: "v=0", transaction: "t" });
    assert.equal(start.jsep.type, "answer");
  });

  it("reads the class websocket host and uadoc flag", () => {
    const s = parseLiveSession("J8OT6NOW", {
      ...publicBody,
      use_canvas: 1,
      use_uadoc: 1,
      domain_config: { ws_domain: "ws-cdn.unacademy.com" },
      live_class: { name: "Ask me anything", rank: 1, is_special: true, author: { first_name: "Ajay" } },
    }, 200);
    assert.equal(s.useCanvas, true);
    const streamed = parseLiveSession("J8OT6NOW", { ...publicBody, stream_canvas: true, use_canvas: 1 }, 200);
    assert.equal(streamed.streamCanvas, true);
    assert.equal(streamed.useCanvas, true);
  });

  it("turns TURN rows into iceServers", () => {
    assert.equal(iceServersFromTurns([{ urls: "turn:x" }]).length, 1);
    assert.equal(iceServersFromTurns([{ urls: 1 }]).length, 0);
  });

  it("parses hangup and webrtcup from Janus events", () => {
    const rows = parseJanusEvent({ janus: "webrtcup" });
    assert.equal(rows[0]?.webrtcup, true);
    const hang = parseJanusEvent({ janus: "hangup" });
    assert.equal(hang[0]?.hangup, true);
  });

  it("does not remount Janus when the token poll mints a new JWT", () => {
    const a = parseLiveSession("J8OT6NOW", publicBody, 200);
    const b = parseLiveSession("J8OT6NOW", { ...publicBody, token: TOKEN.replace("1791036056", "1791039999") }, 200);
    assert.equal(liveJoinKey(a), liveJoinKey(b));
    assert.notEqual(a.janusToken, b.janusToken);
    const empty = parseLiveSession("J8OT6NOW", { message: "This door did not open" }, 502);
    assert.equal(holdJoinableSession(a, empty), a);
    assert.equal(holdJoinableSession(a, b), b);
    const gated = parseLiveSession("CKKXX3CV", { message: "Invalid auth token." }, 400);
    assert.equal(holdJoinableSession(a, gated), gated);
    const src = readFileSync(new URL("../components/janus-cam.tsx", import.meta.url), "utf8");
    assert.ok(src.includes("liveJoinKey"));
    assert.ok(src.includes("const joinToken = joined.janusToken"));
    assert.ok(src.includes("pendingOld"));
    assert.equal(src.includes("sessionRef.current?.janusToken"), false);
    assert.equal(src.includes("tearPc(false)"), false);
  });

  it("opens a Janus datachannel so live ink is not stuck on history dumps", () => {
    const src = readFileSync(new URL("../components/janus-cam.tsx", import.meta.url), "utf8");
    assert.ok(src.includes('createDataChannel("JanusDataChannel")'));
    assert.ok(src.includes("bindData"));
    assert.ok(src.includes("pc.ondatachannel"));
    assert.ok(src.includes('ptype: "listener"'));
    const stage = readFileSync(new URL("../components/live-stage.tsx", import.meta.url), "utf8");
    assert.ok(stage.includes("liveFillCamera"));
    assert.ok(stage.includes("Resize teacher"));
    assert.ok(stage.includes("Move teacher"));
    assert.ok(stage.includes("196"));
    const board = readFileSync(new URL("../../../backend/src/routes/http/live-board.ts", import.meta.url), "utf8");
    assert.ok(board.includes("pullProxyHistoryPages"));
    assert.ok(board.includes("proxyToken"));
    assert.equal(board.includes("seedTitleCard"), false);
    assert.equal(board.includes("FIRST_SLIDE_URL"), false);
  });
});
