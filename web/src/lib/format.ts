// Formatting: relative time, compact counts, URL display.

export function relTime(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return 'never';
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function compact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return String(Math.round(n * 10) / 10);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Full timestamp for tooltips. */
export function fullTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** "Oct 12" (or "Oct 12, 2026" when `withYear`) from a YYYY-MM-DD day key. */
export function dayLabel(day: string, withYear = false): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

/** Host without www. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Path + query, decoded, for display inside a site; "/" for the homepage. */
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    const raw = `${u.pathname}${u.search}`;
    try { return decodeURI(raw); } catch { return raw; }
  } catch {
    return url;
  }
}

/** URL for display: strips protocol and www, keeps path. */
export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return hostOf(url) + (u.pathname === '/' && !u.search ? '' : pathOf(url));
  } catch {
    return url;
  }
}

/** Whether a URL belongs to the site's domain (so we can show just the path). */
export function isOnSite(url: string, domain: string): boolean {
  return hostOf(url) === domain.replace(/^www\./, '');
}

/** The one-line label for a URL in site context: path when on-site, host+path otherwise. */
export function urlLabel(url: string, domain: string): string {
  return isOnSite(url, domain) ? pathOf(url) : prettyUrl(url);
}

export function digestLabel(minutes: number): string {
  if (minutes >= 1440) return 'daily';
  if (minutes >= 60) return minutes % 60 === 0 ? `every ${minutes / 60}h` : `every ${minutes}m`;
  return `every ${minutes}m`;
}
