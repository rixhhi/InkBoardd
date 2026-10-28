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

export function proxyApi(request: Request, opts: { origin: string; secret?: string }): Promise<Response> {
  return fetch(buildProxyRequest(request, opts.origin, opts.secret));
}
