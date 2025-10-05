# AI Agent Rules (Cursor, Copilot, Etc.)

## Objectives
- Preserve the tiny, legible monorepo layout described in `PRD.md`.
- Keep dependencies minimal; prefer standard library utilities before adding new packages.
- Any new tool or major dependency must be justified in PR descriptions and isolated to the smallest possible change set.

## Do
- Read `PRD.md`, `Makefile`, and relevant READMEs before modifying code.
- Follow existing patterns: FastAPI + SQLAlchemy on the backend, React + Tailwind + shadcn/ui on the frontend.
- When APIs change, update FastAPI schemas, Alembic migrations, and regenerate TypeScript types via `pnpm typegen`.
- Format and lint with `uv run ruff check .` (backend) and `pnpm lint` (frontend).
- Keep diffs focused with accompanying tests.
- Use the Vite proxy (`/api/*`) for frontend API calls—avoid hardcoding alternate origins.

## Don't
- Restructure the monorepo or introduce alternative frameworks without explicit approval.
- Add new state managers, UI kits, or build tooling beyond what the PRD lists.
- Commit secrets or modify tracked `.env` files—extend `.env.example` instead.
- Generate large, opaque helper modules; prefer small, readable utilities.

## Prompt Templates
- `ai/prompts/feature.md` — Ship a new feature end-to-end (API, migrations, types, UI, tests).
- `ai/prompts/refactor.md` — Safely refactor existing logic without altering behavior.
- `ai/prompts/bugfix.md` — Reproduce, test, and patch bugs with minimal surface area.

## Commit Policy
- Use short conventional commits (e.g., `feat: add dueAt to todos`).
- Document tests run and type generation steps in PR descriptions.
- Ensure `alembic upgrade head` runs clean locally whenever migrations change.
