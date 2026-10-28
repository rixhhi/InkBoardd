# InkBoard — API + SSR site + edge in one image, one container.
#
#   docker build -t inkboard .
#   docker run -p 3000:3000 -v inkboard-jobs:/data/jobs --env-file backend/.env inkboard
#
# Node 22 (runs the backend's TypeScript natively) and ffmpeg (lecture enhance jobs).
# Must be built on Linux (this file; CI; a VM) — the frontend toolchain's native
# deps do not build on Windows.

# ---- build the SSR site -------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
# npm workspaces: one lockfile, one install for shared/backend/frontend.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY frontend frontend
COPY scripts scripts
# The SSR build wants ~1.5 GB of heap. Budget check runs too.
RUN cd frontend && NODE_OPTIONS=--max-old-space-size=2048 BUDGET_STRICT=1 npm run build \
 && cd .. && npm prune --omit=dev --no-audit --no-fund

# ---- runtime ------------------------------------------------------------------
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg tini curl \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g pm2@5 --no-audit --no-fund

WORKDIR /app
COPY --from=build /app/shared shared
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY backend backend
COPY --from=build /app/frontend/.output frontend/.output
COPY --from=build /app/frontend/package.json frontend/package.json
COPY scripts scripts
COPY ecosystem.config.cjs ./

ENV NODE_ENV=production \
    JOB_DIR=/data/jobs \
    EDGE_HOST=0.0.0.0 \
    EDGE_PORT=3000
RUN mkdir -p /data/jobs && chown -R node:node /data /app
VOLUME ["/data/jobs"]
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pm2-runtime", "ecosystem.config.cjs"]
