/**
 * The site's own proxy to the API, used by the server routes in
 * src/routes/api.$.tsx, healthz.tsx and readyz.tsx. Runs inside the Nitro
 * server on every host (Vercel function, PM2, Docker), so the browser always
 * talks same-origin and the API origin never reaches the client.
 *
 * INKBOARD_API_ORIGIN  scheme + host of the API, no path (https://api.example.com)
 * INKBOARD_PROXY_SECRET stamped as x-inkboard-proxy-secret so the API trusts
 *                       the second X-Forwarded-For hop (TRUST_PROXY=2)
 *
 * Behind scripts/serve.mjs (single box) these routes are never reached:
 * the edge forwards /api before the SSR server sees it.
 */
import { proxyApi } from "@/lib/api-proxy";

export function apiOrigin(): string | undefined {
  const origin = process.env.INKBOARD_API_ORIGIN?.trim();
  return origin || undefined;
}

export function upstream(request: Request): Promise<Response> | Response {
  const origin = apiOrigin();
  if (!origin) {
    return Response.json({ error: "INKBOARD_API_ORIGIN is not set on the site server.", code: "MISCONFIGURED" }, { status: 500 });
  }
  return proxyApi(request, { origin, secret: process.env.INKBOARD_PROXY_SECRET?.trim() || undefined }).catch(
    () => Response.json({ error: "The API did not answer.", code: "UPSTREAM_DOWN" }, { status: 502 }),
  );
}
