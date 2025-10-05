# Refactor Prompt

## Objective
Improve internal structure without changing observable behaviour.

## Steps
1. Capture the current behavior with tests (unit or integration) if missing.
2. Outline the refactor scope—files, modules, patterns.
3. Apply small, verifiable changes; keep commits focused.
4. Run `uv run pytest`, `pnpm test`, and both linters after each milestone.
5. Confirm that API contracts and generated types remain untouched unless explicitly requested.

## Constraints
- Do not rename public endpoints or HTTP payloads without approval.
- Avoid speculative abstractions; keep the code easy to follow.
- Ensure migration history remains linear and valid (`alembic upgrade head`).
