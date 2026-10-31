import { seed } from "../../scripts/seed";

/**
 * Make sure the e2e database is migrated. Same throwaway file as the
 * webServer in playwright.config.ts (`data/e2e.db` unless overridden). There
 * is no seeded account: each test signs in with its own fresh email, which
 * creates a user and a personal team, so tests never share state.
 */
async function globalSetup() {
  process.env.DATABASE_URL ??= "file:./data/e2e.db";
  await seed();
}

export default globalSetup;
