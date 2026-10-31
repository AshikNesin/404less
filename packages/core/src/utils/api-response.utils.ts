import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppContext } from "../types";

/** The JSON envelope every API response uses. The client unwraps `data`. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: { code: string; message: string; details?: unknown };
  metadata?: { page?: number; limit?: number; total?: number; totalPages?: number };
}

export function ok<T>(c: AppContext, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ success: true, data } satisfies ApiResponse<T>, status);
}

export function noContent(c: AppContext) {
  return c.body(null, 204);
}

export function fail(
  c: AppContext,
  error: { code: string; message: string; details?: unknown },
  status: ContentfulStatusCode,
) {
  return c.json({ success: false, error } satisfies ApiResponse, status);
}
