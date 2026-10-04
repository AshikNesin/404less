// Tiny fetch wrapper for the 404less API.
export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    ...opts,
  });
  if (res.status === 401 && !path.startsWith('/auth')) {
    window.location.href = '/';
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error((body as { error?: string }).error ?? res.statusText), { status: res.status, body });
  return body as T;
}
