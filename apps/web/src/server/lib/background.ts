import type { Context } from "hono";

/**
 * Keep work running after the response: `executionCtx.waitUntil` on Workers;
 * on Node (no execution context) the promise simply runs on, errors logged.
 */
export function waitUntil(c: Context, promise: Promise<unknown>): void {
  let ctx: { waitUntil(p: Promise<unknown>): void } | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined; // Hono throws when the runtime passed no execution context
  }
  if (ctx) ctx.waitUntil(promise);
  else promise.catch((error: unknown) => console.error("background task failed", error));
}
