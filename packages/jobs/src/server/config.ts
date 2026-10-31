import { config } from "@groot/core/config";

/** Defaults applied by `addJob()`; read lazily so app config overrides apply. */
export function defaultJobOptions() {
  return {
    retryLimit: config.jobs.retryLimit,
    retryDelaySeconds: config.jobs.retryDelaySeconds,
    priority: 0,
  };
}
