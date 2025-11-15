# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is "404less" - a 404 monitoring SaaS platform. It's a monorepo with three main applications: a React client app, a marketing website, and a FastAPI backend.

**Architecture:**
- Client: React + Vite + TypeScript + Tailwind + shadcn/ui (authenticated app)
- Website: React + Vite + TypeScript + Tailwind + shadcn/ui (marketing site)
- Server: FastAPI + SQLAlchemy + Alembic (PostgreSQL)
- Database: PostgreSQL (via Docker)
- Package managers: pnpm (client/website), uv (server)
- Code quality: Biome (client/website), Ruff (server)

## Development Commands

### Full Stack Development
```bash
# Start client + server (database + server + client)
make dev

# Start all services (database + server + client + website)
make dev-all

# Start individual services
make db        # Database only
make server    # Server only
make client    # Client only
make website   # Website only
```

### Database Operations
```bash
# Run database migrations
make migrate

# Seed database with initial data
make seed
```

### Server Commands (run from server/ directory)
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

### Client Commands (run from client/ directory)
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

### Website Commands (run from website/ directory)
```bash
# Install dependencies
pnpm install

# Start development server (runs on port 9002)
pnpm dev

# Build for production
pnpm build

# Lint code
pnpm lint

# Format code
pnpm format
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
├── client/                   # React client app (authenticated users)
│   ├── src/
│   │   ├── api/             # Generated types and API client
│   │   ├── components/      # React components (ui/, auth/, etc.)
│   │   ├── contexts/        # React contexts (AuthContext)
│   │   ├── lib/             # Utilities and API client
│   │   ├── routes/          # Page components
│   │   └── main.tsx         # App entry point
│   ├── .env.example         # Environment template
│   ├── package.json
│   ├── vite.config.ts       # Vite config (port 9000, API proxy)
│   └── biome.json          # Linting/formatting config
├── website/                  # Marketing website (static, deployable separately)
│   ├── src/
│   │   ├── components/      # React components (ui/)
│   │   ├── routes/          # Page components
│   │   └── main.tsx         # App entry point
│   ├── package.json
│   ├── vite.config.ts       # Vite config (port 9002, no API proxy)
│   └── biome.json          # Linting/formatting config
├── server/                   # FastAPI backend (self-contained service)
│   ├── app/
│   │   ├── main.py          # FastAPI app entry point
│   │   ├── api/v1/          # API endpoints (health.py, auth.py, etc.)
│   │   ├── core/            # Configuration and logging
│   │   ├── db/              # Database models and session
│   │   ├── middleware/      # Custom middleware
│   │   └── schemas/         # Pydantic schemas
│   ├── alembic/             # Database migrations
│   ├── tests/               # Backend tests
│   ├── compose.yml          # Docker Compose for PostgreSQL
│   ├── .env.example         # Environment template
│   ├── Dockerfile           # Production container
│   └── pyproject.toml       # Python dependencies
├── ai/                      # AI assistant guidelines
│   ├── cursor.rules.md      # Rules for AI assistants
│   └── prompts/             # Reusable prompt templates
├── scripts/                 # Utility scripts
│   ├── dev.sh              # Development runner (supports --all flag)
│   └── wait-for-db.sh      # Database wait script
└── Makefile                # Common commands
```

## Key Development Patterns

### API Development Workflow
1. Modify FastAPI endpoints in `server/app/api/v1/`
2. Update Pydantic schemas in `server/app/schemas/`
3. If database changes: create Alembic migration
4. Regenerate client types: `cd client && pnpm typegen`
5. Update client components to use new types

### Database Changes
1. Modify models in `server/app/db/models.py`
2. Generate migration: `cd server && uv run alembic revision -m "description"`
3. Apply migration: `make migrate`
4. Update schemas if needed

### Client API Calls
- Use the Vite proxy - all API calls go to `/api/*` endpoints (client only)
- API client is in `client/src/lib/api.ts`
- Types are auto-generated from OpenAPI spec
- Website does NOT connect to the API - it's a static marketing site

### Code Quality Standards
- Server: Use Ruff for linting and formatting (`uv run ruff check .` and `uv run ruff format .`)
- Client/Website: Use Biome for linting and formatting (`pnpm lint` and `pnpm format`)
- Line length: 100 characters for all codebases

## AI Assistant Guidelines

Follow the rules in `ai/cursor.rules.md`:
- Preserve the tiny, legible monorepo structure
- Keep dependencies minimal
- Use existing patterns before adding new abstractions
- When APIs change, regenerate TypeScript types
- Format code before committing
- Don't restructure the monorepo without explicit approval

## Environment Setup

### Server Environment
Create `server/.env` from `server/.env.example`:
```bash
DATABASE_URL=postgresql+psycopg://dev:dev@localhost:5432/app
BACKEND_HOST=0.0.0.0
BACKEND_PORT=9001
CORS_ORIGINS=http://localhost:9000
ENV=development
```

**Note:** Docker Compose automatically provides sensible defaults for PostgreSQL. Only the `DATABASE_URL` is required by the server application.

### Client Environment
Create `client/.env` from `client/.env.example`:
```bash
# Local development - uses Vite proxy
VITE_API_BASE_URL=/api

# Production example - point to specific backend
VITE_API_BASE_URL=https://api.yourdomain.com
```

**Environment Variables:**
- `VITE_API_BASE_URL`: Base URL for all API requests (defaults to `/api`)
- Vite automatically loads this during build and development
- In development, Vite proxy routes `/api` to `http://localhost:9001`

### Website Environment
The website is a static marketing site and doesn't require environment variables. It can be deployed to any static hosting platform (Netlify, Vercel, etc.).

## Local Development Ports

- Client: http://localhost:9000 (authenticated app with Vite dev server + HMR)
- Server: http://localhost:9001 (FastAPI with OpenAPI docs)
- Website: http://localhost:9002 (marketing site with Vite dev server + HMR)
- Database: localhost:5432 (PostgreSQL)

## Testing

- Server tests: Use pytest, located in `server/tests/`
- Client tests: Use Vitest + React Testing Library
- Website: Can use Vitest for component testing if needed
- Test files should be co-located with source files or in dedicated test directories

## Production Deployment

### Server
- Deploy as Docker container (see `server/Dockerfile`)
- Requires PostgreSQL database
- Set environment variables for production

### Client (Authenticated App)
- Build: `cd client && pnpm build`
- Deploy static build to CDN or static hosting
- Set `VITE_API_BASE_URL` to your production API URL before building

```bash
# Example: Set API URL and build
cd client
VITE_API_BASE_URL=https://api.404less.com pnpm build

# Or create a .env.production file
echo "VITE_API_BASE_URL=https://api.404less.com" > client/.env.production
pnpm build
```

### Website (Marketing Site)
- Build: `cd website && pnpm build`
- Deploy to Netlify, Vercel, or any static hosting platform
- No environment variables needed
- Can be deployed completely separately from client and server

```bash
cd website
pnpm build
# Deploy dist/ folder to Netlify, Vercel, etc.
```