# Bugfix Prompt

## Process
1. Reproduce the bug locally; capture logs or failing tests.
2. Write a regression test that fails without the fix.
3. Implement the minimal change necessary to pass the new test.
4. Run full backend (`uv run pytest`, `uv run ruff check .`) and frontend (`pnpm test`, `pnpm lint`) suites.
5. Verify no new migrations are unintentionally generated.

## Do
- Keep fixes narrow and well-documented.
- Maintain DX expectations—hot reload, proxy behaviour, typing loop.

## Don't
- Introduce unrelated refactors or dependency upgrades.
- Change API responses unless mandated by the bug report.
