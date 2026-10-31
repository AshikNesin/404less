// Tiny fetch wrapper for the 404less API (/api/v1, bare JSON responses).
// Throws an Error with `.status` on non-2xx; a 401 anywhere in the app means
// the session is gone: the shell's session store drops the user and
// <ProtectedRoute> sends them to /app/login.
import { useAuthStore } from "@groot/shell/store/auth";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const headers = new Headers(opts?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401 && !path.startsWith("/api/v1/auth")) {
    // the session is gone: <ProtectedRoute> switches to the sign-in page; the
    // request still settles so React Query never holds a pending fetch
    useAuthStore.getState().clearAuth();
    throw new ApiError("Your session has ended. Sign in again.", 401, {});
  }
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    // not JSON (a proxy or platform error page): never hand that page to the UI
    const message = res.ok
      ? `Unexpected response from ${path}`
      : res.statusText || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, {});
  }
  if (!res.ok)
    throw new ApiError((body as { error?: string }).error ?? res.statusText, res.status, body);
  return body as T;
}

export const json = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});
export const patch = (body: unknown): RequestInit => ({
  method: "PATCH",
  body: JSON.stringify(body),
});
