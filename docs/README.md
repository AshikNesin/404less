# 404less Documentation

Welcome to the 404less documentation! This guide will help you understand the project structure, get started with development, and deploy the application.

## 📚 Documentation Index

- **[Architecture](./architecture.md)** - Understand the system design and component interactions
- **[Monorepo Structure](./monorepo-structure.md)** - Detailed explanation of the directory structure
- **[Development Guide](./development.md)** - Development workflow, commands, and best practices
- **[Deployment Guide](./deployment.md)** - How to deploy client, website, and server
- **[Roadmap](./roadmap.md)** - Product roadmap and planned features

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and **pnpm** (for client and website)
- **Python** 3.11+ and **uv** (for server)
- **Docker** and **Docker Compose** (for PostgreSQL)
- **Make** (for convenience commands)

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/404less.git
   cd 404less
   ```

2. **Set up environment files**
   ```bash
   # Server environment
   cp server/.env.example server/.env

   # Client environment
   cp client/.env.example client/.env
   ```

3. **Start the development environment**
   ```bash
   # Start database + server + client
   make dev

   # Or start all services including website
   make dev-all
   ```

4. **Access the applications**
   - Client (App): http://localhost:9000
   - Server (API): http://localhost:9001
   - Website (Marketing): http://localhost:9002

## 🏗️ Project Overview

404less is a real-time 404 monitoring SaaS platform built as a monorepo with three main applications:

### Client (`client/`)
The authenticated React application where users manage their websites and view 404 error reports.

- **Technology**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Port**: 9000
- **Features**: Authentication, dashboard, website management

### Website (`website/`)
The marketing landing page that can be deployed independently to static hosting platforms.

- **Technology**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Port**: 9002
- **Features**: Marketing content, email signup, links to client app

### Server (`server/`)
The FastAPI backend providing REST APIs for authentication and data management.

- **Technology**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Port**: 9001
- **Features**: REST API, authentication, database management

## 📖 Key Concepts

### Separation of Concerns

The monorepo is structured to keep each application independent:

- **Client** and **Website** are completely separate React apps
- **Website** has no API dependencies and can be deployed anywhere
- **Client** connects to the API via proxy in development, direct URL in production
- **Server** is a standalone API that can be deployed independently

### Development vs Production

**Development:**
- Vite dev servers provide HMR (Hot Module Replacement)
- Client uses proxy to connect to server (`/api` → `http://localhost:9001`)
- All services run locally via `make dev` or `make dev-all`

**Production:**
- Client and Website are built as static files (`pnpm build`)
- Client needs `VITE_API_BASE_URL` env var pointing to production API
- Website requires no environment variables
- Server runs as a Docker container

## 🔧 Common Commands

```bash
# Development
make dev          # Start client + server
make dev-all      # Start client + server + website
make client       # Start client only
make server       # Start server only
make website      # Start website only

# Database
make db           # Start PostgreSQL
make migrate      # Run database migrations
make seed         # Seed database with initial data

# Code Quality
make lint         # Run linters for all projects
make test         # Run tests for all projects
make typegen      # Generate TypeScript types from OpenAPI

# Cleanup
make clean        # Stop all services and clean up
```

## 🎯 Next Steps

- Read the [Architecture Guide](./architecture.md) to understand the system design
- Check the [Development Guide](./development.md) for workflow and best practices
- See the [Deployment Guide](./deployment.md) when you're ready to deploy
- Review the [Roadmap](./roadmap.md) for planned features

## 🆘 Getting Help

- Check the issue tracker for known issues
- Review the CLAUDE.md file for AI assistant guidelines
- Read the source code - it's designed to be simple and legible

## 📝 License

See the LICENSE file in the repository root.
