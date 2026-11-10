// Follow redirects one hop at a time so each Location is checked before we request it.
import { assertPublicUrl, FetchBudgetSpent, readLimited, safeFetch, UnsafeUrlError } from "./ssrf";

export type Hop = { url: string; status: number; location: string | null };

export type FollowResult = {
  hops: Hop[];
  finalUrl: string;
  status: number;
  body: string;
  contentType: string;
  error: string | null;
  flags: string[];
};

export function redirectFlags(hops: { url: string; status: number }[]): string[] {
  const flags: string[] = [];
  const redirects = hops.filter((hop) => hop.status >= 300 && hop.status < 400).length;
  if (redirects >= 2) flags.push("chain");
  const urls = hops.map((hop) => hop.url);
  if (new Set(urls).size !== urls.length) flags.push("loop");
  const schemes = new Set(
    hops.map((hop) => {
      try {
        return new URL(hop.url).protocol;
      } catch {
        return "";
      }
    }),
  );
  if (schemes.has("http:") && schemes.has("https:")) flags.push("mixed-scheme");
  const last = hops[hops.length - 1];
  if (last && last.status >= 300 && last.status < 400 && hops.length >= 8) flags.push("too-long");
  return flags;
}

export function chainSummary(hops: Hop[], flags: string[]): string {
  if (!hops.length) return "No response.";
  const redirects = hops.filter((hop) => hop.status >= 300 && hop.status < 400).length;
  const last = hops[hops.length - 1];
  const bits = [
    `${hops.length} request${hops.length === 1 ? "" : "s"}`,
    `${redirects} redirect${redirects === 1 ? "" : "s"}`,
  ];
  if (flags.includes("loop")) bits.push("the chain repeats a URL");
  if (flags.includes("mixed-scheme")) bits.push("it switches between http and https");
  if (flags.includes("too-long")) bits.push("it was still redirecting when the check stopped");
  if (flags.includes("chain")) bits.push("more than one redirect (a chain)");
  const tail = last.status ? `final status ${last.status}` : "the host did not respond";
  return `${bits.join(", ")}. ${tail.charAt(0).toUpperCase()}${tail.slice(1)}.`;
}

export async function followHops(
  start: string,
  opts?: { readBody?: boolean; maxHops?: number; timeoutMs?: number },
): Promise<FollowResult> {
  const max = opts?.maxHops ?? 8;
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  let url = (await assertPublicUrl(start)).toString();
  const hops: Hop[] = [];
  const seen = new Set<string>();

  for (let i = 0; i <= max; i++) {
    if (seen.has(url)) {
      return done(hops, url, hops.at(-1)?.status ?? 0, "", "", null, ["loop"]);
    }
    seen.add(url);
    let res: Response;
    try {
      res = await safeFetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof FetchBudgetSpent) throw error;
      const message = error instanceof UnsafeUrlError ? error.message : "The host did not respond.";
      const flags = error instanceof UnsafeUrlError ? ["blocked"] : [];
      return done(hops, url, 0, "", "", message, flags);
    }
    const status = res.status;
    const location = res.headers.get("location");
    hops.push({ url, status, location });
    const redirecting = status >= 300 && status < 400 && location;
    if (!redirecting) {
      const body = opts?.readBody ? await readLimited(res, 96 * 1024) : "";
      if (!opts?.readBody) await res.body?.cancel().catch(() => {});
      return done(hops, url, status, body, res.headers.get("content-type") ?? "", null, []);
    }
    await res.body?.cancel().catch(() => {});
    try {
      url = new URL(location, url).toString();
    } catch {
      return done(hops, url, status, "", "", "The redirect Location is not a URL.", []);
    }
  }
  return done(hops, url, hops.at(-1)?.status ?? 0, "", "", null, ["too-long"]);
}

function done(
  hops: Hop[],
  finalUrl: string,
  status: number,
  body: string,
  contentType: string,
  error: string | null,
  extra: string[],
): FollowResult {
  const flags = [...new Set([...redirectFlags(hops), ...extra])];
  return { hops, finalUrl, status, body, contentType, error, flags };
}
