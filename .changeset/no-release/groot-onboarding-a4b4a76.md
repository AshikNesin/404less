# No release: 404less onboarded onto groot a4b4a76

The groot kit (`packages/*`, `.groot/`) is imported as-is from groot
a4b4a76, plus the `openCorsPaths` option in `packages/core/src/app.ts`, which
was made in groot first (changeset `open-cors-paths.md` there) and copied here
without divergence. `apps/web/drizzle` carries 404less's pre-groot migrations
0001–0007 (statement breakpoints added, names unchanged so production's
`d1_migrations` rows still match) plus the generated `0008_core_kv.sql`.
404less releases only the app; kit changes ride the next `pnpm groot:sync`.
