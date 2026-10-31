// Unit tests for the suggestion engine + exclusion filters (pure functions,
// no worker needed, but they run inside workerd anyway via the same pool).
import { describe, expect, test } from "vitest";
import {
  rankSuggestions,
  levenshtein,
  urlMatchesPattern,
  globToRegex,
  pathTokens,
} from "../../apps/web/src/server/lib/suggest";

const known = [
  { url: "https://example.com/blog/hello-world", title: "Hello World" },
  { url: "https://example.com/blog/hello-word-2", title: null },
  { url: "https://example.com/about", title: "About" },
  { url: "https://example.com/docs/getting-started", title: null },
];

test("levenshtein basics", () => {
  expect(levenshtein("", "")).toBe(0);
  expect(levenshtein("abc", "abc")).toBe(0);
  expect(levenshtein("kitten", "sitting")).toBe(3);
});

test("suggests the closest url first", () => {
  const out = rankSuggestions("https://example.com/blog/hello-word", known);
  expect(out.length).toBeGreaterThan(0);
  expect(out[0].url).toBe("https://example.com/blog/hello-word-2");
});

test("a title shared by three or more pages is dropped", () => {
  const spa = ["/docs/install", "/docs/intro", "/docs/api"].map((p) => ({
    url: `https://example.com${p}`,
    title: "Acme App",
  }));
  const out = rankSuggestions(
    "https://example.com/docs/instal",
    [...spa, { url: "https://example.com/docs/installing", title: "Installing Acme" }],
    4,
  );
  expect(out.find((s) => s.url.endsWith("/docs/install"))!.title).toBeNull();
  expect(out.find((s) => s.url.endsWith("/docs/installing"))!.title).toBe("Installing Acme");
  expect(rankSuggestions("https://example.com/docs/instal", spa.slice(0, 2))[0].title).toBe(
    "Acme App",
  ); // two is fine
});

test("no plausible match -> empty", () => {
  expect(rankSuggestions("https://example.com/zzzzz/qqqqq", known)).toHaveLength(0);
});

test("pathTokens", () => {
  expect(pathTokens("/Blog/Hello-World.html")).toEqual(new Set(["blog", "hello", "world"]));
});

test("exclusion patterns: substring + glob", () => {
  expect(urlMatchesPattern("https://example.com/wp-admin/x", "/wp-admin/")).toBe(true);
  expect(urlMatchesPattern("https://example.com/blog/x", "/wp-admin/")).toBe(false);
  expect(urlMatchesPattern("https://example.com/a/b/c.png", "*/images/*")).toBe(false);
  expect(urlMatchesPattern("https://example.com/images/c.png", "*/images/*")).toBe(true);
  // a glob starting with "/" matches the path (the settings page's own example)
  expect(urlMatchesPattern("https://example.com/wp-admin/setup.php", "/wp-admin/*")).toBe(true);
  expect(urlMatchesPattern("https://example.com/blog/wp-admin/x", "/wp-admin/*")).toBe(false);
  expect(urlMatchesPattern("https://example.com/a.php?x=1", "*.php")).toBe(false);
  expect(urlMatchesPattern("https://example.com/a.php", "*.php")).toBe(true);
  expect(urlMatchesPattern("https://example.com/preview/x", "https://example.com/preview/*")).toBe(
    true,
  );
});

test("rank respects limit", () => {
  const many = Array.from({ length: 10 }, (_, i) => ({
    url: `https://example.com/blog/hello-word-${i}`,
    title: null,
  }));
  expect(rankSuggestions("https://example.com/blog/hello-word", many, 3)).toHaveLength(3);
});
