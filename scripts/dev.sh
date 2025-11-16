#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

"$ROOT_DIR/scripts/wait-for-db.sh" "$DB_HOST" "$DB_PORT"

# Start client Vite dev server on port 9001
(
  cd "$ROOT_DIR/client"
  pnpm install
  pnpm dev
) &
CLIENT_PID=$!

# Wait a moment for Vite to start
sleep 2

# Start server on port 9000 (proxies to Vite in development)
(
  cd "$ROOT_DIR/server"
  uv sync
  uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 9000
) &
SERVER_PID=$!

trap "kill $CLIENT_PID $SERVER_PID" EXIT

wait
