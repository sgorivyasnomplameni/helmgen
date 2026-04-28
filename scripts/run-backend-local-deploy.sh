#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

FRONTEND_PID=""
BACKEND_PID=""
SHUTTING_DOWN=0

LOCAL_DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://helmgen:helmgen@127.0.0.1:5432/helmgen}"
LOCAL_KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
LOCAL_HELM_BIN="${HELM_BIN:-$BACKEND_DIR/.tools/bin/helm}"

cleanup() {
  if [[ "$SHUTTING_DOWN" -eq 1 ]]; then
    return
  fi

  SHUTTING_DOWN=1
  echo
  echo "Stopping local deploy mode..."

  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$FRONTEND_PID" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
    wait "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  docker compose stop backend frontend db >/dev/null 2>&1 || true
  echo "Local deploy mode stopped."
}

trap 'cleanup' EXIT INT TERM

echo "[1/6] Starting database in Docker..."
docker compose up -d db

echo "[2/6] Stopping frontend and backend containers to free ports 3000/8000..."
docker compose stop frontend backend >/dev/null 2>&1 || true

echo "[3/6] Checking backend dependencies..."
if ! (cd "$BACKEND_DIR" && .venv/bin/python -c "import asyncpg, fastapi, uvicorn" >/dev/null 2>&1); then
  echo "Backend .venv is missing required packages. Installing..."
  (cd "$ROOT_DIR" && backend/.venv/bin/pip install -r backend/requirements.txt)
fi

echo "[4/6] Applying backend migrations..."
(cd "$BACKEND_DIR" && DATABASE_URL="$LOCAL_DATABASE_URL" KUBECONFIG="$LOCAL_KUBECONFIG" HELM_BIN="$LOCAL_HELM_BIN" .venv/bin/alembic upgrade head)

echo "[5/6] Starting frontend locally on http://localhost:3000 ..."
(
  cd "$FRONTEND_DIR"
  npm run dev -- --host 0.0.0.0 >/tmp/helmgen-frontend-dev.log 2>&1
) &
FRONTEND_PID=$!

echo "[6/6] Starting backend locally on http://localhost:8000 ..."
echo "DATABASE_URL=$LOCAL_DATABASE_URL"
echo "KUBECONFIG=$LOCAL_KUBECONFIG"
echo "HELM_BIN=$LOCAL_HELM_BIN"
echo
echo "Open http://localhost:3000 and use the site normally."
echo "Press Ctrl+C to stop frontend, backend and db started for this mode."
echo "Frontend log: /tmp/helmgen-frontend-dev.log"
echo "Backend log:  current terminal"
echo

(
  cd "$BACKEND_DIR"
  DATABASE_URL="$LOCAL_DATABASE_URL" KUBECONFIG="$LOCAL_KUBECONFIG" HELM_BIN="$LOCAL_HELM_BIN" .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) &
BACKEND_PID=$!

wait -n "$FRONTEND_PID" "$BACKEND_PID"
