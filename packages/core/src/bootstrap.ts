import { loadEnv, type Env, type EnvSource } from "./env";
import { setConfig, config, type ConfigOverrides } from "./config";
import { configureLogger } from "./logger";
import { setDb, type Database } from "./database";
import { setStorageAdapter } from "./storage/storage";
import type { StorageAdapter } from "./storage/adapter";
import { setErrorReporter, type ErrorReporter } from "./errors";

export interface BootstrapOptions {
  /** `process.env` on Node, the bindings object on Workers. */
  env: EnvSource;
  /** App overrides from `defineConfig()`. */
  config?: ConfigOverrides;
  /** The database handle, or a factory that receives the validated env. */
  db: Database | ((env: Env) => Database);
  /**
   * Where uploads live, or a factory that receives the validated env:
   * `localStorage(uploadsRoot(env))` on Node, `r2Storage(env.STORAGE)` on Workers.
   */
  storage?: StorageAdapter | ((env: Env) => StorageAdapter);
  /** Where unexpected errors go (Sentry, ...). */
  reportError?: ErrorReporter;
}

/**
 * Wire the runtime-specific pieces into core, in dependency order: env →
 * config → logger → database → storage → error reporting. Call once per
 * process (Node) or once per isolate (Workers) before serving requests.
 */
export function bootstrap(options: BootstrapOptions): void {
  const env = loadEnv(options.env);
  setConfig(options.config);
  configureLogger({
    level: config.logging.level,
    pretty: env.NODE_ENV !== "production",
    base: { service: config.app.name.toLowerCase(), env: env.NODE_ENV },
  });
  setDb(typeof options.db === "function" ? options.db(env) : options.db);
  if (options.storage) {
    setStorageAdapter(
      typeof options.storage === "function" ? options.storage(env) : options.storage,
    );
  }
  if (options.reportError) setErrorReporter(options.reportError);
}
