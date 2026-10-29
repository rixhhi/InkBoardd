# InkBoard API only — for Render (render.yaml), Fly, Railway or any Docker host.
# The site is deployed separately (Vercel) and proxies /api here.
#
#   docker build -f backend/Dockerfile -t inkboard-api .      # build from the repo root
#   docker run -p 8787:8787 --env-file backend/.env inkboard-api
#
# Node 22 runs the backend's TypeScript natively. ffmpeg is for lecture enhance jobs.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg tini curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# npm workspaces: the lockfile covers shared + backend + frontend, so every
# package.json must be present for `npm ci` to validate it. Only shared and
# backend dependencies are installed.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --no-audit --no-fund -w shared -w backend \
 && npm cache clean --force
COPY shared shared
COPY backend backend

ENV NODE_ENV=production \
    BACKEND_HOST=0.0.0.0 \
    JOB_DIR=/data/jobs
RUN mkdir -p /data/jobs && chown -R node:node /data /app
VOLUME ["/data/jobs"]
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS "http://127.0.0.1:${PORT:-8787}/healthz" || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--experimental-strip-types", "--import", "./backend/register.mjs", "backend/src/server.ts"]
