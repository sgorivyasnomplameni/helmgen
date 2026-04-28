.PHONY: backend-test frontend-check deploy-ready minikube-up backend-restart deploy-ready-local stop-local-mode status-local-mode

backend-test:
	backend/.venv/bin/pytest backend/tests/test_renderer.py backend/tests/test_recommender.py

frontend-check:
	cd frontend && npm run type-check && npm run build

minikube-up:
	minikube start

backend-restart:
	docker compose up -d --build backend

deploy-ready: minikube-up backend-restart
	@echo "Local deploy environment is ready."

deploy-ready-local: minikube-up
	bash scripts/run-backend-local-deploy.sh

stop-local-mode:
	docker compose stop backend frontend db

status-local-mode:
	docker compose ps
