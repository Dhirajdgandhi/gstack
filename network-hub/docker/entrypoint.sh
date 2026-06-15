#!/bin/sh
set -e

export PORT="${PORT:-8787}"

echo "Initializing database schema..."
attempt=0
max_attempts="${DB_INIT_RETRIES:-30}"
until bun /app/docker/db-init.ts; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Database init failed after ${max_attempts} attempts"
    exit 1
  fi
  echo "Waiting for PostgreSQL (${attempt}/${max_attempts})..."
  sleep 2
done

exec bun /app/server/index.ts
