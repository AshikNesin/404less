.PHONY: db client server website migrate seed typegen lint test dev dev-all clean

ENV_FILE ?= server/.env

# Database
db:
	docker compose -f server/compose.yml --env-file $(ENV_FILE) up -d postgres

# Individual services
client:
	cd client && pnpm install && pnpm dev

server:
	cd server && uv sync && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 9001

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

# Code quality
lint:
	cd client && pnpm lint
	cd server && uv run ruff check .
	cd website && pnpm lint

# Testing
test:
	cd client && pnpm test
	cd server && uv run pytest

# Development (client + server)
dev: db
	./scripts/dev.sh

# Development (all services: client + server + website)
dev-all: db
	./scripts/dev.sh --all

# Cleanup
clean:
	docker compose -f server/compose.yml down
	rm -rf server/.venv
	rm -rf client/node_modules
	rm -rf website/node_modules
