# **PRD — 404less (Web App Starter for Indie Devs)**

> **Goal:** A minimal, modern, batteries-included boilerplate that makes it **fast and pleasant** for a solo developer to ship a web app. Prefer **simplicity over abstraction**, **sensible defaults over configurability**, and **great DX** with the fewest moving parts.

---

## 1) Product Summary

* **What we’re building:** A tiny, opinionated boilerplate for a classic web app stack.
* **Primary user:** Indie developer or small team who wants **zero ceremony**, **clear folder layout**, and **one-command local dev**.
* **Core philosophy:**

  1. Keep the monorepo tiny and legible.
  2. Pick modern tools that reduce friction (TypeScript, pnpm, FastAPI + SQLAlchemy, Alembic, PostgreSQL, Docker).
  3. Optimize for local development, fast feedback, and low cognitive load.
  4. Add AI-agent guidelines so Cursor and similar tools work **with** the repo instead of against it.

---

## 2) Scope

### In‑Scope (MVP)

* Monorepo with **frontend (React + Vite + TypeScript + Tailwind + shadcn/ui)** and **backend (FastAPI + SQLAlchemy + Alembic)**.
* **PostgreSQL** for persistence.
* **Dockerized backend** for deployment; **frontend** deployable as static build (any CDN) or container.
* **Local dev DX**: single command to bring up DB + run backend + run frontend; Vite proxy to backend.
* Basic **API**: `/api/healthz`, `/api/version`, `/api/todos` (CRUD) as reference.
* **Migrations** (Alembic) + seed script.
* Linting/formatting/testing: **Biome** (TS) for lint+format (simpler than ESLint+Prettier), **Ruff** (Py) for lint+format, **Vitest** (FE), **Pytest** (BE).
* **OpenAPI → TypeScript** client generation for tight FE/BE typing loop.
* **AI agent rules** (Cursor + others): repo guardrails, prompting conventions, and safe-change policies.

### Out‑of‑Scope (MVP)

* Full auth system (optional stub only).
* Cloud‑specific infra (Terraform, Helm, etc.).
* Background jobs / task queues.
* Advanced observability (basic logs only).

---

## 3) Success Metrics

* **Time to first run (fresh machine):** < 5 minutes.
* **One-command dev:** `make dev` launches DB + BE + FE.
* **Cold boot to first hot reload:** < 2 seconds for FE; < 3 seconds for BE.
* **New API field type-safe in FE:** < 30 seconds (via OpenAPI TS generation).
* **Lines of config a newcomer must read:** ~200 or fewer total.

---

## 4) Architecture & Tech Choices

> **DX-first, modern defaults.**

* **Frontend:** React (Vite, TypeScript), Tailwind CSS + **shadcn/ui** (Radix primitives), **pnpm** package manager, **Biome** for lint+format, **Vitest** tests.
* **Backend:** FastAPI (Pydantic v2), SQLAlchemy 2.x (ORM), Alembic (migrations), **uv** for Python dependency & venv management, Pytest, Ruff.
* **Database:** PostgreSQL (via Docker).
* **Deployment:**

  * **Backend:** Docker image (Python 3.12 slim base).
  * **Frontend:** Static build (any CDN) or Docker.
* **Monorepo tooling:** Minimal. **Makefile** + a couple of scripts. Avoid heavy monorepo orchestrators for simplicity.
* **API typing loop:** `openapi-typescript` generates types for FE from BE OpenAPI.

> **Note:** The original draft swapped ORM/migration names. Correct pairing is **ORM: SQLAlchemy**, **Migrations: Alembic**.

---

## 5) Repository Layout (final proposal)

```
./
├─ frontend/
│  ├─ src/
│  │  ├─ api/                 # generated types + lightweight client
│  │  ├─ components/
│  │  ├─ routes/
│  │  ├─ lib/
│  │  └─ main.tsx
│  ├─ public/
│  ├─ index.html
│  ├─ package.json
│  ├─ pnpm-lock.yaml
│  ├─ tsconfig.json
│  ├─ vite.config.ts
│  ├─ tailwind.config.ts
│  ├─ postcss.config.cjs
│  └─ biome.json              # FE formatting + lint (ESLint+Prettier replacement)
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ api/
│  │  │  ├─ deps.py
│  │  │  └─ v1/
│  │  │     ├─ health.py
│  │  │     └─ todos.py
│  │  ├─ core/
│  │  │  ├─ config.py
│  │  │  └─ logging.py
│  │  ├─ db/
│  │  │  ├─ session.py
│  │  │  ├─ models.py
│  │  │  └─ init_db.py
│  │  └─ schemas/
│  ├─ alembic/
│  │  └─ versions/            # migration scripts
│  ├─ alembic.ini
│  ├─ pyproject.toml          # managed by uv
│  ├─ uv.lock                 # lockfile created by uv
│  ├─ Dockerfile
│  └─ README.md
├─ infra/
│  ├─ compose.yml             # local Postgres; optional backend container
│  └─ .env.example
├─ ai/
│  ├─ cursor.rules.md         # Cursor (and AI agents) guardrails
│  └─ prompts/                # reusable task prompts
├─ scripts/
│  ├─ dev.sh                  # one-shot dev runner (optional)
│  └─ wait-for-db.sh
├─ .editorconfig
├─ .gitignore
├─ Makefile
├─ README.md
└─ PRD.md
```

> **Why `infra/compose.yml` at root?** Keeps Docker Compose infra separate and visible. The backend’s **Dockerfile** stays in `backend/`.

---

## 6) Developer Experience (DX) Features

* **One-command dev:** `make dev` (starts Postgres, then backend, then frontend).
* **Hot reload everywhere:** Vite (FE), Uvicorn reload (BE).
* **Vite proxy to backend:** Avoid CORS hassle during dev.
* **Type-safe API:** auto-generate TypeScript types from FastAPI OpenAPI.
* **Minimal linters:** Biome (FE), Ruff (BE). Fewer tools, faster runs.
* **Consistent formatting:** pre-commit hooks (optional but recommended).
* **Tiny docs:** Short, pragmatic README with copy/paste commands.

---

## 7) Functional Requirements (MVP)

1. **Health & Version**

   * `GET /api/healthz` → `{ status: "ok" }`
   * `GET /api/version` → `{ version: "x.y.z", commit: "abc123" }`

2. **Todos (reference resource)**

   * `GET /api/todos`
   * `POST /api/todos` → create `{ title: str, completed: bool=false }`
   * `PATCH /api/todos/:id`
   * `DELETE /api/todos/:id`

3. **Frontend**

   * Home page with a simple todos UI using shadcn/ui components.
   * API client typed via OpenAPI-generated TS.
   * Sensible empty/loading/error states.

---

## 8) Non‑Functional Requirements

* **Performance:** Sub-100ms p50 for simple endpoints locally.
* **Reliability:** Graceful DB init with retry; robust error handling.
* **Security (dev sensible):** CORS restricted to dev origin; basic security headers; no secrets in repo.
* **Observability:** Structured logs (BE), request logging middleware.
* **Testability:** Unit tests for core logic (BE/FE) + one integration test for `/api/todos`.

---

## 9) Local Development Workflow

### 9.1 Prereqs

* Node (LTS), **pnpm** installed.
* Python 3.12+, **uv** installed.
* Docker (for Postgres and deployment builds).

### 9.2 Environment

Create `.env` at repo root (or `infra/.env`) from `.env.example`:

```
# Postgres
POSTGRES_USER=dev
POSTGRES_PASSWORD=dev
POSTGRES_DB=app
POSTGRES_PORT=5432

# Backend
DATABASE_URL=postgresql+psycopg://dev:dev@localhost:5432/app
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:5173

# Misc
ENV=development
```

### 9.3 One-Command Dev

```bash
make dev
```

**Makefile** (sketch):

```make
.PHONY: db up fe be dev migrate seed

db:
\tdocker compose -f infra/compose.yml up -d postgres

fe:
\tcd frontend && pnpm install && pnpm dev

be:
\tcd backend && uv sync && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

migrate:
\tcd backend && uv run alembic upgrade head

seed:
\tcd backend && uv run python -m app.db.init_db

dev: db
\t# run FE and BE in parallel; keep simple by using two shells or ./scripts/dev.sh
\t# Option A: two terminals -> `make be` and `make fe`
\t# Option B: ./scripts/dev.sh (uses background jobs to run both)
```

> **Note:** Keep the parallelism simple to avoid extra dependencies. Use two terminals or a tiny `scripts/dev.sh`.

### 9.4 Vite Proxy (frontend/vite.config.ts)

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

### 9.5 FastAPI Router Prefix

```py
# backend/app/main.py
from fastapi import FastAPI
from app.api.v1.health import router as health_router
from app.api.v1.todos import router as todos_router

app = FastAPI()
app.include_router(health_router, prefix="/api")
app.include_router(todos_router, prefix="/api")
```

---

## 10) Backend Details

### 10.1 Dependencies (declared via `pyproject.toml`; installed via uv)

* `fastapi`, `uvicorn[standard]`
* `sqlalchemy[asyncio]`, `psycopg[binary]`
* `alembic`
* `pydantic`
* Dev: `pytest`, `pytest-asyncio`, `httpx`, `ruff`

> Use `uv sync` to install; `uv run <cmd>` to execute scripts in the venv.

### 10.2 DB Session (Async)

```py
# backend/app/db/session.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import settings
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, autoflush=False, autocommit=False, expire_on_commit=False)
```

### 10.3 Migrations

* Initialize Alembic once, generate revisions for model changes.
* Commands:

  * `uv run alembic revision -m "init"`
  * `uv run alembic upgrade head`

### 10.4 Seeding

* `uv run python -m app.db.init_db` creates initial demo rows (todos).

### 10.5 Basic Security

* CORS limited to dev origin.
* Starlette middleware for common headers.
* No secrets in repo; read from env only.

---

## 11) Frontend Details

### 11.1 Dependencies

* `react`, `react-dom`, `typescript`, `vite`
* `tailwindcss`, `postcss`, `autoprefixer`
* `@radix-ui/react-*` + **shadcn/ui** components
* `openapi-typescript` (dev) for typegen
* `biome` for lint/format
* `vitest` + `@testing-library/react`

### 11.2 Tailwind + shadcn/ui

* Tailwind initialized with a minimal config.
* shadcn/ui installed and configured to generate components into `src/components/ui`.

### 11.3 API Typegen

* Script in `frontend/package.json`:

  ```json
  {
    "scripts": {
      "typegen": "openapi-typescript http://localhost:8000/openapi.json -o src/api/types.ts",
      "dev": "vite",
      "build": "vite build",
      "test": "vitest run",
      "lint": "biome check .",
      "format": "biome format ."
    }
  }
  ```
* Run `pnpm typegen` after backend changes (or wire into `postbuild`).

### 11.4 UI Example (Todos)

* Use shadcn/ui `Card`, `Button`, and `Input` to CRUD todos.
* Keep state simple with React Query (optional) or fetch + local state for minimalism.

---

## 12) Docker & Deployment

### 12.1 Backend Dockerfile (minimal)

```dockerfile
# backend/Dockerfile
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# System deps
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# Copy backend
COPY . /app

# Install deps (pip here for broad compatibility; uv can be used locally)
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -e .

# Migrations baked in; alembic.ini present
CMD alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

> **Note:** For local dev we use **uv**. For deployment, this Dockerfile uses pip for broad compatibility; you may swap to uv in-container later if desired.

### 12.2 Local Infra (Postgres) via Compose

```yaml
# infra/compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-dev}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dev}
      POSTGRES_DB: ${POSTGRES_DB:-app}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
volumes:
  pg_data:
```

### 12.3 Frontend Deployment

* `pnpm build` → static assets in `dist/` → deploy to any static hosting or serve via container/nginx if preferred.

---

## 13) CI (GitHub Actions — minimal)

* **CI checks** on PR: FE build, BE tests, lint.
* Optional: build backend Docker image on `main`.

```yaml
# .github/workflows/ci.yml (sketch)
name: ci
on: [push, pull_request]
jobs:
  fe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 'lts/*' }
      - run: cd frontend && pnpm install && pnpm build && pnpm test && pnpm lint
  be:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: dev
          POSTGRES_PASSWORD: dev
          POSTGRES_DB: app
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: cd backend && pip install -e . && pytest && ruff check .
```

---

## 14) AI Agent (Cursor & Others) Rules

> Purpose: ensure AI assistance improves speed without breaking the repo’s simplicity.

Create **`ai/cursor.rules.md`**:

```md
# AI Agent Rules (Cursor, Copilot, etc.)

## Objectives
- Preserve tiny, legible architecture.
- Keep dependencies minimal; prefer standard libs first.
- Any change that adds a new tool or major dependency MUST be isolated and explained in the PR description.

## DO
- Before code edits: read `PRD.md`, `README.md`, and `Makefile`.
- Prefer adding code in existing files over new layers of abstraction.
- For API changes: update FastAPI schemas AND run `/frontend pnpm typegen`.
- Write small, focused diffs with tests and docs updates.
- Keep Vite proxy working: FE hits `/api/*` only.
- Maintain formatting: `biome` (FE) and `ruff` (BE).

## DON'T
- Don’t restructure the monorepo without an explicit instruction in issue/PR.
- Don’t introduce new state managers, routers, ORMs, UI kits, or build tools.
- Don’t generate “mega” utils or broad codegen that hides logic.
- Don’t commit secrets.

## Prompts to Use (examples)
- "Implement a new `PATCH /api/todos/:id` field `dueAt` (datetime). Update SQLAlchemy model, Alembic migration, Pydantic schema, and FE types via `pnpm typegen`. Add minimal tests."
- "Refactor `todos` API to use repository helpers but **do not** change endpoints or responses."

## Commit Policy
- Conventional commits (short): `feat: add dueAt to todos`, `fix: handle db conn error`, `chore: typegen`
- PR description checklist:
  - [ ] Why the change?
  - [ ] What changed?
  - [ ] Tests added/updated
  - [ ] Docs updated (README/PRD)
  - [ ] Typegen run (if API touched)

## Safety
- If migration changes are generated, ensure `alembic upgrade head` runs clean locally.
- Never touch `.env` tracked files with secrets; use `.env.example` for new keys.
```

Add reusable **prompt templates** under `ai/prompts/`:

* `feature.md`: step-by-step scaffold for adding an endpoint + types + UI.
* `refactor.md`: guardrails against footprint creep.
* `bugfix.md`: reproduction-first, test-first steps.

---

## 15) API Design (MVP)

### 15.1 Schemas (Pydantic)

```py
# backend/app/schemas/todo.py
from pydantic import BaseModel
from typing import Optional

class TodoCreate(BaseModel):
    title: str

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None

class TodoOut(BaseModel):
    id: int
    title: str
    completed: bool
```

### 15.2 Endpoints

* `GET /api/todos` → `list[TodoOut]`
* `POST /api/todos` (TodoCreate) → `TodoOut`
* `PATCH /api/todos/{id}` (TodoUpdate) → `TodoOut`
* `DELETE /api/todos/{id}` → `204`

---

## 16) Testing Strategy

* **Backend:** Pytest unit tests for models/services; one integration test hitting `/api/todos` with a temp DB schema.
* **Frontend:** Vitest + React Testing Library for Todo list rendering and CRUD flow.
* **Smoke test:** `GET /api/healthz` in CI.

---

## 17) Risks & Mitigations

* **Tool sprawl**: enforce AI rules + code owners on key files.
* **Migrations drift**: CI runs `alembic upgrade head` on PRs.
* **Type drift between FE/BE**: require `pnpm typegen` when BE schemas change.
* **“Helpful” abstractions**: reject PRs that increase complexity without clear ROI.

---

## 18) Rollout Plan (Milestones)

1. **Milestone 1 — Skeleton (day 1)**

   * Repo structure, Makefile, compose (Postgres), Vite proxy, FastAPI hello world, health endpoints.
2. **Milestone 2 — Data (day 2)**

   * SQLAlchemy model, Alembic init + first migration, seed script, Todos endpoints.
3. **Milestone 3 — Frontend (day 3)**

   * Tailwind + shadcn/ui wired, basic Todo UI, OpenAPI TS typegen.
4. **Milestone 4 — DX polish (day 4)**

   * Biome/Ruff, minimal tests, CI pipeline, AI rules docs.

---

## 19) Minimal Setup Cheatsheet (copy/paste)

```bash
# Infra (Postgres)
docker compose -f infra/compose.yml up -d

# Backend (uv-managed)
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd ../frontend
pnpm install
pnpm typegen
pnpm dev
```

---

## 20) Future (Optional) Enhancements

* Auth module (cookie sessions or OAuth via provider).
* Production-ready observability (metrics, tracing).
* Feature flags.
* Background jobs (RQ/Celery/Arq).
* Codegen client with request hooks (e.g., `orval`) if needed.
* Switch backend Docker build to `uv` for faster installs once stabilized.

---

### Appendix A — Example `.env.example`

```
POSTGRES_USER=dev
POSTGRES_PASSWORD=dev
POSTGRES_DB=app
POSTGRES_PORT=5432

DATABASE_URL=postgresql+psycopg://dev:dev@localhost:5432/app
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:5173
ENV=development
```

### Appendix B — Example `backend/pyproject.toml` (excerpt)

```toml
[project]
name = "tiny-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi",
  "uvicorn[standard]",
  "sqlalchemy[asyncio]",
  "psycopg[binary]",
  "alembic",
  "pydantic",
  "python-dotenv",
]

[project.optional-dependencies]
dev = ["ruff", "pytest", "pytest-asyncio", "httpx"]
```

### Appendix C — Example `frontend/biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/1.0.0/schema.json",
  "formatter": { "enabled": true },
  "linter": { "enabled": true },
  "javascript": { "formatter": { "semicolons": "asNeeded" } }
}
```

---

## Final Notes

* This PRD optimizes for **clarity** and **speed-to-ship**. It deliberately avoids complex orchestration, heavy generators, and cloud lock-in.
* Use **uv** (Python) and **pnpm** (frontend) locally for a crisp DX; keep Docker minimal for deployment.
* The **AI agent rules** ensure Cursor (and friends) accelerate work **without** ballooning complexity.
