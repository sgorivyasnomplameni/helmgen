#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Starting minikube..."
minikube start

echo "[2/3] Verifying kube-context..."
kubectl config current-context
kubectl cluster-info

echo "[3/3] Rebuilding backend with kube access..."
docker compose up -d --build backend

echo
echo "Local deploy environment is ready."
echo "Preferred local mode:"
echo "  make deploy-ready-local"
echo
echo "This keeps db/frontend in Docker and runs backend on the host,"
echo "which is usually the simplest way to reach minikube from HelmGen."
