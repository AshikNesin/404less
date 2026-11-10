// Marketing 404 demo (built-in site key) and the cloud-version waitlist.
import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("the marketing 404 key suggests this site's pages", async () => {
  const r = await SELF.fetch(
    `http://localhost/api/suggestions?site=404less-site&url=${encodeURIComponent("https://404less.com/self-hos")}&limit=4`,
  );
  expect(r.status).toBe(200);
  const body = (await r.json()) as { suggestions: { url: string }[]; home: string };
  expect(body.home).toBe("https://404less.com/");
  expect(body.suggestions[0]?.url).toBe("https://404less.com/self-host");

  const miss = await SELF.fetch(
    `http://localhost/api/suggestions?site=404less-site&url=${encodeURIComponent("https://404less.com/totally-missing")}`,
  );
  const missed = (await miss.json()) as { suggestions: unknown[] };
  expect(missed.suggestions.length).toBeGreaterThan(0);
});

test("a marketing 404 hit is stored without a websites row", async () => {
  const r = await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      siteKey: "404less-site",
      url: "https://404less.com/no-such",
      referrer: "https://news.ycombinator.com/",
    }),
  });
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ ok: true });
  const row = await env.DB.prepare("SELECT value FROM kv WHERE key = ?")
    .bind("marketing-404:hits")
    .first<{ value: string }>();
  const hits = JSON.parse(row?.value ?? "[]") as { url: string; referrer: string | null }[];
  expect(hits.some((hit) => hit.url === "https://404less.com/no-such")).toBe(true);
});

test("waitlist stores a normalised email once", async () => {
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    "cf-connecting-ip": "203.0.113.10",
  };
  const post = (email: string) =>
    SELF.fetch("http://localhost/api/waitlist", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, source: "homepage" }),
    });
  expect((await post("Ada@Example.com")).status).toBe(200);
  expect((await post("ada@example.com")).status).toBe(200);
  const row = await env.DB.prepare("SELECT value FROM kv WHERE key = ?")
    .bind("waitlist:ada@example.com")
    .first<{ value: string }>();
  expect(JSON.parse(row?.value ?? "{}")).toMatchObject({ source: "homepage" });
});

test("waitlist drops a honeypot and a cross-origin post", async () => {
  const honeypot = await SELF.fetch("http://localhost/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "cf-connecting-ip": "203.0.113.11",
    },
    body: JSON.stringify({ email: "bot@example.com", source: "homepage", company: "Acme" }),
  });
  expect(honeypot.status).toBe(200);
  const cross = await SELF.fetch("http://localhost/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      origin: "https://evil.example",
      "cf-connecting-ip": "203.0.113.12",
    },
    body: JSON.stringify({ email: "cross@example.com", source: "homepage" }),
  });
  expect(cross.status).toBe(200);
  const stored = await env.DB.prepare(
    "SELECT key FROM kv WHERE key IN ('waitlist:bot@example.com', 'waitlist:cross@example.com')",
  ).all();
  expect(stored.results).toEqual([]);
});

test("waitlist rejects a bad email and slows a noisy address", async () => {
  const bad = await SELF.fetch("http://localhost/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "cf-connecting-ip": "203.0.113.13",
    },
    body: JSON.stringify({ email: "not-an-email", source: "self-host" }),
  });
  expect(bad.status).toBe(400);

  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    "cf-connecting-ip": "203.0.113.14",
  };
  for (let i = 0; i < 5; i++) {
    const ok = await SELF.fetch("http://localhost/api/waitlist", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: `person${i}@example.com`, source: "self-host" }),
    });
    expect(ok.status).toBe(200);
  }
  const limited = await SELF.fetch("http://localhost/api/waitlist", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: "person6@example.com", source: "self-host" }),
  });
  expect(limited.status).toBe(429);
});

test("a no-JS waitlist post returns HTML", async () => {
  const r = await SELF.fetch("http://localhost/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cf-connecting-ip": "203.0.113.15",
    },
    body: "email=html%40example.com&source=homepage&company=",
  });
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type") ?? "").toContain("text/html");
  expect(await r.text()).toContain("You’re on the list");
});
