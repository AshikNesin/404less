/**
 * Shared job-page constants + types. Kept out of the component files so those
 * files only export components (react-doctor/only-export-components).
 */

import type { JobAction, JobState } from "./types";
import { Play, RefreshCw, Trash2, X, type LucideIcon } from "lucide-react";

export type StateTab = "all" | JobState;

export const JOBS_PAGE_SIZE = 50;

export const STATE_TABS: { value: StateTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "created", label: "Created" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIMARY_TABS: StateTab[] = ["all", "active", "failed", "completed"];

export const primaryOptions = STATE_TABS.filter((t) => PRIMARY_TABS.includes(t.value));
export const secondaryOptions = STATE_TABS.filter((t) => !PRIMARY_TABS.includes(t.value));

/** Human-readable, capitalized label for a job state (e.g. "Active", "Failed"). */
export function stateLabel(state: string): string {
  return STATE_TABS.find((t) => t.value === state)?.label ?? state;
}

/** Label, icon and tone for each lifecycle action button / menu item. */
export const JOB_ACTION_UI: Record<
  JobAction,
  { label: string; icon: LucideIcon; destructive?: boolean }
> = {
  retry: { label: "Retry", icon: RefreshCw },
  rerun: { label: "Re-run", icon: Play },
  resume: { label: "Resume", icon: Play },
  cancel: { label: "Cancel", icon: X },
  delete: { label: "Delete", icon: Trash2, destructive: true },
};

/** Patch shape for the URL-synced query params (matches the nuqs setter). */
export type JobsQueryPatch = Partial<{
  state: string;
  queue: string;
  search: string;
  page: number;
  startDate: string | null;
  endDate: string | null;
  datePreset: string;
}>;
