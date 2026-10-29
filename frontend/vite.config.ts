import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

const root = dirname(fileURLToPath(import.meta.url));
const api = process.env.INKBOARD_API || "http://127.0.0.1:8787";

/** Bare imports inside `shared/` walk up from that folder and miss
 * `frontend/node_modules`, which is a sibling. Resolve them from this app. */
function resolveSharedDeps(): Plugin {
  const fromApp = join(root, "src/routes/__root.tsx");
  return {
    name: "resolve-shared-deps",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || importer === fromApp) return null;
      if (!importer.replaceAll("\\", "/").includes("/shared/")) return null;
      if (
        source.startsWith(".") ||
        source.startsWith("/") ||
        source.startsWith("\0") ||
        source.startsWith("node:") ||
        source.startsWith("@inkboard/")
      ) {
        return null;
      }
      return this.resolve(source, fromApp, { ...options, skipSelf: true });
    },
  };
}

/** Nitro's dev server claims every non-asset request before Vite's `server.proxy`.
 * A JSON fetch to `/api/...` then dies with "Only HTML requests are supported here".
 * This middleware is registered first so catalog calls reach the Fastify API. */
function apiProxy(): Plugin {
  const target = new URL(api);
  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  const forward = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const url = req.url ?? "/";
    const path = url.split("?")[0] ?? "";
    if (path !== "/healthz" && path !== "/readyz" && path !== "/api" && !path.startsWith("/api/")) return next();
    const headers = { ...req.headers, host: target.host, "x-forwarded-host": req.headers["x-forwarded-host"] || req.headers.host || "" };
    delete headers.connection;
    const upstream = request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        method: req.method,
        path: url,
        headers,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (res.headersSent) return;
      res.statusCode = 502;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "The API is not running. Start it with npm run dev in backend." }));
    });
    req.pipe(upstream);
  };
  return {
    name: "inkboard-api-proxy",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(forward);
    },
    configurePreviewServer(server) {
      server.middlewares.use(forward);
    },
  };
}

export default defineConfig({
  root,
  server: {
    host: process.env.INKBOARD_WEB_HOST || "127.0.0.1",
    port: Number(process.env.INKBOARD_WEB_PORT || 5173),
    strictPort: Boolean(process.env.INKBOARD_WEB_PORT),
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  resolve: {
    alias: {
      "@": join(root, "src"),
      "@inkboard/shared": join(root, "../shared/src/lib"),
    },
  },
  plugins: [
    apiProxy(),
    resolveSharedDeps(),
    tailwindcss(),
    tanstackStart({ router: { autoCodeSplitting: true } }),
    // On Vercel, Nitro emits .vercel/output (Build Output API v3). Everywhere else
    // (PM2, Docker, CI) it emits the plain Node server in .output/.
    nitro(process.env.VERCEL ? { preset: "vercel" } : {}),
    viteReact(),
  ],
});
