# Architecture Guide

This document explains the architecture of 404less, a real-time 404 monitoring SaaS platform built as a monorepo.

## 🏛️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      404less Platform                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐   ┌──────────────────┐   ┌──────────────┐
│    Website       │   │     Client       │   │    Server    │
│  (Marketing)     │   │  (Authenticated  │   │   (API)      │
│                  │   │      App)        │   │              │
│  React + Vite    │   │  React + Vite    │   │   FastAPI    │
│  Port: 9002      │   │  Port: 9000      │   │  Port: 9001  │
│                  │   │                  │   │              │
│  Static Only     │   │   API Client     │◄──┤  REST API    │
│  No API Deps     │   │   + Auth         │   │  + Auth      │
└──────────────────┘   └──────────────────┘   └──────┬───────┘
                                                      │
                                                      ▼
                                              ┌──────────────┐
                                              │  PostgreSQL  │
                                              │   Database   │
                                              └──────────────┘
```

## 🔧 Components

### 1. Website (Marketing Site)

**Purpose**: Public-facing marketing website to attract users and drive signups.

**Key Features**:
- Landing page with product information
- Email waitlist signup
- Pricing information (coming soon)
- Links to client app for authentication

**Technology Stack**:
- React 19 with TypeScript
- Vite for build and dev server
- Tailwind CSS for styling
- shadcn/ui for UI components
- No backend dependencies

**Deployment**:
- Static build (`pnpm build`)
- Deployable to Netlify, Vercel, or any CDN
- No environment variables required
- Completely independent from client and server

### 2. Client (Authenticated Application)

**Purpose**: Authenticated web application where users manage their websites and monitor 404 errors.

**Key Features**:
- Magic link authentication
- Dashboard for monitoring 404 errors
- Website management (add/edit/delete)
- Real-time error notifications
- User account management

**Technology Stack**:
- React 19 with TypeScript
- Vite for build and dev server
- Tailwind CSS for styling
- shadcn/ui for UI components
- React Context for state management
- API client with auto-generated types

**API Communication**:
- **Development**: Vite proxy routes `/api/*` to `http://localhost:9001`
- **Production**: Direct API calls to configured `VITE_API_BASE_URL`

**Authentication**:
- Magic link email authentication
- JWT tokens stored in localStorage
- Auth context provides user state across app
- Protected routes require authentication

**Deployment**:
- Static build (`pnpm build`)
- Requires `VITE_API_BASE_URL` environment variable
- Deployable to any static hosting or CDN
- Works with any server location

### 3. Server (API Backend)

**Purpose**: RESTful API backend providing authentication, data management, and business logic.

**Key Features**:
- REST API endpoints
- Magic link authentication
- User management
- Website monitoring data
- Database management
- Rate limiting and security

**Technology Stack**:
- Python 3.11+
- FastAPI web framework
- SQLAlchemy ORM
- Alembic for migrations
- PostgreSQL database
- Pydantic for validation
- uvicorn ASGI server

**API Design**:
- RESTful endpoints under `/api/v1/*`
- OpenAPI/Swagger documentation at `/docs`
- JSON request/response format
- JWT token authentication
- CORS configured for client origins

**Database**:
- PostgreSQL for data persistence
- SQLAlchemy models in `server/app/db/models.py`
- Alembic migrations in `server/alembic/`
- Connection pooling and optimization

**Deployment**:
- Docker container
- Environment variables for configuration
- Requires PostgreSQL database
- Horizontal scaling supported

## 🔄 Data Flow

### User Authentication Flow

```
1. User visits Website (9002)
   ↓
2. Clicks "Sign In" → redirected to Client (9000)
   ↓
3. Client shows magic link modal
   ↓
4. User enters email → Client calls POST /api/v1/auth/magic-link
   ↓
5. Server generates token, sends email
   ↓
6. User clicks email link → Client receives token
   ↓
7. Client calls POST /api/v1/auth/verify with token
   ↓
8. Server validates token, returns JWT + user info
   ↓
9. Client stores JWT, updates auth context
   ↓
10. User sees dashboard
```

### API Request Flow (Authenticated)

```
Client (9000)
   │
   │ 1. User action triggers API call
   │
   ▼
API Client (client/src/lib/api.ts)
   │
   │ 2. Adds JWT token to Authorization header
   │
   ▼
Vite Proxy (dev) or Direct URL (prod)
   │
   │ 3. Routes to server
   │
   ▼
Server (9001)
   │
   │ 4. Validates JWT token
   │
   ▼
API Endpoint (server/app/api/v1/*)
   │
   │ 5. Processes request
   │
   ▼
Database Query (PostgreSQL)
   │
   │ 6. Fetches/updates data
   │
   ▼
JSON Response
   │
   │ 7. Returns to client
   │
   ▼
Client updates UI
```

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Magic Links Table
```sql
CREATE TABLE magic_links (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    token VARCHAR UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Websites Table (Future)
```sql
CREATE TABLE websites (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    domain VARCHAR NOT NULL,
    widget_key VARCHAR UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Error Reports Table (Future)
```sql
CREATE TABLE error_reports (
    id UUID PRIMARY KEY,
    website_id UUID REFERENCES websites(id),
    url VARCHAR NOT NULL,
    referrer VARCHAR,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔐 Security

### Authentication
- Magic link email authentication (passwordless)
- JWT tokens with expiration
- Secure token generation
- Email verification required

### API Security
- CORS configured for allowed origins
- Rate limiting on endpoints
- Input validation with Pydantic
- SQL injection prevention via SQLAlchemy ORM

### Data Security
- Environment variables for secrets
- No credentials in code
- Secure database connections
- HTTPS required in production

## 🚀 Scaling Considerations

### Horizontal Scaling
- Client and Website: CDN distribution (infinite scale)
- Server: Multiple instances behind load balancer
- Database: Read replicas, connection pooling

### Performance
- Static builds for client/website (fast delivery)
- API response caching where appropriate
- Database indexes on frequently queried fields
- Lazy loading and code splitting in client

### Monitoring
- Server logs for API requests
- Error tracking (future: Sentry integration)
- Performance metrics (future: monitoring service)
- User analytics (future: analytics integration)

## 📦 Deployment Architecture

### Development
```
Developer Machine
  ├── Client (Vite Dev Server :9000)
  ├── Server (Uvicorn :9001)
  ├── Website (Vite Dev Server :9002)
  └── PostgreSQL (Docker :5432)
```

### Production
```
                    Internet
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   CDN (Website)  CDN (Client)   Server Cluster
   Netlify/       Vercel/        Docker Swarm/
   Vercel         CloudFront     Kubernetes
        │              │              │
        └──────────────┴──────────────┘
                       │
                       ▼
              PostgreSQL Database
              (Managed Service)
```

## 🔄 Development Workflow

1. **Local Development**
   - Run `make dev` for client + server
   - Run `make dev-all` to include website
   - Hot reload enabled for all services

2. **API Changes**
   - Update server endpoints
   - Run `make typegen` to update client types
   - Client automatically uses new types

3. **Database Changes**
   - Modify models in `server/app/db/models.py`
   - Generate migration: `cd server && uv run alembic revision -m "description"`
   - Apply migration: `make migrate`

4. **Testing**
   - Run `make test` to test all components
   - Individual tests: `cd client && pnpm test` or `cd server && uv run pytest`

## 🎯 Design Principles

1. **Separation of Concerns**: Each app has a clear, focused purpose
2. **Independent Deployment**: Website, client, and server can deploy separately
3. **Type Safety**: TypeScript in client, Pydantic in server
4. **Developer Experience**: Fast HMR, clear error messages, simple commands
5. **Production Ready**: Static builds, containerization, scalability

## 📚 Related Documentation

- [Monorepo Structure](./monorepo-structure.md) - Detailed directory layout
- [Development Guide](./development.md) - Development workflow
- [Deployment Guide](./deployment.md) - Deployment instructions
