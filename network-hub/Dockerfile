# ── Stage 1: build React frontend ───────────────────────────────────────────
FROM node:22-bookworm-slim AS web-build

WORKDIR /app/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ── Stage 2: Bun API + nginx ────────────────────────────────────────────────
FROM oven/bun:1-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx curl \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY server/ ./server/
COPY cli/ ./cli/
COPY --from=web-build /app/web/dist ./web/dist

COPY docker/nginx.conf /etc/nginx/conf.d/network-hub.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=8787
ENV NETWORK_HUB_DATA=/data

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1/api/health || exit 1

VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
