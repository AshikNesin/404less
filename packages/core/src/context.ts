import { AsyncLocalStorage } from "node:async_hooks";
import type { Breadcrumb } from "./logger";

/**
 * Per-request context, available anywhere in the call tree without threading
 * a parameter through. Backed by AsyncLocalStorage, which Workers provide
 * under the `nodejs_compat` flag.
 */
export interface RequestContext {
  requestId: string;
  startTime: number;
  breadcrumbs: Breadcrumb[];
  /** Extend the request's lifetime for background work (Workers `ctx.waitUntil`). */
  waitUntil?: (promise: Promise<unknown>) => void;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: Partial<RequestContext>, fn: () => T): T {
  return storage.run(
    {
      requestId: context.requestId ?? crypto.randomUUID(),
      startTime: context.startTime ?? Date.now(),
      breadcrumbs: context.breadcrumbs ?? [],
      waitUntil: context.waitUntil,
    },
    fn,
  );
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Run `promise` in the background. On Workers the request stays alive until it
 * settles; on Node it simply runs detached. Rejections are swallowed here, so
 * callers that care should catch and log inside the promise.
 */
export function waitUntil(promise: Promise<unknown>): void {
  const context = getRequestContext();
  if (context?.waitUntil) {
    context.waitUntil(promise);
    return;
  }
  void promise.catch(() => undefined);
}
