import { describe, expect, it } from "vite-plus/test";
import { buildRules, productRule } from "../../apps/web/src/shared/redirect-rules";

describe("productRule", () => {
  it("keeps the dashboard snippet wording", () => {
    expect(productRule("redirects", "/docs/a", "/docs/b")).toBe(
      "# _redirects (Cloudflare Pages / Netlify)\n/docs/a  /docs/b  301",
    );
    expect(productRule("vercel", "/docs/a", "/docs/b")).toBe(
      JSON.stringify(
        { redirects: [{ source: "/docs/a", destination: "/docs/b", permanent: true }] },
        null,
        2,
      ),
    );
    expect(productRule("nginx", "/docs/a", "/docs/b")).toBe(
      "location = /docs/a {\n  return 301 /docs/b;\n}",
    );
    expect(productRule("apache", "/docs/a", "/docs/b")).toBe(
      "# .htaccess\nRedirect 301 /docs/a /docs/b",
    );
    expect(productRule("nextjs", "/docs/a", "/docs/b")).toContain("permanent: true");
  });
});

describe("buildRules", () => {
  it("reads pairs, arrows and csv", () => {
    const pairs = buildRules("/old /new\n/a → /b 302");
    expect(pairs.pairs.map((p) => [p.from, p.to, p.status])).toEqual([
      ["/old", "/new", 301],
      ["/a", "/b", 302],
    ]);
    const csv = buildRules('source,destination,status\n"/docs,v1","/docs",301\n/blog,/news,302');
    expect(csv.detected).toBe("csv");
    expect(csv.pairs.map((p) => [p.from, p.to, p.status])).toEqual([
      ["/docs,v1", "/docs", 301],
      ["/blog", "/news", 302],
    ]);
  });

  it("turns same-host absolute URLs into paths and keeps external destinations", () => {
    const built = buildRules(
      "https://docs.example.com/guide/old https://docs.example.com/guide/new\n/leave https://other.example/now",
    );
    expect(built.pairs.map((p) => [p.from, p.to])).toEqual([
      ["/guide/old", "/guide/new"],
      ["/leave", "https://other.example/now"],
    ]);
  });

  it("converts Netlify splats to vercel.json and back", () => {
    const netlify = "/home / 301\n/blog/* /news/:splat 301\n/old /new 301!\n";
    const built = buildRules(netlify);
    expect(built.detected).toBe("netlify");
    expect(built.rules.vercel).toContain('"/blog/:path*"');
    expect(built.rules.vercel).toContain('"/news/:path*"');
    expect(built.rules.vercel).toContain('"statusCode": 301');
    expect(built.rules.redirects).toContain("/blog/*  /news/:splat  301");
    expect(built.rules.redirects).toContain("/old  /new  301!");
    expect(built.rules.nginx).toContain("location ~ ^/blog/(.*)$");
    expect(built.rules.nginx).toContain("return 301 /news/$1$is_args$args;");
    expect(built.rules.apache).toContain("RedirectMatch 301 ^/blog/(.*)$ /news/$1");
    expect(built.rules.apache).not.toContain("\nRedirect 301 ");
    expect(built.rules.nextjs).toContain("statusCode: 301");
    expect(built.rules.nextjs).not.toMatch(/permanent:\s*true\s*[,}]/);

    const round = buildRules(built.rules.vercel);
    expect(round.detected).toBe("vercel");
    const norm = (pairs: { from: string; to: string; status: number }[]) =>
      pairs.map((p) => [toComparable(p.from), toComparable(p.to), p.status]);
    expect(norm(round.pairs)).toEqual(norm(built.pairs));
    expect(round.rules.redirects).toContain("/blog/*  /news/:splat  301");
  });

  it("reads permanent: true as 308 and keeps an explicit 301", () => {
    const built = buildRules(
      JSON.stringify({
        redirects: [
          { source: "/a", destination: "/b", permanent: true },
          { source: "/c", destination: "/d", statusCode: 301 },
          { source: "/e/:path*", destination: "/f/:path*", statusCode: 302 },
        ],
      }),
    );
    expect(built.pairs.map((p) => p.status)).toEqual([308, 301, 302]);
    expect(built.issues.some((i) => i.code === "permanent-is-308")).toBe(true);
    expect(built.rules.redirects).toContain("/e/*  /f/:splat  302");
  });

  it("flags a splat that shadows a later rule, and not one that comes last", () => {
    const bad = buildRules("/blog/* /news/:splat 301\n/blog/post /blog/story 301\n");
    expect(bad.issues.some((i) => i.code === "shadowed")).toBe(true);
    const good = buildRules("/blog/post /blog/story 301\n/blog/* /news/:splat 301\n");
    expect(good.issues.some((i) => i.code === "shadowed")).toBe(false);
  });

  it("flags a splat that drops the captured path", () => {
    const built = buildRules("/docs/* /docs 301\n");
    expect(built.issues.some((i) => i.code === "splat-dropped")).toBe(true);
  });

  it("flags trailing-slash mismatches, slash loops and self-redirects", () => {
    const mismatch = buildRules("/about /about/ 301\n");
    expect(mismatch.issues.some((i) => i.code === "slash-mismatch")).toBe(true);
    expect(mismatch.issues.some((i) => i.code === "trailing-slash")).toBe(true);
    const loop = buildRules("/about /about/ 301\n/about/ /about 301\n");
    expect(loop.issues.some((i) => i.code === "slash-loop")).toBe(true);
    const self = buildRules("/about /about 301\n");
    expect(self.issues.some((i) => i.code === "loop")).toBe(true);
  });

  it("treats 200 as a rewrite and keeps the force flag as Pages-only", () => {
    const built = buildRules("/docs /docs/index.html 200\n/old /new 301!\n/* /index.html 200\n");
    expect(built.issues.some((i) => i.code === "rewrite")).toBe(true);
    expect(built.rules.vercel).toContain('"rewrites"');
    expect(built.rules.vercel).not.toContain('"statusCode": 200');
    expect(built.rules.redirects).toContain("/docs  /docs/index.html  200");
    expect(
      built.issues.some((i) => i.code === "force" || built.notes.some((n) => n.includes("force"))),
    ).toBe(true);
    // /* is last, so it does not shadow /docs. Putting it first would.
    const first = buildRules("/* /index.html 200\n/docs /docs/index.html 200\n");
    expect(first.issues.some((i) => i.code === "shadowed")).toBe(true);
  });

  it("rejects an empty paste", () => {
    expect(buildRules("  \n# just a comment\n").issues[0].code).toBe("empty");
    expect(buildRules("{").issues[0].code).toBe("json");
  });
});

function toComparable(path: string): string {
  return path.replace(/:path\*/g, "*").replace(/:splat\b/g, "*");
}
