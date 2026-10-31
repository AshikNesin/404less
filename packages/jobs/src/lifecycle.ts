/**
 * The job state machine: which states a job moves through and which operator
 * action is allowed from which state. Shared by the queue (server) and the
 * dashboard (client), so it stays free of database, HTTP and React imports.
 */

export const JOB_STATES = {
  CREATED: "created",
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type JobState = (typeof JOB_STATES)[keyof typeof JOB_STATES];

export const VALID_JOB_STATES: readonly JobState[] = Object.values(JOB_STATES);

export function isValidJobState(state: string): state is JobState {
  return (VALID_JOB_STATES as readonly string[]).includes(state);
}

/** States the tick never moves a job out of. */
export function isTerminalJobState(state: JobState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}

export type JobAction = "retry" | "rerun" | "resume" | "cancel" | "delete";

/**
 * The states each action is allowed from, in display order.
 *
 * - retry: failed/cancelled → created, error cleared
 * - rerun: queue a fresh copy of a finished job (the original is untouched)
 * - resume: cancelled → created
 * - cancel: created/active → cancelled
 * - delete: any state
 */
export const JOB_ACTIONS: Readonly<Record<JobAction, readonly JobState[]>> = {
  retry: ["failed", "cancelled"],
  rerun: ["completed", "failed"],
  resume: ["cancelled"],
  cancel: ["created", "active"],
  delete: VALID_JOB_STATES,
};

export function canApplyJobAction(action: JobAction, state: JobState): boolean {
  return JOB_ACTIONS[action].includes(state);
}

/** Actions allowed for a job in `state`, in display order. */
export function allowedJobActions(state: JobState): JobAction[] {
  return (Object.keys(JOB_ACTIONS) as JobAction[]).filter((action) =>
    canApplyJobAction(action, state),
  );
}
