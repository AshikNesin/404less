/**
 * Shared e2e fixtures:
 *
 * - `signIn` goes through the real magic-link flow. On a loopback host
 *   without RESEND_API_KEY the server hands the link back and the login page
 *   follows it, so this exercises /auth/magic → /auth/verify → session cookie.
 * - `customerSite` is a tiny HTTP server standing in for a customer's website
 *   (on 127.0.0.1, which 404less crawls over plain http): a few real pages, a
 *   sitemap, broken internal links, and a 404 page that loads the real
 *   /embed.js from the app under test. It also stands in for a Slack incoming
 *   webhook, recording what 404less posts to it.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test as base, type Page } from "@playwright/test";

export const APP = "http://localhost:3000";

/** A unique email per call: every test gets its own user and personal team. */
export function uniqueEmail(label = "e2e"): string {
  return `${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export async function signIn(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto("/app/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return email;
}

export type Site = { id: string; name: string; domain: string; site_key: string };

/** Create a site through the UI's own form and return it as the API stored it. */
export async function addSite(page: Page, domain: string, name?: string): Promise<Site> {
  await page.goto("/app/sites/new");
  await page.getByLabel("Domain").fill(domain);
  if (name) await page.getByLabel("Name").fill(name);
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/sites") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add site" }).click();
  const res = await created;
  expect(res.status()).toBe(201);
  const { site } = (await res.json()) as { site: Site };
  await expect(page).toHaveURL(new RegExp(`/app/sites/${site.id}$`));
  return site;
}

/** Report a 404 hit the way the embed script does (public, no credentials). */
export async function trackHit(page: Page, siteKey: string, url: string, title?: string) {
  const res = await page.request.post(`${APP}/api/track`, {
    data: { siteKey, url, title, referrer: "https://referrer.example/post" },
  });
  expect(res.ok()).toBeTruthy();
}

export type CustomerSite = {
  origin: string;
  /** Host with port, as 404less stores it ("127.0.0.1:54321"). */
  domain: string;
  /** Site key the 404 page's embed snippet uses. Set it after creating the site. */
  siteKey: string;
  /** An http "Slack webhook" on this server; every POST body lands in `webhookCalls`. */
  webhookUrl: string;
  webhookCalls: unknown[];
};

/** Pages the customer site serves (path → title). Everything else is a 404. */
export const LIVE_PAGES: Record<string, string> = {
  "/": "Acme home",
  "/pricing": "Acme pricing",
  "/blog/hello-world": "Hello world",
  "/docs/getting-started": "Getting started",
};

/** Internal links on the home page that 404. */
export const BROKEN_LINKS = ["/old-pricing", "/blog/hello-wrld"];

/** The link text each broken link has on the home page. */
export const BROKEN_ANCHORS: Record<string, string> = {
  "/old-pricing": "See our old pricing &amp; plans",
  "/blog/hello-wrld": "Read the launch post",
};

type ServerState = { siteKey: string; webhookCalls: unknown[] };

function customerSiteServer(state: ServerState) {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "POST" && url.pathname === "/slack-hook") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        state.webhookCalls.push(JSON.parse(body || "null"));
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      });
      return;
    }
    const page = (status: number, title: string, body: string, head = "") => {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`,
      );
    };
    if (url.pathname === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (url.pathname === "/sitemap.xml") {
      const origin = `http://${req.headers.host}`;
      res.writeHead(200, { "Content-Type": "application/xml" });
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(
          LIVE_PAGES,
        )
          .map((p) => `<url><loc>${origin}${p}</loc></url>`)
          .join("")}</urlset>`,
      );
      return;
    }
    const title = LIVE_PAGES[url.pathname];
    if (title) {
      const links =
        url.pathname === "/"
          ? [...Object.keys(LIVE_PAGES), ...BROKEN_LINKS]
              .map((p) => `<a href="${p}">${BROKEN_ANCHORS[p] ?? p}</a>`)
              .join(" ")
          : `<a href="/">Home</a>`;
      page(200, title, `<h1>${title}</h1><nav>${links}</nav>`);
      return;
    }
    page(
      404,
      "404: Page not found",
      `<h1>Page not found</h1><div id="suggest"></div>`,
      `<script src="${APP}/embed.js" data-site="${state.siteKey}" data-404 data-mode="inline" data-target="#suggest" defer></script>`,
    );
  });
}

export const test = base.extend<{ customerSite: CustomerSite }>({
  // Playwright reads the fixtures a fixture needs from this destructuring: none here.
  // eslint-disable-next-line no-empty-pattern
  customerSite: async ({}, use) => {
    const state: ServerState = { siteKey: "", webhookCalls: [] };
    const server = customerSiteServer(state);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const site: CustomerSite = {
      origin: `http://127.0.0.1:${port}`,
      domain: `127.0.0.1:${port}`,
      webhookUrl: `http://127.0.0.1:${port}/slack-hook`,
      webhookCalls: state.webhookCalls,
      get siteKey() {
        return state.siteKey;
      },
      set siteKey(key: string) {
        state.siteKey = key;
      },
    };
    await use(site);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
});

export { expect };
