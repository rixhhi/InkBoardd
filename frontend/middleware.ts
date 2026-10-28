import { proxyApi, shouldProxyApi } from "./src/lib/api-proxy.ts";

export const config = {
  matcher: ["/api/:path*", "/healthz", "/readyz"],
};

function apiOrigin(): string | undefined {
  const origin = process.env.INKBOARD_API_ORIGIN?.trim();
  return origin || undefined;
}

/** Vercel routing middleware. Stamps INKBOARD_PROXY_SECRET on requests to the API. */
export default function middleware(request: Request): Promise<Response> | Response | undefined {
  const path = new URL(request.url).pathname;
  if (!shouldProxyApi(path)) return;
  const origin = apiOrigin();
  if (!origin) {
    return Response.json(
      { error: "INKBOARD_API_ORIGIN is not set", code: "MISCONFIGURED" },
      { status: 500 },
    );
  }
  return proxyApi(request, { origin, secret: process.env.INKBOARD_PROXY_SECRET });
}
