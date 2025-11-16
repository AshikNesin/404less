.PHONY: db client server website migrate seed typegen lint test dev dev-client build clean

ENV_FILE ?= server/.env

# Database
db:
	docker compose -f server/compose.yml --env-file $(ENV_FILE) up -d postgres

# Individual services
client:
	cd client && pnpm install && pnpm dev

server:
	cd server && uv sync && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 9000

website:
	cd website && pnpm install && pnpm dev

# Database operations
migrate:
	cd server && UV_PROJECT_ENV=$(PWD)/server/.venv uv run alembic upgrade head

seed:
	cd server && UV_PROJECT_ENV=$(PWD)/server/.venv uv run python -m app.db.init_db

# Type generation
typegen:
	cd client && pnpm typegen

# Build client for production
build:
	cd client && pnpm install && pnpm build

# Code quality
lint:
	cd client && pnpm lint
	cd server && uv run ruff check .
	cd website && pnpm lint

# Testing
test:
	cd client && pnpm test
	cd server && uv run pytest

# Development - runs server (which proxies to Vite) + client dev server
dev: db
	./scripts/dev.sh

# Development - run client dev server only (frontend developer workflow)
dev-client:
	cd client && pnpm install && pnpm dev

# Cleanup
clean:
	docker compose -f server/compose.yml down
	rm -rf server/.venv server/static
	rm -rf client/node_modules
	rm -rf website/node_modules
