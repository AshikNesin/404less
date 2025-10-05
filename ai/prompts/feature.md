# Feature Delivery Prompt

## Goal
Implement the described feature end-to-end while preserving the repo conventions.

## Checklist
- [ ] Understand user story and confirm acceptance criteria.
- [ ] Update FastAPI models, schemas, routers, and Alembic migrations as needed.
- [ ] Run backend tests: `uv run pytest` and lint: `uv run ruff check .`.
- [ ] Regenerate frontend API types: `pnpm typegen`.
- [ ] Implement frontend changes with shadcn/ui components and Tailwind utilities.
- [ ] Add or update Vitest + Testing Library coverage.
- [ ] Ensure `pnpm lint` and `pnpm test` succeed.
- [ ] Document notable decisions in PR summary.

## Guardrails
- No new major dependencies without clear justification.
- Keep diffs scoped; avoid opportunistic refactors.
- Maintain accessibility by wiring labels, aria attributes, and keyboard support.
