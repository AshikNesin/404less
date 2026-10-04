// URL checker: follows redirects manually to capture the chain, applies the
// site's status-code ignore list, and classifies ok/broken.
import type { SiteRow } from '../sites/helpers';

export type CheckResult = {
  status: number;
  ok: boolean;
  redirectChain: { url: string; status: number }[] | null;
  finalUrl: string;
};

const UA = '404less-bot/0.1 (+https://404less.dev)';
const MAX_REDIRECTS = 6;

export async function checkUrl(rawUrl: string, site: Pick<SiteRow, 'ignore_status_codes'>): Promise<CheckResult> {
  let url = rawUrl;
  const chain: { url: string; status: number }[] = [];
  let status = 0;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
    } catch {
      return { status: 0, ok: false, redirectChain: chain.length > 1 ? chain : null, finalUrl: url };
    }
    status = res.status;
    chain.push({ url, status });
    // no body needed for classification; consume/cancel to free the connection
    try { await res.body?.cancel(); } catch {}

    if (status >= 300 && status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      try { url = new URL(loc, url).toString(); } catch { break; }
      continue; // follow
    }
    break; // terminal status
  }

  let ignore = new Set<number>();
  try { ignore = new Set(JSON.parse(site.ignore_status_codes ?? '[]') as number[]); } catch {}

  // 2xx/3xx ok; 401/429 tolerated (auth walls / rate limits — not "broken");
  // codes the site chose to ignore are ok; everything else is broken.
  const isOk = (status >= 200 && status < 400) || status === 401 || status === 429 || ignore.has(status);
  return { status, ok: isOk, redirectChain: chain.length > 1 ? chain : null, finalUrl: url };
}
