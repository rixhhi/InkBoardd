import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { describe, it } from "node:test";
import { sendWebResponse } from "../../src/http.ts";

describe("sendWebResponse backpressure", () => {
  it("cancels the reader when a slow consumer disconnects with a full buffer", async () => {
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(64 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const res = new Response(body, { headers: { "content-type": "application/octet-stream" } });
    let writes = 0;
    const raw = new Writable({
      highWaterMark: 1,
      write(_chunk, _enc, _cb) {
        writes += 1;
        setImmediate(() => raw.emit("close"));
      },
    });
    raw.on("error", () => {});
    (raw as Writable & { writeHead: () => void }).writeHead = () => {};
    const reply = {
      hijack() {},
      getHeaders() {
        return {};
      },
      raw,
    };
    const done = sendWebResponse(reply as never, res);
    await Promise.race([
      done,
      new Promise((_, reject) => setTimeout(() => reject(new Error("sendWebResponse hung after client close")), 1500)),
    ]);
    assert.equal(cancelled, true);
    const after = pulls;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(pulls, after, "reader kept pulling after the client closed");
    assert.equal(raw.listenerCount("drain"), 0);
    assert.ok(writes >= 1);
  });

  it("drops content-length and transfer-encoding when the body is content-encoded", async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const res = new Response(payload, {
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": "999",
        "transfer-encoding": "chunked",
      },
    });
    const raw = new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    });
    let status = 0;
    let seen: Record<string, string | number | string[]> = {};
    (raw as Writable & { writeHead: (code: number, headers: Record<string, string>) => void }).writeHead = (code, headers) => {
      status = code;
      seen = headers;
    };
    const reply = {
      hijack() {},
      getHeaders() {
        return { "content-length": "999", "x-request-id": "req-1" };
      },
      raw,
    };
    await sendWebResponse(reply as never, res);
    assert.equal(status, 200);
    const names = Object.keys(seen).map((key) => key.toLowerCase());
    assert.equal(names.includes("content-encoding"), false);
    assert.equal(names.includes("content-length"), false);
    assert.equal(names.includes("transfer-encoding"), false);
    assert.equal(seen["content-type"], "application/json");
    assert.equal(seen["x-request-id"], "req-1");
  });
});
