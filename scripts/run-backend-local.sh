#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

LOCAL_DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://helmgen:helmgen@127.0.0.1:5432/helmgen}"
LOCAL_KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
LOCAL_HELM_BIN="${HELM_BIN:-$BACKEND_DIR/.tools/bin/helm}"
LOCAL_HOST="${HOST:-0.0.0.0}"
LOCAL_PORT="${PORT:-8000}"

echo "[1/3] Checking backend dependencies..."
if ! (cd "$BACKEND_DIR" && .venv/bin/python -c "import asyncpg, fastapi, uvicorn" >/dev/null 2>&1); then
  echo "Backend .venv is missing required packages. Installing..."
  (cd "$ROOT_DIR" && backend/.venv/bin/pip install -r backend/requirements.txt)
fi

echo "[2/3] Applying backend migrations..."
(
  cd "$BACKEND_DIR"
  DATABASE_URL="$LOCAL_DATABASE_URL" \
  KUBECONFIG="$LOCAL_KUBECONFIG" \
  HELM_BIN="$LOCAL_HELM_BIN" \
  .venv/bin/alembic upgrade head
)

echo "[3/3] Starting backend on http://$LOCAL_HOST:$LOCAL_PORT ..."
(
  cd "$BACKEND_DIR"
  DATABASE_URL="$LOCAL_DATABASE_URL" \
  KUBECONFIG="$LOCAL_KUBECONFIG" \
  HELM_BIN="$LOCAL_HELM_BIN" \
  .venv/bin/uvicorn app.main:app --host "$LOCAL_HOST" --port "$LOCAL_PORT" --reload
)
