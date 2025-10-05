.PHONY: db fe be migrate seed typegen lint test dev clean

ENV_FILE ?= infra/.env

db:
	docker compose -f infra/compose.yml --env-file $(ENV_FILE) up -d postgres

fe:
	cd frontend && pnpm install && pnpm dev

be:
	cd backend && uv sync && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 9001

migrate:
	cd backend && UV_PROJECT_ENV=$(PWD)/backend/.venv uv run alembic upgrade head

seed:
	cd backend && UV_PROJECT_ENV=$(PWD)/backend/.venv uv run python -m app.db.init_db

typegen:
	cd frontend && pnpm typegen

lint:
	cd frontend && pnpm lint
	cd backend && uv run ruff check .

test:
	cd frontend && pnpm test
	cd backend && uv run pytest

dev: db
	./scripts/dev.sh

clean:
	docker compose -f infra/compose.yml down
	rm -rf backend/.venv
	rm -rf frontend/node_modules
