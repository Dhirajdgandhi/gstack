#!/bin/sh
set -e

mkdir -p "${NETWORK_HUB_DATA:-/data}"
export NETWORK_HUB_DATA="${NETWORK_HUB_DATA:-/data}"
export PORT="${PORT:-8787}"

bun /app/server/index.ts &
exec nginx -g 'daemon off;'
