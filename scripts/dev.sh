#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"

"$ROOT_DIR/scripts/wait-for-db.sh" "$DB_HOST" "$DB_PORT"

(
  cd "$ROOT_DIR/backend"
  uv sync
  uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 9001
) &
BE_PID=$!

(
  cd "$ROOT_DIR/frontend"
  pnpm install
  pnpm dev
) &
FE_PID=$!

trap "kill $BE_PID $FE_PID" EXIT

wait
