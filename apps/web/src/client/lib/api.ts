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
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (res.status === 401 && !path.startsWith("/api/v1/auth")) {
    useAuthStore.getState().clearAuth();
    await new Promise(() => {}); // the app is switching to the sign-in page
  }
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
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
