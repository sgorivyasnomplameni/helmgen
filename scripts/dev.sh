#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

FRONTEND_PID=""
BACKEND_PID=""
SHUTTING_DOWN=0

FRONTEND_MODE="${FRONTEND_MODE:-on}"
MINIKUBE_MODE="${MINIKUBE_MODE:-auto}"

LOCAL_DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://helmgen:helmgen@127.0.0.1:5432/helmgen}"
LOCAL_KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
LOCAL_HELM_BIN="${HELM_BIN:-$BACKEND_DIR/.tools/bin/helm}"
LOCAL_HOST="${HOST:-0.0.0.0}"
LOCAL_PORT="${PORT:-8000}"

KUBERNETES_READY=0
MINIKUBE_STATUS_TEXT="not checked"

cleanup() {
  if [[ "$SHUTTING_DOWN" -eq 1 ]]; then
    return
  fi

  SHUTTING_DOWN=1
  echo
  echo "Stopping development mode..."

  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ -n "$FRONTEND_PID" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
    wait "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  docker compose stop backend frontend db >/dev/null 2>&1 || true
  echo "Development mode stopped."
}

trap 'cleanup' EXIT INT TERM

fail() {
  echo "Error: $1" >&2
  exit 1
}

check_required_tools() {
  command -v docker >/dev/null 2>&1 || fail "docker is not installed."
  docker compose version >/dev/null 2>&1 || fail "docker compose is not available."
}

ensure_project_env() {
  [[ -f "$ROOT_DIR/.env" ]] || fail "Missing $ROOT_DIR/.env. Create it from .env.example before starting the project."
}

check_port_free() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      fail "Port $port is already in use. Stop the conflicting process and run make dev again."
    fi
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "( sport = :$port )" | tail -n +2 | grep -q .; then
      fail "Port $port is already in use. Stop the conflicting process and run make dev again."
    fi
    return
  fi
}

check_frontend_deps() {
  command -v npm >/dev/null 2>&1 || fail "npm is not installed. Install Node.js and npm to run the frontend locally."
  [[ -d "$FRONTEND_DIR/node_modules" ]] || fail "Missing frontend/node_modules. Run 'cd frontend && npm install' once before using make dev."
}

check_backend_deps() {
  [[ -x "$BACKEND_DIR/.venv/bin/python" ]] || fail "Missing backend virtualenv. Create backend/.venv and install requirements before using make dev."
  if ! (cd "$BACKEND_DIR" && .venv/bin/python -c "import asyncpg, fastapi, uvicorn" >/dev/null 2>&1); then
    echo "Backend .venv is missing required packages. Installing..."
    (cd "$ROOT_DIR" && backend/.venv/bin/pip install -r backend/requirements.txt)
  fi
}

prepare_minikube() {
  case "$MINIKUBE_MODE" in
    off)
      MINIKUBE_STATUS_TEXT="disabled"
      echo "[k8s] Minikube auto-start is disabled for this run."
      return
      ;;
    auto|required)
      ;;
    *)
      fail "Unsupported MINIKUBE_MODE='$MINIKUBE_MODE'. Use one of: auto, required, off."
      ;;
  esac

  echo "[k8s] Checking Kubernetes integration..."
  if ! command -v minikube >/dev/null 2>&1; then
    MINIKUBE_STATUS_TEXT="minikube not installed"
    if [[ "$MINIKUBE_MODE" = "required" ]]; then
      fail "MINIKUBE_MODE=required but minikube is not installed."
    fi
    echo "[k8s] Minikube CLI not found."
    echo "[k8s] Generate/validate/history will work; deploy features require a reachable Kubernetes context."
    return
  fi

  echo "[k8s] Minikube CLI found in PATH."
  if minikube status >/dev/null 2>&1; then
    MINIKUBE_STATUS_TEXT="running"
    echo "[k8s] Minikube is already running. Deploy features should be available."
  else
    echo "[k8s] Minikube is installed but not running."
    echo "[k8s] Starting minikube so deploy features are available..."
    if minikube start; then
      MINIKUBE_STATUS_TEXT="started by script"
      echo "[k8s] Minikube started successfully."
    else
      MINIKUBE_STATUS_TEXT="start failed"
      if [[ "$MINIKUBE_MODE" = "required" ]]; then
        fail "Failed to start minikube while MINIKUBE_MODE=required."
      fi
      echo "[k8s] Minikube start failed. Continuing without guaranteed deploy features."
      return
    fi
  fi

  if command -v kubectl >/dev/null 2>&1 && kubectl cluster-info >/dev/null 2>&1; then
    KUBERNETES_READY=1
  fi
}

print_summary() {
  echo
  echo "Development mode ready."
  if [[ "$FRONTEND_MODE" = "on" ]]; then
    echo "Frontend:   ready on http://localhost:3000"
  else
    echo "Frontend:   disabled for this run"
  fi
  echo "Backend:    ready on http://localhost:$LOCAL_PORT"
  if [[ "$KUBERNETES_READY" -eq 1 ]]; then
    echo "Kubernetes: ready ($MINIKUBE_STATUS_TEXT)"
  else
    echo "Kubernetes: not ready ($MINIKUBE_STATUS_TEXT)"
  fi
  echo "Database:   docker compose db"
  echo
}

ensure_project_env
check_required_tools

echo "[setup] Starting database in Docker..."
docker compose up -d db

prepare_minikube

echo "[setup] Stopping frontend and backend containers to free local ports..."
docker compose stop frontend backend >/dev/null 2>&1 || true

echo "[setup] Checking local port availability..."
check_port_free 8000
if [[ "$FRONTEND_MODE" = "on" ]]; then
  check_port_free 3000
fi

echo "[setup] Checking backend dependencies..."
check_backend_deps

if [[ "$FRONTEND_MODE" = "on" ]]; then
  echo "[setup] Checking frontend dependencies..."
  check_frontend_deps
fi

echo "[setup] Applying backend migrations..."
(
  cd "$BACKEND_DIR"
  DATABASE_URL="$LOCAL_DATABASE_URL" \
  KUBECONFIG="$LOCAL_KUBECONFIG" \
  HELM_BIN="$LOCAL_HELM_BIN" \
  .venv/bin/alembic upgrade head
)

if [[ "$FRONTEND_MODE" = "on" ]]; then
  echo "[run] Starting frontend locally on http://localhost:3000 ..."
  (
    cd "$FRONTEND_DIR"
    npm run dev -- --host 0.0.0.0 >/tmp/helmgen-frontend-dev.log 2>&1
  ) &
  FRONTEND_PID=$!
fi

echo "[run] Starting backend locally on http://localhost:$LOCAL_PORT ..."
echo "KUBECONFIG=$LOCAL_KUBECONFIG"
echo "HELM_BIN=$LOCAL_HELM_BIN"
echo
if [[ "$FRONTEND_MODE" = "on" ]]; then
  echo "Open http://localhost:3000 and use the site normally."
else
  echo "Frontend is disabled for this run."
fi
echo "Press Ctrl+C to stop frontend, backend and db started for this mode."
if [[ "$FRONTEND_MODE" = "on" ]]; then
  echo "Frontend log: /tmp/helmgen-frontend-dev.log"
fi
echo "Backend log:  current terminal"

(
  cd "$BACKEND_DIR"
  DATABASE_URL="$LOCAL_DATABASE_URL" \
  KUBECONFIG="$LOCAL_KUBECONFIG" \
  HELM_BIN="$LOCAL_HELM_BIN" \
  .venv/bin/uvicorn app.main:app --host "$LOCAL_HOST" --port "$LOCAL_PORT" --reload
) &
BACKEND_PID=$!

sleep 1
print_summary

if [[ "$FRONTEND_MODE" = "on" ]]; then
  wait -n "$FRONTEND_PID" "$BACKEND_PID"
else
  wait "$BACKEND_PID"
fi
