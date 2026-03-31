# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Run everything (Docker)
```bash
cp .env.example .env
docker compose up --build
```

### Backend (local dev)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload          # :8000
```

### Run migrations (requires a live DB)
```bash
cd backend
alembic upgrade head
alembic revision --autogenerate -m "description"
```

### Run backend tests
```bash
cd backend
pytest                                 # all tests
pytest tests/test_recommender.py -v   # single file
pytest -k test_name                   # single test
```

### Frontend (local dev)
```bash
cd frontend
npm install
npm run dev          # :3000, proxies /api → :8000
npm run type-check
npm run lint
npm run build
```

## Architecture

### Backend — `backend/app/`
FastAPI async app with SQLAlchemy 2.0 (asyncpg driver). Database migrations managed by Alembic; the `entrypoint.sh` runs `alembic upgrade head` before starting uvicorn.

| Layer | Path | Role |
|---|---|---|
| Config | `config.py` | Pydantic-settings, reads `.env` |
| DB session | `database.py` | Async engine + `get_db` dependency; `Base` declarative |
| Models | `models/chart.py` | ORM — single `Chart` table |
| Schemas | `schemas/chart.py` | Pydantic request/response DTOs |
| Router | `routers/charts.py` | CRUD + generate/validate/template/deploy/download endpoints |
| Generator | `services/helm_generator.py` | Builds multi-doc YAML bundle and `.tgz` archive |
| Recommender | `services/recommender.py` | `RecommendationSystem.analyze(ChartParams)` — 14 rule-based checks |
| Validator | `services/chart_validator.py` | Builtin structural checks; wraps `helm lint` when helm binary is available |
| Renderer | `services/chart_renderer.py` | `helm template` and `helm install --dry-run` wrappers |

**Helm template generation** (`helm_generator.py`): All Kubernetes YAML is generated with Python f-strings — not Jinja2 — because `include` is a reserved Jinja2 keyword. Double-braces escape: `{{{{` → `{{` in the output string. The generated bundle is a single multi-doc YAML string with `# Section\n---\n` separators; `build_chart_archive()` splits this into files for the `.tgz`.

**Route ordering**: `GET /recommendations` is declared before `GET /{chart_id}` to prevent FastAPI from treating the literal string "recommendations" as an integer path param.

**`_parse_values_yaml`**: A custom lightweight YAML parser in `helm_generator.py` used throughout the codebase to read values.yaml content without importing PyYAML (which is an optional dep). Use this for dict-based lookups instead of string matching.

### Frontend — `frontend/src/`
Vite + React 18 + TypeScript. Three views controlled by `App.tsx` state (no router library):

| Path | Role |
|---|---|
| `pages/GeneratorPage.tsx` | Main config form → YAML preview → generate/download |
| `pages/OpsPage.tsx` | Validate, `helm template`, dry-run deploy for a saved chart |
| `pages/HistoryPage.tsx` | List of previously generated charts |
| `components/RecommendationsBlock.tsx` | Debounced live recommendations (700 ms delay, race-condition safe via `requestRef`) |
| `components/YamlPreview.tsx` | Syntax-highlighted YAML display |
| `components/WorkloadCard.tsx` | Workload type selector cards |
| `api/charts.ts` | Axios wrapper for all backend calls |
| `utils/yamlGenerator.ts` | `generateValuesYaml(config)` — builds values.yaml from UI state to send on generate |

**CSS design system** (`index.css`): CSS custom properties only — no CSS framework. Light theme in `:root`, dark theme in `[data-theme='dark']`. Theme persisted to `localStorage`. Key tokens: `--bg`, `--panel`, `--panel-strong`, `--text`, `--text-soft`, `--text-muted`, `--accent`, `--success`, `--warning`, `--danger`, `--border`, `--workspace-*` (for the dark code editor area).

The Vite dev server proxies `/api` → `http://localhost:8000`. In production the nginx container handles the same proxy.

### Database
PostgreSQL 16. Connection string: `postgresql+asyncpg://user:pass@host:5432/db`. Alembic migrations in `backend/alembic/versions/`.

### Environment
Copy `.env.example` → `.env` before running. `DATABASE_URL` is the only required backend secret; docker-compose constructs it from individual `POSTGRES_*` vars.
