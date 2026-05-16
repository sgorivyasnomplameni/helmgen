#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "scripts/run-backend-local.sh is deprecated. Use 'make backend-dev-local' or 'make dev' instead."
exec env FRONTEND_MODE=off MINIKUBE_MODE=off bash "$ROOT_DIR/scripts/dev.sh"
