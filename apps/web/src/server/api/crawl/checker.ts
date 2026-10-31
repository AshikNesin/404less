// URL checker: follows redirects manually to capture the chain, applies the
// site's status-code ignore list, and classifies ok/broken.
import type { SiteRow } from "../sites/sites.helpers";

export type CheckResult = {
  status: number;
  ok: boolean;
  redirectChain: { url: string; status: number }[] | null;
  finalUrl: string;
};

const UA = "404less-bot/0.1 (+https://404less.com)";
const MAX_REDIRECTS = 6;

function get(url: string): Promise<Response> {
  const attempt = () =>
    fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10_000),
    });
  // a dropped connection ("Network connection lost") is worth one fresh attempt; a timeout is not
  return attempt().catch((e: unknown) => {
    if (e instanceof Error && e.name === "TimeoutError") throw e;
    return attempt();
  });
}

/** Read and discard a body, up to 64 KB; a bigger one (an untrusted server's) is cancelled. */
async function drain(res: Response): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  for (let read = 0; read < 64 * 1024; ) {
    const { done, value } = await reader.read();
    if (done) return;
    read += value.byteLength;
  }
  await reader.cancel();
}

export async function checkUrl(
  rawUrl: string,
  site: Pick<SiteRow, "ignore_status_codes">,
): Promise<CheckResult> {
  let url = rawUrl;
  const chain: { url: string; status: number }[] = [];
  let status = 0;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await get(url);
    } catch {
      return {
        status: 0,
        ok: false,
        redirectChain: chain.length > 1 ? chain : null,
        finalUrl: url,
      };
    }
    status = res.status;
    chain.push({ url, status });
    // no body needed for classification. Redirect bodies are usually tiny and the next hop
    // reuses the connection: drain them (a cancelled body can leave it dead); cancel the rest.
    try {
      await (status >= 300 && status < 400 ? drain(res) : res.body?.cancel());
    } catch {}

    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      try {
        url = new URL(loc, url).toString();
      } catch {
        break;
      }
      continue; // follow
    }
    break; // terminal status
  }

  return {
    status,
    ok: isWorking(status, site),
    redirectChain: chain.length > 1 ? chain : null,
    finalUrl: url,
  };
}

/**
 * 2xx/3xx ok; 401/429 tolerated (auth walls / rate limits, not "broken");
 * codes the site chose to ignore are ok; everything else is broken.
 */
export function isWorking(status: number, site: Pick<SiteRow, "ignore_status_codes">): boolean {
  if ((status >= 200 && status < 400) || status === 401 || status === 429) return true;
  try {
    return (JSON.parse(site.ignore_status_codes ?? "[]") as number[]).includes(status);
  } catch {
    return false;
  }
}
