/** Request header the API checks before trusting a second proxy hop. */
export const PROXY_SECRET_HEADER = "x-inkboard-proxy-secret";

const PROXIED = /^\/(?:api(?:\/|$)|healthz$|readyz$)/;

export function shouldProxyApi(pathname: string): boolean {
  return PROXIED.test(pathname);
}

/**
 * Copy the inbound request onto the API origin and stamp the proxy secret.
 * A secret sent by the browser is removed, then replaced only when Vercel has one.
 */
export function buildProxyRequest(request: Request, origin: string, secret: string | undefined): Request {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);
  const headers = new Headers(request.headers);
  if (!headers.has("x-forwarded-host")) headers.set("x-forwarded-host", incoming.host);
  headers.delete("host");
  headers.delete("connection");
  if (secret) headers.set(PROXY_SECRET_HEADER, secret);
  else headers.delete(PROXY_SECRET_HEADER);
  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : request.body;
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    body,
    redirect: "manual",
  };
  if (body) init.duplex = "half";
  return new Request(target, init);
}

/**
 * Headers that describe the *wire* form of the upstream body. The runtime's
 * fetch (undici on Node, the Vercel function runtime) already decoded any
 * content-encoding before handing us `response.body`, so forwarding these
 * would tell the browser "this is brotli" about plaintext — it then fails to
 * decode and the request hangs. Strip them; the platform in front of us
 * re-compresses for the browser.
 */
const WIRE_HEADERS = ["content-encoding", "content-length", "transfer-encoding"];

/** Rebuild the upstream response for the browser: same status, same body stream, wire headers removed. */
export function forwardResponse(upstream: Response): Response {
  const headers = new Headers(upstream.headers);
  for (const h of WIRE_HEADERS) headers.delete(h);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export async function proxyApi(request: Request, opts: { origin: string; secret?: string }): Promise<Response> {
  const upstream = await fetch(buildProxyRequest(request, opts.origin, opts.secret));
  return forwardResponse(upstream);
}
