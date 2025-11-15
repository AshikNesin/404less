# Monorepo Structure

This document provides a detailed explanation of the 404less monorepo directory structure.

## 📁 Repository Overview

```
404less/
├── client/          # Authenticated React application
├── website/         # Marketing landing page
├── server/          # FastAPI backend API
├── ai/              # AI assistant configuration
├── docs/            # Documentation
├── scripts/         # Development scripts
├── Makefile         # Build commands
├── CLAUDE.md        # AI assistant guidelines
└── README.md        # Project README
```

## 🖥️ Client Directory (`client/`)

The authenticated web application for logged-in users.

```
client/
├── public/                    # Static assets
│   └── vite.svg              # Vite logo
├── src/
│   ├── api/                  # Generated TypeScript types
│   │   └── types.ts          # Auto-generated from OpenAPI spec
│   ├── components/           # React components
│   │   ├── auth/             # Authentication components
│   │   │   ├── MagicLinkForm.tsx        # Email input form
│   │   │   ├── MagicLinkVerifier.tsx    # Token verification
│   │   │   └── SignInModal.tsx          # Sign-in modal wrapper
│   │   ├── todos/            # Todo demo components (can be removed)
│   │   │   ├── todo-form.tsx
│   │   │   ├── todo-item.tsx
│   │   │   └── todo-list.tsx
│   │   └── ui/               # shadcn/ui components
│   │       ├── alert.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── checkbox.tsx
│   │       ├── input.tsx
│   │       └── label.tsx
│   ├── contexts/             # React contexts
│   │   └── AuthContext.tsx   # Authentication state management
│   ├── lib/                  # Utilities
│   │   ├── api.ts            # API client configuration
│   │   └── utils.ts          # Utility functions (cn helper)
│   ├── routes/               # Page components
│   │   ├── root.tsx          # Dashboard/main page
│   │   └── root.test.tsx     # Dashboard tests
│   ├── index.css             # Global styles + Tailwind imports
│   └── main.tsx              # Application entry point
├── .env.example              # Environment variable template
├── .gitignore                # Git ignore rules
├── biome.json                # Biome linter/formatter config
├── index.html                # HTML entry point
├── package.json              # NPM dependencies and scripts
├── pnpm-lock.yaml            # Lockfile
├── postcss.config.cjs        # PostCSS configuration
├── README.md                 # Client README
├── tailwind.config.ts        # Tailwind CSS configuration
├── tsconfig.json             # TypeScript configuration
├── tsconfig.app.json         # App TypeScript config
├── tsconfig.node.json        # Node TypeScript config
├── vite.config.ts            # Vite configuration (includes proxy)
└── vitest.setup.ts           # Vitest test setup
```

### Key Files

**`src/main.tsx`**
- Application entry point
- Wraps app with AuthProvider
- Renders to `#root` element

**`src/routes/root.tsx`**
- Main dashboard page
- Shows authenticated vs unauthenticated state
- Empty state with "Add Website" placeholder

**`src/contexts/AuthContext.tsx`**
- Authentication state management
- Provides `user`, `isAuthenticated`, `login`, `logout`
- Checks for existing auth token on mount

**`src/lib/api.ts`**
- API client configuration
- Base URL from environment variable
- Helper functions for API calls

**`vite.config.ts`**
- Vite configuration
- Dev server on port 9000
- Proxy `/api/*` to `http://localhost:9001` in development
- Vitest configuration

**`package.json`**
```json
{
  "name": "404less-client",
  "scripts": {
    "dev": "vite",              // Start dev server
    "build": "vite build",      // Build for production
    "test": "vitest run",       // Run tests
    "lint": "biome check .",    // Lint code
    "typegen": "openapi-typescript http://localhost:9001/openapi.json -o src/api/types.ts"
  }
}
```

## 🌐 Website Directory (`website/`)

The marketing landing page (static, no API dependencies).

```
website/
├── public/                    # Static assets
│   └── vite.svg
├── src/
│   ├── components/           # React components
│   │   └── ui/               # shadcn/ui components
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       └── label.tsx
│   ├── routes/               # Page components
│   │   └── root.tsx          # Landing page
│   ├── index.css             # Global styles + Tailwind
│   └── main.tsx              # Application entry point
├── .env.example              # (Empty - no env vars needed)
├── .gitignore
├── biome.json
├── index.html
├── package.json
├── pnpm-lock.yaml
├── postcss.config.cjs
├── README.md
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts            # No proxy, port 9002
```

### Key Files

**`src/routes/root.tsx`**
- Marketing landing page
- Hero section, features, pricing, CTA
- Email signup form
- Links to client app (http://localhost:9000 in dev)

**`vite.config.ts`**
- Simpler than client config
- No API proxy (static site)
- Dev server on port 9002

**`package.json`**
```json
{
  "name": "404less-website",
  "scripts": {
    "dev": "vite --port 9002",   // Start dev server on 9002
    "build": "vite build",        // Build for production
    "lint": "biome check .",      // Lint code
    "format": "biome format . --write"  // Format code
  }
}
```

## 🖥️ Server Directory (`server/`)

The FastAPI backend providing REST APIs.

```
server/
├── alembic/                   # Database migrations
│   ├── versions/              # Migration files
│   │   ├── 20240417_0001_init.py
│   │   └── 26fb4ef30b18_add_auth_tables.py
│   ├── env.py                 # Alembic environment
│   └── script.py.mako         # Migration template
├── app/                       # Application code
│   ├── api/                   # API endpoints
│   │   ├── v1/                # API version 1
│   │   │   ├── auth.py        # Authentication endpoints
│   │   │   ├── health.py      # Health check
│   │   │   └── todos.py       # Todo demo (can be removed)
│   │   └── deps.py            # Dependency injection
│   ├── core/                  # Core functionality
│   │   ├── config.py          # Configuration
│   │   ├── exceptions.py      # Custom exceptions
│   │   └── logging.py         # Logging setup
│   ├── db/                    # Database
│   │   ├── models.py          # SQLAlchemy models
│   │   ├── session.py         # Database session
│   │   └── init_db.py         # Database initialization
│   ├── middleware/            # Custom middleware
│   │   ├── logging.py         # Request logging
│   │   └── rate_limit.py      # Rate limiting
│   ├── schemas/               # Pydantic schemas
│   │   ├── auth.py            # Auth schemas
│   │   └── todo.py            # Todo schemas
│   └── main.py                # FastAPI app entry point
├── tests/                     # Tests
│   ├── conftest.py            # Pytest configuration
│   ├── test_health.py         # Health endpoint tests
│   └── test_todos.py          # Todo endpoint tests
├── .env.example               # Environment template
├── alembic.ini                # Alembic configuration
├── compose.yml                # Docker Compose for PostgreSQL
├── Dockerfile                 # Production container
├── pyproject.toml             # Python dependencies (uv)
├── uv.lock                    # Lockfile
└── README.md                  # Server README
```

### Key Files

**`app/main.py`**
- FastAPI application entry point
- Registers API routers
- Configures middleware (CORS, logging, rate limiting)
- Defines OpenAPI metadata

**`app/api/v1/auth.py`**
- Magic link authentication endpoints
- `POST /api/v1/auth/magic-link` - Request magic link
- `POST /api/v1/auth/verify` - Verify magic link token
- `GET /api/v1/auth/me` - Get current user

**`app/db/models.py`**
- SQLAlchemy models
- `User` - User accounts
- `MagicLink` - Magic link tokens
- `Todo` - Demo todos (can be removed)

**`app/schemas/`**
- Pydantic schemas for request/response validation
- Auto-generates OpenAPI documentation
- Type-safe validation

**`app/core/config.py`**
- Application configuration
- Loads from environment variables
- Database URL, CORS origins, secrets

**`alembic/versions/`**
- Database migration files
- Sequential version control for schema changes
- `upgrade()` and `downgrade()` functions

**`compose.yml`**
```yaml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
```

**`Dockerfile`**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9001"]
```

**`pyproject.toml`**
```toml
[project]
name = "404less-server"
dependencies = [
  "fastapi",
  "uvicorn",
  "sqlalchemy",
  "alembic",
  "psycopg[binary]",
  # ... more dependencies
]
```

## 📜 Scripts Directory (`scripts/`)

Utility scripts for development.

```
scripts/
├── dev.sh            # Main development script
└── wait-for-db.sh    # Wait for PostgreSQL to be ready
```

**`dev.sh`**
- Starts database, server, and client
- Supports `--all` flag to include website
- Handles process management and cleanup

**`wait-for-db.sh`**
- Waits for PostgreSQL to accept connections
- Prevents server from starting before DB is ready

## 📄 Root Level Files

**`Makefile`**
- Convenient command shortcuts
- `make dev`, `make test`, `make lint`, etc.
- Works across all three applications

**`CLAUDE.md`**
- Guidelines for AI assistants (Claude Code, Cursor, etc.)
- Project structure overview
- Development patterns and commands

**`.gitignore`**
- Ignores `node_modules/`, `.venv/`, `dist/`, etc.
- Environment files (`.env`)
- Build artifacts

## 🎨 AI Directory (`ai/`)

```
ai/
├── cursor.rules.md    # Rules for AI code assistants
└── prompts/           # Reusable prompt templates
```

Contains guidelines for AI coding assistants to maintain consistency.

## 📚 Docs Directory (`docs/`)

```
docs/
├── README.md                 # Documentation index
├── architecture.md           # System architecture
├── development.md            # Development guide
├── deployment.md             # Deployment guide
├── monorepo-structure.md     # This file
└── roadmap.md                # Product roadmap
```

## 🔄 Shared Concepts

### Environment Files

Each app has an `.env.example` template:
- `server/.env.example` - Database, CORS, secrets
- `client/.env.example` - API URL
- `website/.env.example` - (Empty, no env vars needed)

### Configuration Files

Each frontend app has similar configs:
- `biome.json` - Linting and formatting
- `tailwind.config.ts` - Tailwind CSS
- `tsconfig.json` - TypeScript
- `vite.config.ts` - Vite bundler
- `package.json` - Dependencies and scripts

### UI Components

Client and website share the same shadcn/ui components:
- Consistent design system
- Copy components between apps as needed
- Tailwind classes for styling

## 🎯 Design Decisions

### Why Separate Client and Website?

1. **Independent Deployment**: Website can deploy to different CDN than client
2. **Performance**: Website has no auth dependencies, lighter bundle
3. **SEO**: Marketing site can be optimized differently
4. **Security**: No auth code in public marketing site

### Why Monorepo?

1. **Code Sharing**: Share types, utilities, UI components
2. **Consistency**: Same linting, formatting, patterns
3. **Single Source**: All code in one repository
4. **Simplified Development**: One command to start everything

### Why Three Ports?

- **9000** - Client (primary app)
- **9001** - Server (API)
- **9002** - Website (marketing)

Avoids conflicts, clear separation, easy to remember.

## 📚 Related Documentation

- [Architecture Guide](./architecture.md) - System design
- [Development Guide](./development.md) - Development workflow
- [Deployment Guide](./deployment.md) - Production deployment
