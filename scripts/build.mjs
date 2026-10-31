import esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Bundle the Node server entry to dist/server/bundle.js. Workspace packages
 * are inlined; npm dependencies stay external and are installed on the host
 * (`pnpm install --prod`). `pnpm check:closure` verifies every external import
 * is a declared root dependency. The client is built separately by Vite into
 * dist/client, and the Workers bundle by wrangler.
 */

/** Never bundled, whatever the manifest says. */
export const externalPackages = [
  "better-sqlite3",
  "vite",
  "vite-plus",
  "@vitejs/plugin-react",
  "lightningcss",
  "fsevents",
];

export function esbuildOptions({ externals, plugins }) {
  return {
    entryPoints: ["apps/web/src/server/entry.node.ts"],
    outfile: "dist/server/bundle.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: [...externals, ...externalPackages],
    plugins,
    alias: {
      "@groot/core": path.resolve(process.cwd(), "packages/core/src"),
      "@groot/jobs/server": path.resolve(process.cwd(), "packages/jobs/src/server"),
    },
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module";const require = __createRequire(import.meta.url);',
    },
    sourcemap: true,
    tsconfig: "tsconfig.json",
    logLevel: "info",
    metafile: true,
  };
}

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

function getSentryRelease() {
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE;
  const sourceVersion = process.env.SOURCE_COMMIT || process.env.SOURCE_VERSION;
  if (sourceVersion) return `${pkg.name}@${sourceVersion.slice(0, 7)}`;
  try {
    return `${pkg.name}@${execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim().slice(0, 7)}`;
  } catch {
    return undefined;
  }
}

async function build() {
  const externals = Object.keys(pkg.dependencies || {});
  const release = getSentryRelease();
  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const plugins =
    release && authToken && process.env.SENTRY_ORG
      ? [
          sentryEsbuildPlugin({
            authToken,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT || pkg.name,
            release: { name: release },
            sourcemaps: { filesToDeleteAfterUpload: ["dist/server/*.map"] },
          }),
        ]
      : [];

  const options = esbuildOptions({ externals, plugins });
  // Bake the release into the bundle so Sentry events match the uploaded maps.
  if (release) options.define = { "process.env.SENTRY_RELEASE": JSON.stringify(release) };
  const result = await esbuild.build(options);

  await fs.mkdir("tmp", { recursive: true });
  await fs.writeFile("tmp/metafile.json", JSON.stringify(result.metafile));

  // Migrations travel with the server bundle so `node dist/server/bundle.js`
  // can migrate on boot without the source tree.
  await fs.rm("dist/server/drizzle", { recursive: true, force: true });
  await fs.cp("apps/web/drizzle", "dist/server/drizzle", { recursive: true });
  console.log("✓ Server bundle written to dist/server/bundle.js (+ drizzle migrations)");
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
