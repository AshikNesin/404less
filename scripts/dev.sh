#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

# Check if --all flag is passed
RUN_ALL=false
if [[ "${1:-}" == "--all" ]]; then
  RUN_ALL=true
fi

"$ROOT_DIR/scripts/wait-for-db.sh" "$DB_HOST" "$DB_PORT"

# Start server
(
  cd "$ROOT_DIR/server"
  uv sync
  uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 9001
) &
SERVER_PID=$!

# Start client
(
  cd "$ROOT_DIR/client"
  pnpm install
  pnpm dev
) &
CLIENT_PID=$!

# Optionally start website
if [ "$RUN_ALL" = true ]; then
  (
    cd "$ROOT_DIR/website"
    pnpm install
    pnpm dev
  ) &
  WEBSITE_PID=$!
  trap "kill $SERVER_PID $CLIENT_PID $WEBSITE_PID" EXIT
else
  trap "kill $SERVER_PID $CLIENT_PID" EXIT
fi

wait
