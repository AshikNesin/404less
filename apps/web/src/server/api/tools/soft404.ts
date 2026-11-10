// A soft 404 is a missing URL that still returns 200 (or the same page as a
// real one). Search Console drops it from the index and reports "Soft 404".
import { pageTitle } from "../crawl/html";
import { NOT_FOUND_TITLE } from "../../lib/not-found-title";
import { followHops, type Hop } from "./chain";
import { ToolInputError, assertPublicUrl } from "./ssrf";

export type PageSnapshot = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  title: string | null;
  noindex: boolean;
  text: string;
  bytes: number;
  error: string | null;
  hops: { url: string; status: number }[];
};

export type SoftVerdict = "real-404" | "soft-404" | "ok" | "redirect" | "error";

export type SoftReport = {
  verdict: SoftVerdict;
  summary: string;
  hostReturns200ForMissing: boolean;
  target: PageSnapshot;
  probe: PageSnapshot;
};

export async function checkSoft404(targetRaw: string, missingPath?: string): Promise<SoftReport> {
  const targetUrl = await assertPublicUrl(targetRaw);
  const probe = probeUrl(targetUrl, missingPath);
  const [target, missing] = await Promise.all([
    inspect(targetUrl.toString()),
    inspect(probe.toString()),
  ]);
  const judged = classifySoft404(target, missing);
  return { ...judged, target, probe: missing };
}

export function classifySoft404(
  target: PageSnapshot,
  probe: PageSnapshot,
): Pick<SoftReport, "verdict" | "summary" | "hostReturns200ForMissing"> {
  const hostReturns200ForMissing = probe.status === 200;
  if (target.status === 0) {
    return {
      verdict: "error",
      hostReturns200ForMissing,
      summary: target.error ?? "The URL could not be fetched.",
    };
  }
  if (target.status === 404 || target.status === 410) {
    const extra = hostReturns200ForMissing
      ? " A random path on this host still returns 200, so other missing URLs may be soft 404s."
      : "";
    return {
      verdict: "real-404",
      hostReturns200ForMissing,
      summary: `This URL returns ${target.status}. That is a real ${target.status === 410 ? "410 Gone" : "404"}, which is what Search Console expects for a page that is not there.${extra}`,
    };
  }
  if (target.status >= 500) {
    return {
      verdict: "error",
      hostReturns200ForMissing,
      summary: `This URL returns ${target.status}, so it failed rather than saying the page is missing.`,
    };
  }
  if (target.status >= 300 && target.status < 400) {
    return {
      verdict: "redirect",
      hostReturns200ForMissing,
      summary: `This URL is still redirecting (status ${target.status}) when the check stops. A 301 should land on a real page in one hop.`,
    };
  }

  const targetMissing = looksMissing(target);
  const probeMissing = looksMissing(probe);
  const same = sameDocument(target, probe);

  if (target.status === 200 && (probe.status === 404 || probe.status === 410)) {
    if (targetMissing) {
      return {
        verdict: "soft-404",
        hostReturns200ForMissing: false,
        summary:
          "This URL returns 200, but the page says it is missing. Search Console calls that a soft 404 and drops the URL. Return 404 or 410 instead.",
      };
    }
    return {
      verdict: "ok",
      hostReturns200ForMissing: false,
      summary: `This URL returns 200, and a path that does not exist returns ${probe.status}. This one looks like a real page.`,
    };
  }

  if (same && (probe.status === 200 || probe.finalUrl === target.finalUrl)) {
    return {
      verdict: "soft-404",
      hostReturns200ForMissing,
      summary: `A URL that does not exist (${probe.requestedUrl}) ends at the same ${probe.status} response as this one. Google treats that as a soft 404: the host never says the page is gone. Return 404 or 410 for unknown paths, and use a 301 only when there is a real replacement.`,
    };
  }

  if (target.status === 200 && targetMissing) {
    return {
      verdict: "soft-404",
      hostReturns200ForMissing,
      summary:
        "This URL returns 200, but its title or body says the page is not found. That is the Search Console soft-404 warning. Serve a real 404 status (the body can still be a helpful page).",
    };
  }

  if (target.hops.length > 1 && target.status === 200 && probe.status === 404) {
    return {
      verdict: "redirect",
      hostReturns200ForMissing: false,
      summary: `This URL redirects to ${target.finalUrl}, which returns 200. It is not a 404. A missing path on the same host returns ${probe.status}.`,
    };
  }

  if (hostReturns200ForMissing && !probeMissing && !same) {
    return {
      verdict: "ok",
      hostReturns200ForMissing: true,
      summary:
        "This URL returns 200 and looks different from a random missing path, which also returns 200. If that random path should not exist, the host is still soft-404ing unknown URLs even though this page looks real.",
    };
  }

  if (hostReturns200ForMissing && !targetMissing) {
    return {
      verdict: "ok",
      hostReturns200ForMissing: true,
      summary:
        "This URL looks like a real page, but a path that does not exist also returns 200. Search Console will flag those unknown URLs as soft 404s. Unknown paths should return 404 or 410.",
    };
  }

  if (hostReturns200ForMissing) {
    return {
      verdict: "soft-404",
      hostReturns200ForMissing: true,
      summary:
        "A path that does not exist returns 200. Search Console will flag those URLs as soft 404s. Unknown paths should return 404 or 410.",
    };
  }

  return {
    verdict: target.status >= 200 && target.status < 300 ? "ok" : "error",
    hostReturns200ForMissing,
    summary: `This URL returns ${target.status}. A missing path returns ${probe.status || "nothing"}.`,
  };
}

async function inspect(url: string): Promise<PageSnapshot> {
  const followed = await followHops(url, { readBody: true, maxHops: 5, timeoutMs: 8_000 });
  return {
    requestedUrl: url,
    finalUrl: followed.finalUrl,
    status: followed.status,
    title: pageTitle(followed.body),
    noindex: hasNoindex(followed.body),
    text: textOf(followed.body),
    bytes: followed.body.length,
    error: followed.error,
    hops: followed.hops.map((hop: Hop) => ({ url: hop.url, status: hop.status })),
  };
}

function probeUrl(base: URL, missingPath?: string): URL {
  if (!missingPath) return new URL(`/404less-probe-${crypto.randomUUID()}`, base.origin);
  if (
    !missingPath.startsWith("/") ||
    missingPath.startsWith("//") ||
    missingPath.includes("\\") ||
    missingPath.includes("://")
  ) {
    throw new ToolInputError("The missing path has to start with / and stay on this host.");
  }
  const url = new URL(missingPath, base.origin);
  if (url.origin !== base.origin) {
    throw new ToolInputError("The missing path has to stay on this host.");
  }
  return url;
}

function looksMissing(page: PageSnapshot): boolean {
  return NOT_FOUND_TITLE.test(`${page.title ?? ""} ${page.text.slice(0, 500)}`);
}

function sameDocument(a: PageSnapshot, b: PageSnapshot): boolean {
  if (a.finalUrl === b.finalUrl && a.status === b.status && a.status !== 0) return true;
  if (a.text && a.text === b.text) return true;
  if (a.title && a.title === b.title && a.bytes > 200 && b.bytes > 200) {
    const ratio = a.bytes / b.bytes;
    if (ratio > 0.85 && ratio < 1.18) return true;
  }
  return false;
}

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 800);
}

function hasNoindex(html: string): boolean {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags.some(
    (tag) => /(?:name|http-equiv)\s*=\s*["']robots["']/i.test(tag) && /noindex/i.test(tag),
  );
}
