import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { resetProxyLimits } from "@inkboard/shared/cdn-proxy";
import { PROXY_SECRET_HEADER, resetProxySecretWarning } from "../../src/app.ts";
import { testApp } from "../helpers/app.ts";

const previousTrust = process.env.TRUST_PROXY;
const previousLog = process.env.LOG_LEVEL;
const previousSecret = process.env.INKBOARD_PROXY_SECRET;
const FORGED = "198.51.100.50";
const REAL = "203.0.113.10";
const VERCEL = "76.76.21.21";
const SECRET = "test-proxy-secret";

async function withTrust(trust: "1" | "2" | undefined, secret?: string): Promise<FastifyInstance> {
  if (trust) process.env.TRUST_PROXY = trust;
  else delete process.env.TRUST_PROXY;
  if (secret === undefined) delete process.env.INKBOARD_PROXY_SECRET;
  else process.env.INKBOARD_PROXY_SECRET = secret;
  process.env.LOG_LEVEL = "silent";
  resetProxyLimits();
  const app = await testApp();
  app.get("/__trust", (req) => ({ ip: req.ip, ips: req.ips ?? null }));
  return app;
}

async function summaryStatuses(app: FastifyInstance, headers: (i: number) => Record<string, string>) {
  const statuses: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const res = await app.inject({
      method: "POST",
      url: "/api/study/summary",
      headers: headers(i),
      payload: {},
    });
    statuses.push(res.statusCode);
  }
  return statuses;
}

function sharedBucket(statuses: number[]) {
  assert.equal(statuses[6], 429, statuses.join(","));
  assert.ok(statuses.slice(0, 6).every((code) => code !== 429));
}

describe("trust proxy hop count", () => {
  after(() => {
    if (previousTrust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrust;
    if (previousLog === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previousLog;
    if (previousSecret === undefined) delete process.env.INKBOARD_PROXY_SECRET;
    else process.env.INKBOARD_PROXY_SECRET = previousSecret;
    resetProxyLimits();
  });

  it("with TRUST_PROXY=1 the last X-Forwarded-For entry is the client and the forged left entry does not change the bucket", async () => {
    const app = await withTrust("1");
    try {
      const probe = await app.inject({
        method: "GET",
        url: "/__trust",
        headers: { "x-forwarded-for": `${FORGED}, ${REAL}` },
      });
      assert.equal(probe.statusCode, 200);
      assert.equal((probe.json() as { ip: string }).ip, REAL);

      const alone = await app.inject({
        method: "GET",
        url: "/__trust",
        headers: { "x-forwarded-for": FORGED },
      });
      assert.equal((alone.json() as { ip: string }).ip, FORGED);

      sharedBucket(await summaryStatuses(app, (i) => ({ "x-forwarded-for": `203.0.113.${i}, ${REAL}` })));
    } finally {
      await app.close();
      resetProxyLimits();
    }
  });

  it("with TRUST_PROXY=2 and the proxy secret, the second hop is the visitor and a forged left entry does not change the bucket", async () => {
    const app = await withTrust("2", SECRET);
    try {
      const probe = await app.inject({
        method: "GET",
        url: "/__trust",
        headers: {
          "x-forwarded-for": `${REAL}, ${VERCEL}`,
          [PROXY_SECRET_HEADER]: SECRET,
        },
      });
      assert.equal(probe.statusCode, 200);
      const seen = probe.json() as { ip: string; ips: string[] };
      assert.equal(seen.ip, REAL);
      assert.equal(seen.ips.at(-1), REAL);

      const forged = await app.inject({
        method: "GET",
        url: "/__trust",
        headers: {
          "x-forwarded-for": `${FORGED}, ${REAL}, ${VERCEL}`,
          [PROXY_SECRET_HEADER]: SECRET,
        },
      });
      assert.equal((forged.json() as { ip: string }).ip, REAL);

      sharedBucket(
        await summaryStatuses(app, (i) => ({
          "x-forwarded-for": `198.51.100.${i}, ${REAL}, ${VERCEL}`,
          [PROXY_SECRET_HEADER]: SECRET,
        })),
      );
    } finally {
      await app.close();
      resetProxyLimits();
    }
  });

  it("a direct request with no secret ignores X-Forwarded-For, including one forged entry", async () => {
    const app = await withTrust("2");
    try {
      const one = await app.inject({
        method: "GET",
        url: "/__trust",
        headers: { "x-forwarded-for": FORGED },
      });
      assert.equal(one.statusCode, 200);
      assert.equal((one.json() as { ip: string }).ip, "127.0.0.1");

      const two = await app.inject({
        method: "GET",
        url: "/__trust",
        headers: { "x-forwarded-for": `${FORGED}, ${REAL}` },
      });
      assert.equal((two.json() as { ip: string }).ip, "127.0.0.1");

      const wrong = await app.inject({
        method: "GET",
        url: "/__trust",
        headers: {
          "x-forwarded-for": `${FORGED}, ${REAL}, ${VERCEL}`,
          [PROXY_SECRET_HEADER]: "not-the-secret",
        },
      });
      assert.equal((wrong.json() as { ip: string }).ip, "127.0.0.1");

      sharedBucket(await summaryStatuses(app, (i) => ({ "x-forwarded-for": `198.51.100.${i}` })));
    } finally {
      await app.close();
      resetProxyLimits();
    }
  });

  it("with the correct secret, TRUST_PROXY=2 still yields the second-hop client", async () => {
    const app = await withTrust("2", SECRET);
    try {
      const probe = await app.inject({
        method: "GET",
        url: "/__trust",
        headers: {
          "x-forwarded-for": `${REAL}, ${VERCEL}`,
          [PROXY_SECRET_HEADER]: SECRET,
        },
      });
      assert.equal((probe.json() as { ip: string }).ip, REAL);
    } finally {
      await app.close();
      resetProxyLimits();
    }
  });

  it("warns once when Render sees /api without the secret from a public socket", async () => {
    const previousRender = process.env.RENDER;
    process.env.RENDER = "true";
    resetProxySecretWarning();
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    const app = await withTrust("2", SECRET);
    try {
      const sealed = await app.inject({
        method: "GET",
        url: "/api/does-not-exist",
        remoteAddress: "203.0.113.8",
        headers: { [PROXY_SECRET_HEADER]: SECRET, "x-forwarded-for": FORGED },
      });
      assert.equal((sealed.json() as { error?: string }).error !== undefined || sealed.statusCode === 404, true);
      assert.equal(warnings.filter((line) => line.includes("INKBOARD_PROXY_SECRET")).length, 0);

      const health = await app.inject({
        method: "GET",
        url: "/healthz",
        remoteAddress: "203.0.113.8",
      });
      assert.equal(health.statusCode, 200);
      assert.equal(warnings.filter((line) => line.includes("INKBOARD_PROXY_SECRET")).length, 0);

      const local = await app.inject({
        method: "GET",
        url: "/api/does-not-exist",
        remoteAddress: "10.1.2.3",
      });
      assert.equal(local.statusCode, 404);
      assert.equal(warnings.filter((line) => line.includes("INKBOARD_PROXY_SECRET")).length, 0);

      const open = await app.inject({
        method: "GET",
        url: "/api/does-not-exist",
        remoteAddress: "203.0.113.8",
        headers: { "x-forwarded-for": FORGED },
      });
      assert.equal(open.statusCode, 404);
      assert.equal((open.json() as { ip?: string }).ip, undefined);
      const again = await app.inject({
        method: "GET",
        url: "/api/does-not-exist",
        remoteAddress: "198.51.100.9",
      });
      assert.equal(again.statusCode, 404);
      const hits = warnings.filter((line) => line.includes("without INKBOARD_PROXY_SECRET"));
      assert.equal(hits.length, 1);

      const seen = await app.inject({
        method: "GET",
        url: "/__trust",
        remoteAddress: "203.0.113.8",
        headers: { "x-forwarded-for": FORGED },
      });
      assert.equal((seen.json() as { ip: string }).ip, "203.0.113.8");
    } finally {
      console.warn = orig;
      if (previousRender === undefined) delete process.env.RENDER;
      else process.env.RENDER = previousRender;
      resetProxySecretWarning();
      await app.close();
      resetProxyLimits();
    }
  });

  it("with TRUST_PROXY unset the forwarding header is ignored", async () => {
    const app = await withTrust(undefined);
    try {
      const probe = await app.inject({
        method: "GET",
        url: "/__trust",
        headers: { "x-forwarded-for": `${FORGED}, ${REAL}` },
      });
      assert.equal(probe.statusCode, 200);
      const seen = probe.json() as { ip: string; ips: string[] | null };
      assert.equal(seen.ip, "127.0.0.1");
      assert.equal(seen.ips, null);

      sharedBucket(await summaryStatuses(app, (i) => ({ "x-forwarded-for": `203.0.113.${i}` })));
    } finally {
      await app.close();
      resetProxyLimits();
    }
  });
});
