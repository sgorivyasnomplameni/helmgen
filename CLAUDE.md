# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Run everything
```bash
cp .env.example .env
docker compose up --build
```

### Backend (local dev)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload          # starts on :8000
```

### Frontend (local dev)
```bash
cd frontend
npm install
npm run dev                            # starts on :3000, proxies /api → :8000
npm run type-check
npm run lint
npm run build
```

## Architecture

### Backend — `backend/app/`
FastAPI async app with SQLAlchemy 2.0 (asyncpg driver).

| Layer | Path | Role |
|---|---|---|
| Config | `config.py` | Pydantic-settings, reads `.env` |
| DB session | `database.py` | Async engine + `get_db` dependency; `Base` declarative base |
| Models | `models/chart.py` | SQLAlchemy ORM — `Chart` table |
| Schemas | `schemas/chart.py` | Pydantic request/response DTOs |
| Router | `routers/charts.py` | CRUD + `POST /{id}/generate` endpoint |
| Generator | `services/helm_generator.py` | Jinja2 templates → multi-doc YAML (Chart.yaml / values.yaml / deployment.yaml) |

Tables are created on startup via `Base.metadata.create_all` (no Alembic migrations wired yet).

### Frontend — `frontend/src/`
Vite + React 18 + TypeScript. Routing via `react-router-dom` v6.

| Path | Role |
|---|---|
| `api/charts.ts` | Axios wrapper for all backend calls |
| `types/chart.ts` | Shared TypeScript interfaces mirroring backend schemas |
| `pages/ChartsPage.tsx` | Chart list + create form |
| `pages/ChartDetailPage.tsx` | Edit values.yaml, trigger generation, display output |

The Vite dev server proxies `/api` → `http://localhost:8000`. In production the nginx container handles the same proxy (`nginx.conf`).

### Database
PostgreSQL 16. Connection string format: `postgresql+asyncpg://user:pass@host:5432/db`.

### Environment
Copy `.env.example` → `.env` before running. The `DATABASE_URL` variable is the only required backend secret; docker-compose injects it automatically from the individual `POSTGRES_*` vars.
