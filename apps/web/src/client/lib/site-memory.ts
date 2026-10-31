// Remember the last-visited site so /app and team pages can open it directly.
const KEY = "f404:last-site";

export function getLastSiteId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastSiteId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode etc. */
  }
}

export function clearLastSiteId(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
