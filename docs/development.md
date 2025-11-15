# Development Guide

This guide covers the development workflow, best practices, and common tasks for working with the 404less monorepo.

## 🚀 Getting Started

### Prerequisites

Install the required tools:

- **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/)
- **pnpm**: `npm install -g pnpm`
- **Python 3.11+**: Download from [python.org](https://www.python.org/)
- **uv**: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Docker Desktop**: Download from [docker.com](https://www.docker.com/)
- **Make**: Usually pre-installed on macOS/Linux, Windows users can use WSL

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/404less.git
   cd 404less
   ```

2. **Create environment files**
   ```bash
   # Server environment
   cp server/.env.example server/.env

   # Client environment (optional - defaults work for local dev)
   cp client/.env.example client/.env
   ```

3. **Start development environment**
   ```bash
   make dev
   ```

   This will:
   - Start PostgreSQL in Docker
   - Install server dependencies
   - Run database migrations
   - Start server on port 9001
   - Install client dependencies
   - Start client on port 9000

## 🏗️ Development Commands

### Quick Reference

```bash
# Full stack development
make dev              # Start client + server + database
make dev-all          # Start client + server + website + database

# Individual services
make client           # Start client only (port 9000)
make server           # Start server only (port 9001)
make website          # Start website only (port 9002)
make db               # Start database only

# Database operations
make migrate          # Run pending migrations
make seed             # Seed database with test data

# Code quality
make lint             # Lint all projects
make test             # Run all tests
make typegen          # Generate TypeScript types from OpenAPI

# Cleanup
make clean            # Stop services, remove dependencies
```

### Service Ports

- **Client**: http://localhost:9000
- **Server**: http://localhost:9001 (API docs at http://localhost:9001/docs)
- **Website**: http://localhost:9002
- **Database**: localhost:5432

## 📁 Working with Each Component

### Client Development

```bash
# Navigate to client directory
cd client

# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint code
pnpm lint

# Format code
pnpm format

# Generate types from API
pnpm typegen

# Build for production
pnpm build
```

**Key Files**:
- `src/main.tsx` - Application entry point
- `src/routes/root.tsx` - Main route component
- `src/contexts/AuthContext.tsx` - Authentication state
- `src/lib/api.ts` - API client
- `src/components/` - Reusable UI components
- `vite.config.ts` - Vite configuration (includes API proxy)

**Development Tips**:
- Hot Module Replacement (HMR) is enabled - changes appear instantly
- API calls use `/api/*` which proxies to `http://localhost:9001`
- TypeScript types are auto-generated from server's OpenAPI spec
- Use `pnpm typegen` after changing server API schemas

### Server Development

```bash
# Navigate to server directory
cd server

# Install dependencies
uv sync

# Start dev server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 9001

# Run tests
uv run pytest

# Run tests with coverage
uv run pytest --cov=app

# Lint code
uv run ruff check .

# Format code
uv run ruff format .

# Create database migration
uv run alembic revision -m "description of changes"

# Run migrations
uv run alembic upgrade head

# Rollback migration
uv run alembic downgrade -1
```

**Key Files**:
- `app/main.py` - FastAPI application entry point
- `app/api/v1/` - API endpoint definitions
- `app/db/models.py` - Database models (SQLAlchemy)
- `app/schemas/` - Pydantic schemas for validation
- `app/core/config.py` - Configuration management
- `alembic/versions/` - Database migrations

**Development Tips**:
- Auto-reload is enabled - changes restart server automatically
- OpenAPI docs available at http://localhost:9001/docs
- Use Pydantic schemas for request/response validation
- Always create migrations for database changes

### Website Development

```bash
# Navigate to website directory
cd website

# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Lint code
pnpm lint

# Format code
pnpm format

# Build for production
pnpm build
```

**Key Files**:
- `src/main.tsx` - Application entry point
- `src/routes/root.tsx` - Landing page component
- `src/components/ui/` - UI components
- `vite.config.ts` - Vite configuration (no API proxy)

**Development Tips**:
- Website is completely static - no API dependencies
- Links to client app use hardcoded URLs (change for production)
- Use same UI components as client for consistency
- Focus on SEO and marketing copy

## 🔄 Common Development Workflows

### Adding a New API Endpoint

1. **Create the endpoint** in `server/app/api/v1/`
   ```python
   # server/app/api/v1/websites.py
   from fastapi import APIRouter, Depends
   from app.schemas.website import Website, WebsiteCreate

   router = APIRouter()

   @router.post("/websites", response_model=Website)
   async def create_website(website: WebsiteCreate):
       # Implementation
       pass
   ```

2. **Register the router** in `server/app/main.py`
   ```python
   from app.api.v1 import websites

   app.include_router(websites.router, prefix="/api/v1", tags=["websites"])
   ```

3. **Regenerate TypeScript types**
   ```bash
   cd client
   pnpm typegen
   ```

4. **Use the new endpoint** in client
   ```typescript
   // client/src/lib/api.ts or component
   const response = await fetch('/api/v1/websites', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${token}`
     },
     body: JSON.stringify(websiteData)
   });
   ```

### Adding a Database Model

1. **Create the model** in `server/app/db/models.py`
   ```python
   class Website(Base):
       __tablename__ = "websites"

       id = Column(UUID, primary_key=True, default=uuid4)
       user_id = Column(UUID, ForeignKey("users.id"), nullable=False)
       domain = Column(String, nullable=False)
       created_at = Column(DateTime, default=datetime.utcnow)
   ```

2. **Create Pydantic schemas** in `server/app/schemas/website.py`
   ```python
   from pydantic import BaseModel
   from uuid import UUID
   from datetime import datetime

   class WebsiteBase(BaseModel):
       domain: str

   class WebsiteCreate(WebsiteBase):
       pass

   class Website(WebsiteBase):
       id: UUID
       user_id: UUID
       created_at: datetime

       class Config:
           from_attributes = True
   ```

3. **Generate migration**
   ```bash
   cd server
   uv run alembic revision -m "add websites table"
   ```

4. **Edit the migration** file in `server/alembic/versions/`
   ```python
   def upgrade():
       op.create_table(
           'websites',
           sa.Column('id', sa.UUID(), nullable=False),
           sa.Column('user_id', sa.UUID(), nullable=False),
           sa.Column('domain', sa.String(), nullable=False),
           sa.Column('created_at', sa.DateTime(), nullable=True),
           sa.ForeignKeyConstraint(['user_id'], ['users.id']),
           sa.PrimaryKeyConstraint('id')
       )
   ```

5. **Run migration**
   ```bash
   make migrate
   ```

### Adding a New UI Component

1. **Create component** in appropriate directory
   ```typescript
   // client/src/components/websites/WebsiteCard.tsx
   import { Card } from "../ui/card";
   import { Button } from "../ui/button";

   interface WebsiteCardProps {
     domain: string;
     errorCount: number;
   }

   export function WebsiteCard({ domain, errorCount }: WebsiteCardProps) {
     return (
       <Card className="p-4">
         <h3 className="text-lg font-semibold">{domain}</h3>
         <p className="text-sm text-muted-foreground">
           {errorCount} errors detected
         </p>
         <Button variant="outline" size="sm">
           View Details
         </Button>
       </Card>
     );
   }
   ```

2. **Use the component**
   ```typescript
   // client/src/routes/dashboard.tsx
   import { WebsiteCard } from "../components/websites/WebsiteCard";

   export function Dashboard() {
     const websites = useWebsites(); // Your data hook

     return (
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
         {websites.map(website => (
           <WebsiteCard
             key={website.id}
             domain={website.domain}
             errorCount={website.errorCount}
           />
         ))}
       </div>
     );
   }
   ```

## 🧪 Testing

### Client Tests

```bash
cd client

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test -- --coverage
```

**Example Test**:
```typescript
// client/src/components/WebsiteCard.test.tsx
import { render, screen } from '@testing-library/react';
import { WebsiteCard } from './WebsiteCard';

describe('WebsiteCard', () => {
  it('displays website domain', () => {
    render(<WebsiteCard domain="example.com" errorCount={5} />);
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('displays error count', () => {
    render(<WebsiteCard domain="example.com" errorCount={5} />);
    expect(screen.getByText('5 errors detected')).toBeInTheDocument();
  });
});
```

### Server Tests

```bash
cd server

# Run all tests
uv run pytest

# Run specific test file
uv run pytest tests/test_auth.py

# Run with coverage
uv run pytest --cov=app --cov-report=html
```

**Example Test**:
```python
# server/tests/test_websites.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_website():
    response = client.post(
        "/api/v1/websites",
        json={"domain": "example.com"},
        headers={"Authorization": "Bearer valid_token"}
    )
    assert response.status_code == 201
    assert response.json()["domain"] == "example.com"
```

## 🎨 Code Style

### TypeScript/React (Client & Website)

We use **Biome** for linting and formatting:

```bash
# Check for issues
pnpm lint

# Format code
pnpm format
```

**Standards**:
- Use functional components with hooks
- Prefer named exports over default exports
- Use TypeScript strict mode
- 100 character line length
- Use Tailwind CSS for styling
- Follow React best practices

### Python (Server)

We use **Ruff** for linting and formatting:

```bash
# Check for issues
uv run ruff check .

# Format code
uv run ruff format .
```

**Standards**:
- Follow PEP 8 style guide
- Use type hints for function signatures
- 100 character line length
- Use Pydantic for data validation
- Follow FastAPI best practices

## 🐛 Debugging

### Client Debugging

1. **Browser DevTools**: Use React DevTools extension
2. **Console Logs**: Check browser console for errors
3. **Network Tab**: Inspect API requests and responses
4. **React Query DevTools**: If using React Query (future)

### Server Debugging

1. **Logs**: Server logs appear in terminal
2. **Debugger**: Use Python debugger (pdb)
   ```python
   import pdb; pdb.set_trace()
   ```
3. **API Docs**: Test endpoints at http://localhost:9001/docs
4. **Database**: Connect with `psql` or GUI tool
   ```bash
   psql postgresql://dev:dev@localhost:5432/app
   ```

## 🔧 Troubleshooting

### Port Already in Use

```bash
# Find process using port 9000/9001/9002
lsof -i :9000
lsof -i :9001
lsof -i :9002

# Kill the process
kill -9 <PID>
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps

# Restart database
docker compose -f server/compose.yml restart postgres

# Check logs
docker compose -f server/compose.yml logs postgres
```

### Dependencies Out of Sync

```bash
# Client/Website
cd client  # or cd website
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Server
cd server
rm -rf .venv uv.lock
uv sync
```

### TypeScript Type Errors

```bash
# Regenerate types from API
cd client
pnpm typegen

# Check if server is running (required for typegen)
curl http://localhost:9001/openapi.json
```

## 📚 Related Documentation

- [Architecture Guide](./architecture.md) - System design and components
- [Deployment Guide](./deployment.md) - Production deployment
- [Monorepo Structure](./monorepo-structure.md) - Directory layout
