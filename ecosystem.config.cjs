/**
 * PM2 process file for a single-box InkBoard install (sandbox or a small VM).
 *
 *   inkboard-api   Fastify API            127.0.0.1:8787
 *   inkboard-web   Nitro SSR (built)      127.0.0.1:3100   <- run `npm run build` in frontend first
 *   inkboard-edge  scripts/serve.mjs      0.0.0.0:3000     <- the only public port
 *
 * Secrets go in backend/.env and frontend/.env (see the .env.example files);
 * nothing sensitive belongs in this file.
 */
const path = require("node:path");
const root = __dirname;

module.exports = {
  apps: [
    {
      name: "inkboard-api",
      cwd: path.join(root, "backend"),
      script: "node",
      args: "--env-file-if-exists=.env --experimental-strip-types --import ./register.mjs src/server.ts",
      env: {
        NODE_ENV: "production",
        BACKEND_HOST: "127.0.0.1",
        BACKEND_PORT: "8787",
        JOB_DIR: path.join(root, ".jobs"),
        TRUST_PROXY: "1",
        LOG_LEVEL: "info",
      },
      max_memory_restart: "400M",
      watch: false,
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 12000,
    },
    {
      name: "inkboard-web",
      cwd: path.join(root, "frontend"),
      script: ".output/server/index.mjs",
      node_args: "--env-file-if-exists=.env",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3100",
      },
      max_memory_restart: "350M",
      watch: false,
      instances: 1,
      exec_mode: "fork",
    },
    {
      name: "inkboard-edge",
      cwd: root,
      script: "scripts/serve.mjs",
      env: {
        NODE_ENV: "production",
        EDGE_HOST: "0.0.0.0",
        EDGE_PORT: "3000",
        INKBOARD_API: "http://127.0.0.1:8787",
        INKBOARD_WEB: "http://127.0.0.1:3100",
      },
      max_memory_restart: "120M",
      watch: false,
      instances: 1,
      exec_mode: "fork",
    },
  ],
};
