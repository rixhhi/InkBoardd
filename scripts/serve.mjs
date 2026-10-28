/**
 * Single-box edge for InkBoard.
 *
 * Listens on EDGE_HOST:EDGE_PORT (0.0.0.0:3000) and forwards:
 *   /api/*, /healthz, /readyz  -> the Fastify API   (INKBOARD_API,  default http://127.0.0.1:8787)
 *   everything else            -> the Nitro SSR app (INKBOARD_WEB,  default http://127.0.0.1:3100)
 *
 * It does the job frontend/middleware.ts does on Vercel: stamp
 * x-inkboard-proxy-secret on API requests (when INKBOARD_PROXY_SECRET is set)
 * and strip any copy the browser sent. Streams bodies both ways so SSE
 * (/api/live-board) and large artifact downloads pass through untouched.
 */
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const EDGE_HOST = process.env.EDGE_HOST || "0.0.0.0";
const EDGE_PORT = Number(process.env.EDGE_PORT || 3000);
const API = new URL(process.env.INKBOARD_API || "http://127.0.0.1:8787");
const WEB = new URL(process.env.INKBOARD_WEB || "http://127.0.0.1:3100");
const SECRET = process.env.INKBOARD_PROXY_SECRET?.trim() || "";
const SECRET_HEADER = "x-inkboard-proxy-secret";
const API_PATH = /^\/(?:api(?:\/|$)|healthz$|readyz$)/;

function pick(url) {
  const path = (url || "/").split("?")[0] || "/";
  return API_PATH.test(path) ? API : WEB;
}

function forward(req, res) {
  const target = pick(req.url);
  const isApi = target === API;
  const headers = { ...req.headers, host: target.host };
  // The API compares Origin with the host the browser used (cross-site write guard).
  headers["x-forwarded-host"] = req.headers["x-forwarded-host"] || req.headers.host || "";
  delete headers.connection;
  delete headers[SECRET_HEADER];
  if (isApi && SECRET) headers[SECRET_HEADER] = SECRET;
  const prior = req.headers["x-forwarded-for"];
  const ip = req.socket.remoteAddress || "";
  headers["x-forwarded-for"] = prior ? `${prior}, ${ip}` : ip;
  headers["x-forwarded-proto"] = headers["x-forwarded-proto"] || "http";

  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      method: req.method,
      path: req.url,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        error: isApi ? "The API is not running." : "The site server is not running.",
        code: "UPSTREAM_DOWN",
        detail: err.code || err.message,
      }),
    );
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
}

const server = createServer(forward);
server.keepAliveTimeout = 75_000;
server.headersTimeout = 80_000;
server.requestTimeout = 0;
server.listen(EDGE_PORT, EDGE_HOST, () => {
  console.log(`[inkboard-edge] http://${EDGE_HOST}:${EDGE_PORT}  api=${API.origin}  web=${WEB.origin}  secret=${SECRET ? "set" : "unset"}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.once(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
