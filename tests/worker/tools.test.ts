// Public marketing tools: rule generation, SSRF refusals, and stubbed fetches.
import { SELF } from "cloudflare:test";
import { afterEach, describe, expect, test } from "vitest";
import { clearPublicHostCache } from "../../apps/web/src/server/api/tools/ssrf";
import { clearScanCache } from "../../apps/web/src/server/api/tools/scan";

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
  clearPublicHostCache();
  clearScanCache();
});

function installFetch(
  pages: Record<string, { status: number; body?: string; location?: string }>,
  dns: Record<string, string>,
) {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      const name = new URL(url).searchParams.get("name") ?? "";
      const type = new URL(url).searchParams.get("type");
      const ip = dns[name];
      if (!ip) return Response.json({ Status: 3 });
      if (type === "AAAA") return Response.json({ Status: 0, Answer: [] });
      return Response.json({ Status: 0, Answer: [{ type: 1, data: ip }] });
    }
    const page = pages[url];
    if (!page) return new Response("missing", { status: 404 });
    return new Response(page.body ?? "", {
      status: page.status,
      headers: page.location ? { location: page.location } : {},
    });
  }) as typeof fetch;
  restore = () => {
    globalThis.fetch = real;
  };
}

async function post(path: string, body: unknown, ip = "203.0.113.10") {
  const res = await SELF.fetch(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

describe.sequential("public tools", () => {
  test("generates rules and reports a shadowed splat", async () => {
    const { status, json } = await post("/api/tools/redirects", {
      input: "/blog/* /news/:splat 301\n/blog/post /news/post 301\n",
    });
    expect(status).toBe(200);
    const rules = json.rules as { vercel: string; apache: string };
    expect(rules.vercel).toContain('"statusCode": 301');
    expect(rules.vercel).toContain('"/blog/:path*"');
    expect(rules.apache).toContain("RedirectMatch 301");
    expect((json.issues as { code: string }[]).some((issue) => issue.code === "shadowed")).toBe(
      true,
    );
  });

  test("converts vercel.json permanent: true into an explicit 308", async () => {
    const { status, json } = await post(
      "/api/tools/redirects",
      {
        input: JSON.stringify({
          redirects: [{ source: "/old", destination: "/new", permanent: true }],
        }),
      },
      "203.0.113.11",
    );
    expect(status).toBe(200);
    expect(json.detected).toBe("vercel");
    expect((json.rules as { redirects: string }).redirects).toContain("/old  /new  308");
    expect(
      (json.issues as { code: string }[]).some((issue) => issue.code === "permanent-is-308"),
    ).toBe(true);
  });

  test("refuses private and non-public targets without fetching them", async () => {
    let fetched = 0;
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetched += 1;
      return new Response("nope", { status: 500 });
    }) as typeof fetch;
    restore = () => {
      globalThis.fetch = real;
    };
    for (const url of [
      "http://127.0.0.1/",
      "http://169.254.169.254/",
      "http://[::1]/",
      "http://example.internal/",
    ]) {
      const res = await post("/api/tools/redirect-chain", { url }, "203.0.113.12");
      expect(res.status, url).toBe(400);
    }
    expect(fetched).toBe(0);
  });

  test("refuses a hostname that resolves to a private address", async () => {
    installFetch({}, { "rebind.test": "10.0.0.8" });
    const { status, json } = await post(
      "/api/tools/redirect-chain",
      { url: "https://rebind.test/admin" },
      "203.0.113.13",
    );
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/public/i);
  });

  test("follows a redirect chain and flags mixed scheme and length", async () => {
    installFetch(
      {
        "https://chain.test/start": { status: 301, location: "http://chain.test/mid" },
        "http://chain.test/mid": { status: 302, location: "https://chain.test/end" },
        "https://chain.test/end": { status: 200, body: "done" },
      },
      { "chain.test": "93.184.216.34" },
    );
    const { status, json } = await post(
      "/api/tools/redirect-chain",
      { url: "https://chain.test/start" },
      "203.0.113.14",
    );
    expect(status).toBe(200);
    expect(json.flags).toEqual(expect.arrayContaining(["chain", "mixed-scheme"]));
    expect(json.hops).toEqual([
      { url: "https://chain.test/start", status: 301, location: "http://chain.test/mid" },
      { url: "http://chain.test/mid", status: 302, location: "https://chain.test/end" },
      { url: "https://chain.test/end", status: 200, location: null },
    ]);
  });

  test("stops on a redirect loop", async () => {
    installFetch(
      {
        "https://loop.test/a": { status: 301, location: "https://loop.test/b" },
        "https://loop.test/b": { status: 301, location: "https://loop.test/a" },
      },
      { "loop.test": "93.184.216.34" },
    );
    const { status, json } = await post(
      "/api/tools/redirect-chain",
      { url: "https://loop.test/a" },
      "203.0.113.15",
    );
    expect(status).toBe(200);
    expect(json.flags).toEqual(expect.arrayContaining(["loop"]));
    expect((json.hops as unknown[]).length).toBeLessThan(5);
  });

  test("distinguishes a real 404 from a soft 404", async () => {
    installFetch(
      {
        "https://hard.test/missing": { status: 404, body: "<title>Not found</title>" },
        "https://soft.test/app": {
          status: 200,
          body: "<title>App</title><main>the application shell is long enough to compare</main>",
        },
      },
      { "hard.test": "93.184.216.34", "soft.test": "93.184.216.34" },
    );
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://soft.test/")) {
        return new Response(
          "<title>App</title><main>the application shell is long enough to compare</main>",
          { status: 200 },
        );
      }
      if (url.startsWith("https://hard.test/") && !url.endsWith("/missing")) {
        return new Response("<title>Not found</title>", { status: 404 });
      }
      return realFetch(input, _init);
    }) as typeof fetch;

    const hard = await post(
      "/api/tools/soft-404",
      { url: "https://hard.test/missing" },
      "203.0.113.16",
    );
    expect(hard.status).toBe(200);
    expect(hard.json.verdict).toBe("real-404");

    const soft = await post(
      "/api/tools/soft-404",
      { url: "https://soft.test/app" },
      "203.0.113.17",
    );
    expect(soft.status).toBe(200);
    expect(soft.json.verdict).toBe("soft-404");
  });

  test("scans a few pages and lists a broken link", async () => {
    installFetch(
      {
        "https://scan.test/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /secret\n" },
        "https://scan.test/": {
          status: 200,
          body: '<title>Home</title><a href="/about">About</a><a href="/gone">Gone</a><a href="/secret">Secret</a>',
        },
        "https://scan.test/about": {
          status: 200,
          body: '<title>About</title><a href="/">Home</a>',
        },
        "https://scan.test/gone": { status: 404, body: "nope" },
      },
      { "scan.test": "93.184.216.34" },
    );
    const { status, json } = await post(
      "/api/tools/scan",
      { url: "https://scan.test/", maxPages: 10 },
      "203.0.113.18",
    );
    expect(status).toBe(200);
    const broken = json.broken as { url: string; status: number }[];
    expect(broken.some((row) => row.url === "https://scan.test/gone" && row.status === 404)).toBe(
      true,
    );
    const pages = json.pages as { url: string }[];
    expect(pages.map((row) => row.url)).not.toContain("https://scan.test/secret");
    expect((json.pagesFetched as number) >= 1).toBe(true);
  });

  test("tools answer any origin", async () => {
    const pre = await SELF.fetch("http://localhost/api/tools/redirects", {
      method: "OPTIONS",
      headers: {
        Origin: "https://customer.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("rate limits repeated chain checks", async () => {
    let status = 0;
    for (let i = 0; i < 21; i++) {
      const res = await post(
        "/api/tools/redirect-chain",
        { url: "http://127.0.0.1/" },
        "203.0.113.250",
      );
      status = res.status;
    }
    expect(status).toBe(429);
  });
});
