// Tests run inside workerd (the real Workers runtime) via Miniflare — fully
// local: no Cloudflare account, no deploy, no traffic to the edge.
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
      return {
        main: './src/index.ts',
        singleWorker: true,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            MAX_SITES_PER_TEAM: '2', // tighten quota for tests
            TEST_MIGRATIONS: migrations as unknown as string,
            DEV_MAILER: '1', // log-only mailer: keeps devLink in magic-link responses
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
  },
});
