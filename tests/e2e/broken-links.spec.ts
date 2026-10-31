/**
 * The core loop: a visitor hits a 404 on the customer's site, the embed
 * reports it and suggests a real page, and the owner triages it in the
 * dashboard.
 */
import { addSite, expect, signIn, test, trackHit, type Site } from "./fixtures";

test.describe("Widget to triage", () => {
  test("a visitor 404 is reported, suggested and shows up in the dashboard", async ({
    page,
    context,
    customerSite,
  }) => {
    await signIn(page);
    const site = await addSite(page, customerSite.domain, "Acme");
    customerSite.siteKey = site.site_key;

    // Known pages power the "did you mean" suggestions: import the sitemap.
    await page.goto(`/app/sites/${site.id}/crawl`);
    await page.getByRole("button", { name: "Import sitemap" }).click();
    await expect(page.getByText(/Imported 4 URLs \(4 new\)/)).toBeVisible();

    // A visitor lands on a mistyped URL on the customer's site.
    const visitor = await context.newPage();
    const tracked = visitor.waitForResponse((r) => r.url().endsWith("/api/track"));
    await visitor.goto(`${customerSite.origin}/blog/hello-wrld`);
    expect((await tracked).ok()).toBeTruthy();
    // the embed renders the closest real page inline on the 404 page
    const widget = visitor.locator("#suggest");
    await expect(widget.getByText("Looking for something?")).toBeVisible();
    await expect(widget.locator('a[href$="/blog/hello-world"]')).toBeVisible();
    await visitor.close();

    // The overview flips to live and lists the link as needing attention.
    await page.goto(`/app/sites/${site.id}`);
    await expect(page.getByText("Tracking live")).toBeVisible();
    await expect(page.getByText("/blog/hello-wrld").first()).toBeVisible();

    // Broken links: the URL, its hit, and the suggested fix.
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Broken links" })
      .click();
    const row = page.getByRole("row", { name: /\/blog\/hello-wrld/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText("/blog/hello-world");
    await expect(page.getByRole("tab", { name: /^Open/ })).toContainText("1");

    // Detail page: where it came from and the redirect to add.
    await row
      .getByRole("link", { name: /\/blog\/hello-wrld/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Open");
    await expect(
      page.getByText("referrer.example").or(page.getByText("Direct")).first(),
    ).toBeVisible();
    await expect(page.getByText("/blog/hello-world").first()).toBeVisible();

    // Resolve from the detail page: back to the open list, now empty.
    await page.getByRole("button", { name: "Resolve", exact: true }).click();
    await expect(page.getByText("Resolved 1 link")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/app/sites/${site.id}/links\\?`));
    await expect(page.getByText("No open broken links")).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Resolved/ })).toContainText("1");
  });
});

test.describe("Broken links list", () => {
  let site: Site;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    site = await addSite(page, "triage.example");
    const base = `https://${site.domain}`;
    // hits per URL, so "Most hits" has a clear order
    for (const [path, hits] of [
      ["/old-pricing", 3],
      ["/blog/2019/launch", 2],
      ["/careers/intern", 1],
    ] as const) {
      for (let i = 0; i < hits; i++) await trackHit(page, site.site_key, `${base}${path}`);
    }
    await page.goto(`/app/sites/${site.id}/links`);
  });

  test("lists open links by hits and filters by search", async ({ page }) => {
    await expect(page.getByRole("tab", { name: /^Open/ })).toContainText("3");
    const urls = page
      .getByRole("row")
      .filter({ has: page.getByRole("checkbox") })
      .filter({
        hasNotText: "URL",
      });
    await expect(urls).toHaveCount(3);
    await expect(urls.nth(0)).toContainText("/old-pricing");
    await expect(urls.nth(0)).toContainText("3");
    await expect(urls.nth(2)).toContainText("/careers/intern");

    await page.getByLabel("Search URLs").fill("blog");
    await expect(page).toHaveURL(/q=blog/);
    await expect(urls).toHaveCount(1);
    await expect(urls.first()).toContainText("/blog/2019/launch");

    await page.getByLabel("Search URLs").fill("nothing-matches");
    await expect(page.getByText("No links match these filters")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(urls).toHaveCount(3);
  });

  test("bulk ignore, then reopen from the Ignored tab", async ({ page }) => {
    await page.getByRole("checkbox", { name: /Select .*\/old-pricing/ }).click();
    await page.getByRole("checkbox", { name: /Select .*\/careers\/intern/ }).click();
    const bar = page.getByRole("toolbar", { name: "Bulk actions" });
    await expect(bar).toContainText("2");
    await bar.getByRole("button", { name: "Ignore" }).click();
    await expect(page.getByText("Ignored 2 links")).toBeVisible();
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /^Open/ })).toContainText("1");
    await expect(page.getByRole("tab", { name: /^Ignored/ })).toContainText("2");

    await page.getByRole("tab", { name: /^Ignored/ }).click();
    await expect(page).toHaveURL(/status=ignored/);
    await page.getByRole("checkbox", { name: "Select all" }).click();
    await page
      .getByRole("toolbar", { name: "Bulk actions" })
      .getByRole("button", { name: "Reopen" })
      .click();
    await expect(page.getByText("Reopened 2 links")).toBeVisible();
    await expect(page.getByText("No ignored links yet")).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Open/ })).toContainText("3");
  });

  test("exports the current view as CSV", async ({ page }) => {
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export CSV" }).click();
    const file = await download;
    const csv = await (await file.createReadStream()).toArray();
    const text = Buffer.concat(csv).toString("utf8");
    expect(text).toContain("/old-pricing");
    expect(text).toContain("/careers/intern");
  });

  test("excluded URLs are not tracked", async ({ page }) => {
    await page.goto(`/app/sites/${site.id}/settings`);
    await page.getByLabel("Exclusion pattern").fill("/wp-admin/*");
    await page.getByRole("button", { name: "Add pattern" }).click();
    await expect(page.getByRole("button", { name: "Remove /wp-admin/*" })).toBeVisible();

    await trackHit(page, site.site_key, `https://${site.domain}/wp-admin/setup.php`);
    await page.goto(`/app/sites/${site.id}/links`);
    await expect(page.getByRole("tab", { name: /^Open/ })).toContainText("3");
    await expect(page.getByText("/wp-admin/setup.php")).toHaveCount(0);
  });
});
