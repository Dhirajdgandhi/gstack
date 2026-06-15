# ── Stage 1: build React frontend ───────────────────────────────────────────
FROM node:22-bookworm-slim AS web-build

WORKDIR /app/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ── Stage 2: Bun API + static web on one port ───────────────────────────────
FROM oven/bun:1-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY server/ ./server/
COPY cli/ ./cli/
COPY docker/db-init.ts ./docker/db-init.ts
COPY --from=web-build /app/web/dist ./web/dist

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=8787

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8787/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
