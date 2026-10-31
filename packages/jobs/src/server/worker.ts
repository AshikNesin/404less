import { logger } from "@groot/core/logger";
import { config } from "@groot/core/config";
import type { JobHandler } from "./types";
import { runTick, tickInFlight } from "./tick";

/**
 * Handler registry plus the Node polling driver. Workers do not call
 * `startWorkers()`; their cron trigger calls `runTick()` directly.
 */
const handlers = new Map<string, JobHandler>();
let timer: ReturnType<typeof setInterval> | null = null;

export function registerJobHandler<T, R = unknown>(name: string, handler: JobHandler<T, R>): void {
  handlers.set(name, handler as JobHandler);
  logger.debug({ jobName: name }, "Job handler registered");
}

export function getRegisteredHandlers(): string[] {
  return [...handlers.keys()];
}

export function getJobHandler(name: string): JobHandler | undefined {
  return handlers.get(name);
}

/** Test helper. */
export function clearJobHandlers(): void {
  handlers.clear();
}

/**
 * Start polling the queue (Node). Handlers must be registered first; with none
 * registered this logs an error and returns, which is only right for a process
 * that enqueues but never runs jobs.
 */
export async function startWorkers(): Promise<void> {
  if (timer) {
    logger.warn("Job workers already running");
    return;
  }
  if (handlers.size === 0) {
    logger.error(
      "No job handlers registered — workers NOT started. Register handlers (startWebApp() does) before startWorkers().",
    );
    return;
  }

  const intervalMs = config.jobs.pollIntervalSeconds * 1000;
  timer = setInterval(() => void runTick(), intervalMs);
  // Do not keep the process alive for the poller alone.
  if (typeof timer === "object" && "unref" in timer) timer.unref();

  await runTick();
  logger.info({ workerCount: handlers.size, intervalMs }, "Job workers started");
}

export async function stopWorkers(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  await tickInFlight();
}
