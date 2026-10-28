import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compactEvents, slideAt } from "@inkboard/shared/dcn";
import {
  firstSlideBody,
  firstSlideReady,
  firstSlideTheme,
  asLiveEvent,
  bumpLiveOrigin,
  extractLiveEvents,
  extractLiveBundle,
  hasSlideAdd,
  jwtFields,
  liveClockMs,
  lastBoardMs,
  liveCompactDelay,
  shouldPackLiveBurst,
  liveEventTimeUs,
  livePaintClock,
  liveHeartbeat,
  liveHistoryBody,
  liveSubscribeBody,
  liveWsUrl,
  mergeLiveEvents,
  hasRealSlide,
  isMintedTitleCard,
  overlayLiveSnapshot,
  pinLiveNow,
  pinLiveRaster,
  pinLiveSlide,
  remapLiveInk,
  liveFillCamera,
  shouldReloadLiveRaster,
  timelineHasBoard,
  decodeLivePayload,
  encodeLiveSse,
  liveHistoryDoneSse,
  liveBoardSrc,
  liveBoardStreamUrl,
  liveSlideSrc,
  parseFirstSlideBody,
  parseProxyHistory,
  pullProxyHistoryPages,
  refreshLiveSlides,
  upstreamSlideUrl,
  isLiveBoardRaster,
  liveProxyHistoryUrl,
  seedSlideEvents,
  socketInfoKind,
  LIVE_INK_COMPACT_MS,
  LIVE_SLIDE_SETTLE_MS,
  LIVE_HISTORY_SOAK_MS,
  LIVE_WS_HISTORY_PAGES,
  LIVE_PROXY_MAX_PAGES,
} from "@inkboard/shared/live-dcn";

describe("live DCN envelopes", () => {
  it("only allows Unacademy websocket hosts", () => {
    assert.equal(liveWsUrl("ws.unacademy.com"), "wss://ws.unacademy.com/ws");
    assert.equal(liveWsUrl("wss://ws-cdn.unacademy.com/x"), "wss://ws-cdn.unacademy.com/ws");
    assert.equal(liveWsUrl("evil.example.com"), "wss://ws.unacademy.com/ws");
    assert.equal(liveWsUrl("unacademy.com.evil.net"), "wss://ws.unacademy.com/ws");
  });

  it("builds subscribe + history + heartbeat the way liveweb does", () => {
    const sub = liveSubscribeBody("jwt", "J8OT6NOW", "AN_YVYTX3");
    assert.deepEqual(sub.subscriptions, ["chat:liveclass:J8OT6NOW", "chat:liveclass:J8OT6NOW:uid:AN_YVYTX3"]);
    const hist = liveHistoryBody("J8OT6NOW", "YOTUH", 1_700_000_000_000);
    const inner = JSON.parse(hist.messages[0]!.text);
    assert.equal(inner.command, "QUERY_HISTORY");
    assert.equal(JSON.parse(inner.text).goal_uid, "YOTUH");
    assert.equal(liveHeartbeat().heart_beat, "ping");
  });

  it("reads uid and goal from the live JWT", () => {
    const payload = Buffer.from(
      JSON.stringify({ uid: "AN_YVYTX3", goal_uid: "YOTUH", persona: "learner" }),
    ).toString("base64url");
    const jwt = `eyJhbGciOiJub25lIn0.${payload}.x`;
    assert.deepEqual(jwtFields(jwt), { uid: "AN_YVYTX3", goalUid: "YOTUH" });
    assert.deepEqual(jwtFields("nope"), { uid: "", goalUid: "" });
  });

  it("pulls cw/dcn events out of BROADCAST, HISTORY, and datachannel JSON", () => {
    const stroke = {
      plugin: "cw",
      p_time: 2_000_000,
      data: { id: 1, data: { e: "d", p: { x: 0.2, y: 0.3, oid: "a" } } },
    };
    const slide = { plugin: "dcn", p_time: 0, data: { e: "as", i: 1, uid: "s0", u: "https://static.uacdn.net/s0.pdf?page=1" } };
    const broadcast = {
      type: "DATA",
      text: JSON.stringify({ command: "BROADCAST", text: JSON.stringify(stroke) }),
    };
    const fromBroadcast = extractLiveEvents(broadcast);
    assert.equal(fromBroadcast.length, 1);
    assert.equal(fromBroadcast[0]?.plugin, "cw");
    assert.equal(fromBroadcast[0]?.p_time, 2_000_000);
    const history = {
      type: "DATA",
      text: JSON.stringify({
        type: "HISTORY",
        text: JSON.stringify([
          { message: JSON.stringify({ type: "MESSAGE", text: JSON.stringify({ is_paid: false, text: "hi" }) }) },
          { message: JSON.stringify({ type: "MESSAGE", text: JSON.stringify(slide) }) },
        ]),
      }),
    };
    const fromHist = extractLiveEvents(history);
    assert.equal(fromHist.length, 1);
    assert.equal(fromHist[0]?.plugin, "dcn");

    const dc = extractLiveEvents([slide, stroke]);
    assert.equal(dc.length, 2);
    assert.equal(asLiveEvent({ plugin: "chat" }, 0), null);
  });

  it("maps plugin-less liveweb fields and cio image objects onto the board", () => {
    const as = extractLiveEvents({ type: "as", url: "https://uadoc.uacdn.net/live_class/5UMG3D6S/notes.pdf", index: 0 });
    assert.equal(as[0]?.plugin, "dcn");
    assert.equal((as[0]?.data as { u?: string }).u, "https://uadoc.uacdn.net/live_class/5UMG3D6S/notes.pdf");
    const cio = extractLiveEvents({
      plugin: "dcn",
      type: "cio",
      objectId: "img1",
      url: "https://uadoc.uacdn.net/live_class/5UMG3D6S/page.jpg",
    });
    assert.equal(cio[0]?.plugin, "cw");
    const tl = compactEvents("LIVE1", [cio]);
    assert.ok(tl.slides.some((s) => s.url?.includes("page.jpg") || s.url?.includes("/api/slide")));
  });

  it("compacts extracted live events onto a board", () => {
    const evs = extractLiveEvents({
      plugin: "cw",
      p_time: 1_000_000,
      data: { id: 0, data: { e: "d", p: { x: 0.1, y: 0.2, oid: "o1" } } },
    });
    evs.push(
      ...extractLiveEvents({
        plugin: "cw",
        p_time: 1_100_000,
        data: { id: 0, data: { e: "u", p: { x: 0.4, y: 0.5 } } },
      }),
    );
    const tl = compactEvents("LIVE1", [evs]);
    assert.equal(tl.kind, "board");
    assert.equal(tl.strokes.length, 1);
    assert.equal(tl.strokes[0]?.oid, "o1");
  });

  it("reads INFO subscribed / pong and advances the live clock", () => {
    assert.equal(socketInfoKind({ type: "INFO", text: "subscribed to chat:liveclass:X" }), "subscribed");
    assert.equal(socketInfoKind({ type: "INFO", text: "pong" }), "pong");
    assert.equal(socketInfoKind({ type: "DATA" }), null);
    const origin = bumpLiveOrigin({ p: 0, wall: 1000 }, 45_000_000, 2000);
    assert.equal(origin.p, 45_000);
    assert.equal(liveClockMs(origin.p, origin.wall, 3500, 0), 45_000 + 1500);
    assert.equal(liveClockMs(origin.p, origin.wall, 3500), 45_000 + 1500 + 1600);
    assert.equal(lastBoardMs({ strokes: [{ t: 10_000, te: 12_000 }], slides: [{ t: 8_000 }], switches: [{ t: 9_000 }] }), 12_000);
    assert.equal(
      livePaintClock({ strokes: [{ t: 80_000, te: 81_000 }] }, origin, 3500),
      81_000 + 1600,
    );
    const store: ReturnType<typeof extractLiveEvents> = [];
    const keys = new Set<string>();
    const first = mergeLiveEvents(store, extractLiveEvents({ plugin: "dcn", p_time: 1, data: { e: "as", uid: "s0" } }), keys);
    const again = mergeLiveEvents(store, extractLiveEvents({ plugin: "dcn", p_time: 1, data: { e: "as", uid: "s0" } }), keys);
    assert.equal(first.added, 1);
    assert.equal(again.added, 0);
    assert.equal(store.length, 1);
  });

  it("posts the liveweb title-card body, never the class uid", () => {
    const body = firstSlideBody({
      className: "Ask me anything about Neet ug",
      courseName: "Ask me anything about Neet ug",
      educatorName: "Ajay Mishra (Akm)",
      rank: 1,
      special: true,
    });
    assert.equal(body.class_name, "Ask me anything about Neet ug");
    assert.equal(body.educator_name, "Ajay Mishra (Akm)");
    assert.equal(body.theme, "LIGHT_THEME");
    assert.equal(body.is_special, true);
    assert.equal(body.version, "v2");
    assert.equal(firstSlideReady(body), true);
    assert.equal(firstSlideReady(firstSlideBody({ className: "" })), false);
    assert.equal(firstSlideTheme(true, false), "LIGHT_THEME");
    assert.equal(firstSlideTheme(false, true), "DARK_THEME");
  });

  it("parses the first-slide snapshot URL and seeds a live board", () => {
    assert.equal(parseFirstSlideBody("https://uadoc.uacdn.net/a.jpg"), "https://uadoc.uacdn.net/a.jpg");
    assert.equal(parseFirstSlideBody('"https://uadoc.uacdn.net/a.jpg"'), "https://uadoc.uacdn.net/a.jpg");
    assert.equal(parseFirstSlideBody(JSON.stringify({ publicUrl: "https://uadoc.uacdn.net/b.jpg" })), "https://uadoc.uacdn.net/b.jpg");
    assert.equal(parseFirstSlideBody("nope"), "");
    const seed = seedSlideEvents("https://uadoc.uacdn.net/a.jpg");
    assert.equal(hasSlideAdd(seed), true);
    const tl = compactEvents("LIVE1", [seed]);
    assert.equal(slideAt(tl, 0).uid, "live0");
    assert.ok(slideAt(tl, 0).url?.includes("/api/slide"));
    const later = compactEvents("LIVE1", [seedSlideEvents("https://uadoc.uacdn.net/b.jpg")]);
    assert.ok(slideAt(later, 0).url?.includes("b.jpg"));
  });

  it("keeps real DCN slides and never paints a minted title card", () => {
    const leftover = {
      plugin: "dcn",
      p_time: 1,
      data: { e: "as", i: 0, uid: "old", u: "https://static.uacdn.net/old.pdf?page=1" },
    };
    const title = "https://uadoc.uacdn.net/10385d2a-bf0f-11f1-a4b6-86114b81c432.jpg";
    assert.equal(isMintedTitleCard(title), true);
    const rows = overlayLiveSnapshot([leftover], title, true);
    assert.equal(rows.some((ev) => ev.plugin === "dcn" && (ev.data as { uid?: string }).uid === "old"), true);
    assert.equal(rows.some((ev) => ev.plugin === "dcn" && (ev.data as { uid?: string }).uid === "live0"), false);
    assert.equal(hasRealSlide(rows), true);

    const empty = overlayLiveSnapshot([], title, true);
    assert.equal(empty.length, 0);
    assert.equal(hasRealSlide(empty), false);
    assert.equal(timelineHasBoard(compactEvents("LIVE1", [empty])), false);
    assert.equal(seedSlideEvents(title).length, 0);
    assert.equal(liveFillCamera({ streamCanvas: false, boardful: timelineHasBoard(compactEvents("LIVE1", [empty])) }), false);

    const ruled = overlayLiveSnapshot([], "https://uadoc.uacdn.net/live_class/background/Light.jpg", true);
    assert.equal(ruled.length, 0);

    const src = liveBoardSrc("J8OT6NOW", 9);
    assert.equal(src, "/api/live-slide?uid=J8OT6NOW&t=9");
    assert.equal(liveBoardSrc("../x"), "");
    const proxied = liveSlideSrc("https://uadoc.uacdn.net/now.jpg", 9);
    assert.ok(proxied.includes("/api/slide"));
    assert.ok(proxied.includes("live=1"));
    const writtenUuid = overlayLiveSnapshot(
      [{ plugin: "dcn", p_time: 4, data: { e: "as", i: 0, uid: "s1", u: title } }],
      "",
      true,
    );
    assert.equal(writtenUuid.some((ev) => ev.plugin === "dcn" && (ev.data as { uid?: string }).uid === "s1"), true);
    assert.equal(hasRealSlide(writtenUuid), true);
    assert.equal(timelineHasBoard(compactEvents("LIVE1", [writtenUuid])), true);
    assert.equal(liveFillCamera({ streamCanvas: false, boardful: timelineHasBoard(compactEvents("LIVE1", [writtenUuid])) }), false);
    const jpeg = liveSlideSrc("https://uadoc.uacdn.net/page.jpg", 0);
    assert.equal(shouldReloadLiveRaster({ hasInk: true, url: jpeg }), false);
    assert.equal(shouldReloadLiveRaster({ hasInk: false, url: jpeg }), true);
    assert.equal(shouldReloadLiveRaster({ hasInk: false, url: "/api/slide?u=https://static.uacdn.net/x.pdf" }), false);

    const written = overlayLiveSnapshot(
      [{ plugin: "dcn", p_time: 4, data: { e: "as", i: 1, uid: "s1", u: "https://uadoc.uacdn.net/page.jpg" } }],
      title,
      true,
    );
    assert.equal(written.some((ev) => ev.plugin === "dcn" && (ev.data as { uid?: string }).uid === "s1"), true);
    assert.equal(written.some((ev) => ev.plugin === "dcn" && (ev.data as { uid?: string }).uid === "live0"), false);
    assert.equal(timelineHasBoard(compactEvents("LIVE1", [written])), true);
    assert.equal(timelineHasBoard({ slides: [{ uid: "blank" }], strokes: [] }), false);
  });

  it("busts live UADoc JPEGs so writing is not frozen on the first empty fetch", () => {
    const title = "https://uadoc.uacdn.net/10385d2a-bf0f-11f1-a4b6-86114b81c432.jpg";
    assert.equal(isLiveBoardRaster(title), true);
    assert.equal(isLiveBoardRaster("https://uadoc.uacdn.net/live_class/background/Light.jpg"), false);
    const packed = compactEvents("LIVE1", [
      overlayLiveSnapshot([{ plugin: "dcn", p_time: 4, data: { e: "as", i: 0, uid: "s1", u: "https://uadoc.uacdn.net/page.jpg" } }], "", true),
    ]);
    const fresh = refreshLiveSlides(packed, 42);
    assert.ok(fresh.slides.some((s) => s.url?.includes("live=1")));
    assert.ok(!fresh.slides.some((s) => s.url?.includes("v=42")));
    assert.equal(upstreamSlideUrl(fresh.slides.find((s) => s.uid === "s1")!.url!), "https://uadoc.uacdn.net/page.jpg");
  });

  it("normalizes liveweb type/url/objectId events onto the packed board", () => {
    const slides = extractLiveEvents({
      plugin: "dcn",
      p_time: 1_000,
      data: { type: "as", index: 1, uid: "s1", url: "https://static.uacdn.net/page.pdf?page=2" },
    });
    assert.equal(slides[0]?.plugin, "dcn");
    assert.equal((slides[0]?.data as { e?: string }).e, "as");
    assert.equal((slides[0]?.data as { u?: string }).u, "https://static.uacdn.net/page.pdf?page=2");
    assert.equal((slides[0]?.data as { i?: number }).i, 1);

    const switchEv = extractLiveEvents({
      plugin: "dcn",
      p_time: 2_000,
      data: { type: "sc", index: 1 },
    });
    assert.equal((switchEv[0]?.data as { e?: string }).e, "sc");
    assert.equal((switchEv[0]?.data as { s?: number }).s, 1);

    const down = extractLiveEvents({
      plugin: "cw",
      p_time: 3_000,
      data: { id: 1, type: "d", x: 0.2, y: 0.3, objectId: "k1" },
    });
    assert.equal(down[0]?.plugin, "cw");
    const p = (down[0]?.data as { p?: { oid?: string; x?: number; y?: number } }).p;
    assert.equal(p?.oid, "k1");
    assert.equal(p?.x, 0.2);

    const up = extractLiveEvents({
      plugin: "cw",
      p_time: 4_000,
      data: { id: 1, type: "u", x: 0.4, y: 0.5, objectId: "k1" },
    });
    const tl = compactEvents("LIVE1", [[...slides, ...switchEv, ...down, ...up]]);
    assert.equal(slideAt(tl, 10).uid, "s1");
    assert.equal(tl.strokes.length, 1);
    assert.equal(tl.strokes[0]?.oid, "k1");

    const mid = compactEvents("LIVE1", [
      [
        ...slides,
        ...switchEv,
        ...down,
        ...extractLiveEvents({
          plugin: "cw",
          p_time: 3_500,
          data: { id: 1, type: "m", x: 0.25, y: 0.35, objectId: "k1" },
        }),
      ],
    ]);
    assert.equal(mid.strokes.length, 1);
    assert.ok((mid.strokes[0]?.p.length || 0) >= 4);
    const clock = livePaintClock(mid, { p: 3.5, wall: 0 }, 0);
    assert.ok(clock >= lastBoardMs(mid) + 1600);

    const bare = extractLiveEvents({
      type: "as",
      url: "https://static.uacdn.net/bare.pdf",
      index: 1,
      uid: "s9",
    });
    assert.equal(bare[0]?.plugin, "dcn");
    assert.equal((bare[0]?.data as { u?: string }).u, "https://static.uacdn.net/bare.pdf");
  });

  it("aliases CanvasWrapper / mcn as ink plugins", () => {
    const evs = extractLiveEvents({
      plugin: "CanvasWrapper",
      p_time: 5_000,
      data: { id: 0, data: { e: "d", p: { x: 0.2, y: 0.3, oid: "k1" } } },
    });
    assert.equal(evs[0]?.plugin, "cw");
    const mcn = extractLiveEvents({
      plugin: "mcn",
      p_time: 6_000,
      data: { id: 0, data: { e: "u", p: { x: 0.4, y: 0.5 } } },
    });
    assert.equal(mcn[0]?.plugin, "cw");
  });

  it("pins the real slide when live never sends sc", () => {
    const as = extractLiveEvents({
      plugin: "dcn",
      p_time: 1,
      data: { type: "as", index: 1, uid: "s1", url: "https://static.uacdn.net/page.pdf?page=1" },
    });
    const tl = pinLiveSlide(compactEvents("LIVE1", [as]));
    assert.equal(slideAt(tl, 0).uid, "s1");
    assert.ok(slideAt(tl, 0).url);

    const mixed = pinLiveSlide(
      compactEvents("LIVE1", [
        [
          {
            plugin: "dcn",
            p_time: 1,
            data: { e: "as", i: 0, uid: "title", u: "https://uadoc.uacdn.net/10385d2a-bf0f-11f1-a4b6-86114b81c432.jpg" },
          },
          { plugin: "dcn", p_time: 2, data: { e: "as", i: 1, uid: "s2", u: "https://static.uacdn.net/notes.pdf?page=1" } },
        ],
      ]),
    );
    assert.equal(slideAt(mixed, 0).uid, "s2");
  });

  it("inflates gzip datachannel payloads and Blob wrappers", async () => {
    const { gzipSync } = await import("node:zlib");
    const row = {
      plugin: "dcn",
      p_time: 9,
      data: { type: "as", index: 1, uid: "s1", url: "https://static.uacdn.net/live.pdf?page=2" },
    };
    const gz = gzipSync(Buffer.from(JSON.stringify(row)));
    const fromGz = await decodeLivePayload(gz);
    const evs = extractLiveEvents(fromGz);
    assert.equal(evs[0]?.plugin, "dcn");
    assert.equal((evs[0]?.data as { u?: string }).u, "https://static.uacdn.net/live.pdf?page=2");
    const blob = new Blob([gz]);
    const fromBlob = await decodeLivePayload(blob);
    assert.equal((extractLiveEvents(fromBlob)[0]?.data as { e?: string }).e, "as");
  });

  it("streams live DCN as SSE and only allows class uids", () => {
    assert.equal(liveBoardStreamUrl("5UMG3D6S"), "/api/live-board?uid=5UMG3D6S");
    assert.equal(liveBoardStreamUrl("../x"), "");
    const sse = encodeLiveSse([
      { plugin: "dcn", p_time: 1, data: { e: "as", uid: "s1", u: "https://static.uacdn.net/p.pdf" } },
    ]);
    assert.ok(sse.startsWith("data: "));
    assert.ok(sse.includes('"plugin":"dcn"'));
    assert.equal(encodeLiveSse([]), "");
  });

  it("restores the written board from liveclass-proxy history", async () => {
    assert.equal(
      liveProxyHistoryUrl("38-d90c50f8f066f7f4"),
      "https://liveclass-proxy.uacdn.net/v1/api/history/?token=38-d90c50f8f066f7f4&offset=0&limit=25000",
    );
    assert.equal(liveProxyHistoryUrl("no"), "");
    assert.equal(liveProxyHistoryUrl("https://evil.example/x"), "");
    const as = JSON.stringify({
      plugin: "dcn",
      p_time: 10,
      data: { type: "as", index: 1, uid: "s1", url: "https://static.uacdn.net/notes.pdf?page=2" },
    });
    const ink = JSON.stringify({
      plugin: "cw",
      p_time: 20,
      data: { type: "d", objectId: "k1", x: 0.2, y: 0.3 },
    });
    const page1 = {
      plugindata: {
        data: {
          list: [{ data: as }, { data: ink }],
          has_more: true,
        },
      },
    };
    const parsed = parseProxyHistory(page1);
    assert.equal(parsed.count, 2);
    assert.equal(parsed.hasMore, true);
    assert.equal(parsed.events[0]?.plugin, "dcn");
    assert.equal((parsed.events[0]?.data as { u?: string }).u, "https://static.uacdn.net/notes.pdf?page=2");
    assert.equal(parsed.events[1]?.plugin, "cw");

    const hits: string[] = [];
    const events = await pullProxyHistoryPages("38-d90c50f8f066f7f4", async (url) => {
      hits.push(url);
      if (hits.length === 1) return page1;
      return { plugindata: { data: { list: [], has_more: false } } };
    });
    assert.equal(hits.length, 2);
    assert.ok(hits[1]?.includes("offset=2"));
    assert.equal(events.length, 2);
    const tl = pinLiveSlide(compactEvents("LIVE1", [events]));
    assert.equal(timelineHasBoard(tl), true);
    assert.equal(liveFillCamera({ streamCanvas: false, boardful: true }), false);
    assert.equal(liveFillCamera({ streamCanvas: false, boardful: false }), false);
    assert.equal(liveFillCamera({ streamCanvas: true, boardful: true }), true);
    const none = parseProxyHistory({ plugindata: { data: { list: null, has_more: 0 } } });
    assert.equal(none.count, 0);
    assert.equal(none.events.length, 0);
  });

  it("maps live ct timestamps onto p_time and skips cursor chatter", () => {
    const ct = 1_791_036_207_574;
    assert.equal(liveEventTimeUs({ ct }), ct * 1000);
    assert.equal(liveEventTimeUs({ p_time: 2_000_000, ct }), 2_000_000);
    const ev = asLiveEvent({ plugin: "dcn", data: { e: "as", i: 1, uid: "s1", u: "https://uadoc.uacdn.net/a1b2c3d4-bf33-11f1-bd10-3211cf8eea45.jpg" }, ct, id: 9 }, 0);
    assert.equal(ev?.p_time, ct * 1000);
    assert.equal(asLiveEvent({ plugin: "cw", data: { data: { e: "p", p: { x: 0.2, y: 0.3 } } }, ct }, 0), null);
    const bundle = extractLiveBundle([
      { plugin: "mcn", data: { e: "st" }, ct, id: 73 },
      { plugin: "cw", data: { data: { e: "p", p: { x: 0.5, y: 0.5 } } }, ct, id: 5 },
      { plugin: "dcn", data: { e: "as", i: 1, uid: "canvas", u: "https://uadoc.uacdn.net/a1b2c3d4-bf33-11f1-bd10-3211cf8eea45.jpg" }, ct, id: 9 },
    ]);
    assert.equal(bundle.snapshots, 1);
    assert.equal(bundle.events.length, 1);
    assert.equal(bundle.events[0]?.p_time, ct * 1000);
  });

  it("follows the current PDF page instead of pinning the empty UUID card", () => {
    const uuid = "https://uadoc.uacdn.net/a1b2c3d4-bf33-11f1-bd10-3211cf8eea45.jpg";
    const tl = pinLiveRaster(
      pinLiveSlide(
        compactEvents("LIVE1", [
          [
            { plugin: "dcn", p_time: 1_000, data: { e: "as", i: 1, uid: "canvas", u: uuid, bc: "#202022" } },
            { plugin: "dcn", p_time: 2_000, data: { e: "sc", s: 1 } },
            { plugin: "dcn", p_time: 3_000, data: { e: "as", i: 2, uid: "pdf", u: "https://uadoc.uacdn.net/common/x.pdf?page=1" } },
            { plugin: "dcn", p_time: 4_000, data: { e: "sc", s: 2 } },
          ],
        ]),
      ),
    );
    assert.equal(slideAt(tl, 10).uid, "pdf");
  });

  it("puts live canvas-0 ink on the current PDF page", () => {
    const uuid = "https://uadoc.uacdn.net/a1b2c3d4-bf33-11f1-bd10-3211cf8eea45.jpg";
    const rows = [
      { plugin: "dcn", p_time: 1_000, data: { e: "as", i: 1, uid: "canvas", u: uuid } },
      { plugin: "dcn", p_time: 2_000, data: { e: "as", i: 2, uid: "pdf", u: "https://uadoc.uacdn.net/common/x/notes.pdf?page=3" } },
      { plugin: "dcn", p_time: 3_000, data: { e: "sc", s: 2 } },
      { plugin: "cw", p_time: 4_000, data: { id: 0, data: { e: "d", p: { x: 0.2, y: 0.3, oid: "k1" } } } },
      { plugin: "cw", p_time: 5_000, data: { id: 0, data: { e: "m", p: { x: 0.25, y: 0.35, oid: "k1" } } } },
      { plugin: "cw", p_time: 6_000, data: { id: 0, data: { e: "u", p: { x: 0.4, y: 0.5, oid: "k1" } } } },
    ];
    const replay = compactEvents("LIVE1", [rows]);
    assert.equal(replay.strokes[0]?.uid, "blank");
    const live = remapLiveInk(pinLiveRaster(pinLiveSlide(compactEvents("LIVE1", [rows], { liveBoard: true }))));
    assert.equal(slideAt(live, 10).uid, "pdf");
    assert.equal(live.strokes[0]?.uid, "pdf");
    assert.ok((live.strokes[0]?.p.length || 0) >= 4);
  });

  it("pins a UUID UADoc JPEG and puts canvas-0 ink on it", () => {
    const uuid = "https://uadoc.uacdn.net/a1b2c3d4-bf33-11f1-bd10-3211cf8eea45.jpg";
    const rows = [
      { plugin: "dcn", p_time: 1_000, data: { e: "as", i: 1, uid: "canvas", u: uuid } },
      { plugin: "cw", p_time: 4_000, data: { id: 0, data: { e: "d", p: { x: 0.2, y: 0.3, oid: "k1" } } } },
      { plugin: "cw", p_time: 5_000, data: { id: 0, data: { e: "m", p: { x: 0.25, y: 0.35, oid: "k1" } } } },
      { plugin: "cw", p_time: 6_000, data: { id: 0, data: { e: "u", p: { x: 0.4, y: 0.5, oid: "k1" } } } },
    ];
    const live = remapLiveInk(pinLiveSlide(compactEvents("LIVE1", [rows], { liveBoard: true })));
    assert.equal(slideAt(live, 10).uid, "canvas");
    assert.equal(live.strokes[0]?.uid, "canvas");
    assert.ok((live.strokes[0]?.p.length || 0) >= 4);
  });

  it("keeps live ink on the PDF page in wrapper.id, not the latest as", () => {
    const pdf = (page: number) => `https://uadoc.uacdn.net/common/x/notes.pdf?page=${page}`;
    const rows = [
      { plugin: "dcn", p_time: 1_000, data: { e: "as", i: 1, uid: "canvas", u: "https://uadoc.uacdn.net/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg" } },
      { plugin: "dcn", p_time: 2_000, data: { e: "sc", s: 1 } },
      { plugin: "dcn", p_time: 3_000, data: { e: "as", i: 2, uid: "p169", u: pdf(169) } },
      { plugin: "dcn", p_time: 4_000, data: { e: "sc", s: 2 } },
      { plugin: "cw", p_time: 5_000, data: { id: 2, data: { e: "d", p: { x: 0.2, y: 0.3, oid: "k169" } } } },
      { plugin: "cw", p_time: 6_000, data: { id: 2, data: { e: "u", p: { x: 0.3, y: 0.4 } } } },
      { plugin: "dcn", p_time: 7_000, data: { e: "as", i: 2, uid: "p168", u: pdf(168) } },
      { plugin: "dcn", p_time: 8_000, data: { e: "sc", s: 2 } },
      { plugin: "cw", p_time: 9_000, data: { id: 2, data: { e: "d", p: { x: 0.4, y: 0.5, oid: "k168" } } } },
      { plugin: "cw", p_time: 10_000, data: { id: 2, data: { e: "u", p: { x: 0.5, y: 0.6 } } } },
      { plugin: "cw", p_time: 11_000, data: { id: 3, data: { e: "d", p: { x: 0.1, y: 0.1, oid: "k169b" } } } },
      { plugin: "cw", p_time: 12_000, data: { id: 3, data: { e: "u", p: { x: 0.2, y: 0.2 } } } },
    ];
    const piled = remapLiveInk(pinLiveSlide(compactEvents("LIVE1", [rows], { liveBoard: true })));
    const on169 = piled.strokes.filter((s) => s.uid === "p169");
    const on168 = piled.strokes.filter((s) => s.uid === "p168");
    assert.equal(on169.length, 2);
    assert.equal(on168.length, 1);
    assert.equal(slideAt(piled, 20).uid, "p168");
  });

  it("live paint stays on the current page when the clock is still at 0", () => {
    const pdf = (page: number) => `https://static.uacdn.net/notes.pdf?page=${page}`;
    const rows = Array.from({ length: 8 }, (_, i) => ({
      plugin: "dcn",
      p_time: (i + 1) * 1_000,
      data: { e: "as", i: i + 1, uid: `s${i + 1}`, u: pdf(i + 1) },
    }));
    const packed = compactEvents("LIVE1", [rows], { liveBoard: true });
    assert.equal(slideAt(packed, 0).uid, "blank");
    assert.equal(slideAt(packed, 4).uid, "s4");
    const now = pinLiveNow(pinLiveSlide(packed));
    assert.equal(slideAt(now, 0).uid, "s8");
    assert.equal(slideAt(now, 4).uid, "s8");
    assert.equal(now.switches.length, 1);
  });

  it("soaks history pages and slide bursts into one pack", () => {
    assert.equal(liveCompactDelay({ packedOnce: false, added: 8, nav: true }), LIVE_HISTORY_SOAK_MS);
    assert.equal(liveCompactDelay({ packedOnce: true, added: 8, nav: true, catchingUp: true }), LIVE_HISTORY_SOAK_MS);
    assert.equal(liveCompactDelay({ packedOnce: true, added: 2, nav: true }), LIVE_SLIDE_SETTLE_MS);
    assert.equal(liveCompactDelay({ packedOnce: true, added: 2, nav: false }), LIVE_INK_COMPACT_MS);
    assert.ok(LIVE_HISTORY_SOAK_MS > LIVE_SLIDE_SETTLE_MS);
    assert.equal(liveHistoryDoneSse(), "event: history-done\ndata: {}\n\n");
    assert.equal(shouldPackLiveBurst({ packedOnce: false, catchingUp: false, added: 250 }), true);
    assert.equal(shouldPackLiveBurst({ packedOnce: true, catchingUp: true, added: 250 }), true);
    assert.equal(shouldPackLiveBurst({ packedOnce: true, catchingUp: false, added: 250 }), false);
    assert.equal(shouldPackLiveBurst({ packedOnce: true, catchingUp: false, added: 3 }), true);
  });

  it("reads ct from proxy history when p_time is missing", () => {
    const ct = 1_791_036_207_574;
    const body = {
      plugindata: {
        data: {
          list: [
            {
              data: JSON.stringify({
                plugin: "cw",
                ct,
                data: { id: 0, data: { e: "d", p: { x: 0.1, y: 0.2, oid: "k1" } } },
              }),
            },
          ],
          has_more: false,
        },
      },
    };
    const parsed = parseProxyHistory(body);
    assert.equal(parsed.events[0]?.p_time, ct * 1000);
  });

  it("pages websocket history as far as proxy history", () => {
    assert.equal(LIVE_WS_HISTORY_PAGES, 24);
    assert.equal(LIVE_PROXY_MAX_PAGES, 24);
  });
});
