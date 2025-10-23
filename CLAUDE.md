# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is "Tiny Boilerplate" - a minimal, opinionated web app starter for indie developers. It's a monorepo with a React frontend and FastAPI backend, designed for simplicity and fast development.

**Architecture:**
- Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui
- Backend: FastAPI + SQLAlchemy + Alembic (PostgreSQL)
- Database: PostgreSQL (via Docker)
- Package managers: pnpm (frontend), uv (backend)
- Code quality: Biome (FE), Ruff (BE)

## Development Commands

### Full Stack Development
```bash
# Start everything (database + backend + frontend)
make dev

# Start database only
make db

# Start backend only
make be

# Start frontend only
make fe
```

### Database Operations
```bash
# Run database migrations
make migrate

# Seed database with initial data
make seed
```

### Backend Commands (run from backend/ directory)
```bash
# Install dependencies
uv sync

# Start development server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 9001

# Run tests
uv run pytest

# Lint code
uv run ruff check .

# Format code
uv run ruff format .

# Create migration
uv run alembic revision -m "description"

# Run migrations
uv run alembic upgrade head
```

### Frontend Commands (run from frontend/ directory)
```bash
# Install dependencies
pnpm install

# Start development server (runs on port 9000)
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Watch tests
pnpm test:watch

# Lint code
pnpm lint

# Format code
pnpm format

# Generate TypeScript types from OpenAPI
pnpm typegen
```

### Testing
```bash
# Run all tests (both frontend and backend)
make test
```

### Cleanup
```bash
# Stop all services and clean up
make clean
```

## Project Structure

```
./
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── api/             # Generated types and API client
│   │   ├── components/      # React components (ui/, todos/)
│   │   ├── lib/             # Utilities and API client
│   │   ├── routes/          # Page components
│   │   └── main.tsx         # App entry point
│   ├── package.json
│   ├── vite.config.ts       # Vite config with API proxy
│   └── biome.json          # Linting/formatting config
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── main.py          # FastAPI app entry point
│   │   ├── api/v1/          # API endpoints (health.py, todos.py)
│   │   ├── core/            # Configuration and logging
│   │   ├── db/              # Database models and session
│   │   ├── middleware/      # Custom middleware
│   │   └── schemas/         # Pydantic schemas
│   ├── alembic/             # Database migrations
│   ├── tests/               # Backend tests
│   └── pyproject.toml       # Python dependencies
├── infra/                   # Infrastructure configuration
│   └── compose.yml          # Docker Compose for PostgreSQL
├── ai/                      # AI assistant guidelines
│   ├── cursor.rules.md      # Rules for AI assistants
│   └── prompts/             # Reusable prompt templates
├── scripts/                 # Utility scripts
│   ├── dev.sh              # Development runner
│   └── wait-for-db.sh      # Database wait script
└── Makefile                # Common commands
```

## Key Development Patterns

### API Development Workflow
1. Modify FastAPI endpoints in `backend/app/api/v1/`
2. Update Pydantic schemas in `backend/app/schemas/`
3. If database changes: create Alembic migration
4. Regenerate frontend types: `cd frontend && pnpm typegen`
5. Update frontend components to use new types

### Database Changes
1. Modify models in `backend/app/db/models.py`
2. Generate migration: `cd backend && uv run alembic revision -m "description"`
3. Apply migration: `make migrate`
4. Update schemas if needed

### Frontend API Calls
- Use the Vite proxy - all API calls go to `/api/*` endpoints
- API client is in `frontend/src/lib/api.ts`
- Types are auto-generated from OpenAPI spec

### Code Quality Standards
- Backend: Use Ruff for linting and formatting (`uv run ruff check .` and `uv run ruff format .`)
- Frontend: Use Biome for linting and formatting (`pnpm lint` and `pnpm format`)
- Line length: 100 characters for both codebases

## AI Assistant Guidelines

Follow the rules in `ai/cursor.rules.md`:
- Preserve the tiny, legible monorepo structure
- Keep dependencies minimal
- Use existing patterns before adding new abstractions
- When APIs change, regenerate TypeScript types
- Format code before committing
- Don't restructure the monorepo without explicit approval

## Environment Setup

Create `infra/.env` from the example values:
```bash
POSTGRES_USER=dev
POSTGRES_PASSWORD=dev
POSTGRES_DB=app
POSTGRES_PORT=5432
DATABASE_URL=postgresql+psycopg://dev:dev@localhost:5432/app
```

## Local Development Ports

- Frontend: http://localhost:9000 (Vite dev server)
- Backend: http://localhost:9001 (FastAPI with OpenAPI docs)
- Database: localhost:5432 (PostgreSQL)

## Testing

- Backend tests: Use pytest, located in `backend/tests/`
- Frontend tests: Use Vitest + React Testing Library
- Test files should be co-located with source files or in dedicated test directories

## Production Deployment

- Backend: Docker container (see `backend/Dockerfile`)
- Frontend: Static build (`pnpm build`) for CDN deployment
- Database: PostgreSQL instance