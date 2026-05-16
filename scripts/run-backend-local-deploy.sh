#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "scripts/run-backend-local-deploy.sh is deprecated. Use 'make dev' instead."
exec bash "$ROOT_DIR/scripts/dev.sh"
