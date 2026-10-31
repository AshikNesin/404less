/**
 * `cloudflare:workers` for the Durable Objects. @cloudflare/workers-types only
 * declares it in its global-script entry, which would also load every Workers
 * global into a program that runs on Node too; this declares just the base
 * class the DOs extend, typed with the module-form workers types.
 */
declare module "cloudflare:workers" {
  import type { DurableObjectState } from "@cloudflare/workers-types";

  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}
