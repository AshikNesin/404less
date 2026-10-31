import { addSite, BROKEN_LINKS, expect, signIn, test } from "./fixtures";

test.describe("Crawler", () => {
  test("a crawl finds broken internal links and files them for triage", async ({
    page,
    customerSite,
  }) => {
    await signIn(page);
    const site = await addSite(page, customerSite.domain, "Acme");
    customerSite.siteKey = site.site_key;

    await page.goto(`/app/sites/${site.id}/crawl`);
    await expect(page.getByText("No results yet")).toBeVisible();
    await page.getByRole("button", { name: "Crawl now" }).first().click();
    await expect(page.getByText(/Crawl started/)).toBeVisible();

    // The crawl runs in the background; the page polls for results.
    for (const path of BROKEN_LINKS) {
      await expect(page.getByRole("row", { name: new RegExp(path) }).first()).toContainText("404", {
        timeout: 30_000,
      });
    }
    // working pages are checked too
    await expect(page.getByRole("row", { name: /\/pricing/ }).first()).toContainText("200");
    // pages it visited become known pages (they seed the next crawl and suggestions)
    await expect(page.getByText("Nothing indexed yet")).toHaveCount(0, { timeout: 10_000 });

    // Broken links found by the crawler are open, attributed to the crawler.
    await page.goto(`/app/sites/${site.id}/links?source=crawler`);
    for (const path of BROKEN_LINKS) {
      await expect(page.getByRole("row", { name: new RegExp(path) })).toBeVisible();
    }
    await expect(page.getByRole("tab", { name: /^Open/ })).toContainText(
      String(BROKEN_LINKS.length),
    );

    // The detail page shows where the broken link was found.
    await page
      .getByRole("link", { name: /\/old-pricing/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Open");
    await expect(page.getByText(/Acme home|127\.0\.0\.1/).first()).toBeVisible();
  });

  test("crawl settings: pages per crawl and ignored status codes", async ({ page }) => {
    await signIn(page);
    const site = await addSite(page, "crawl-settings.example");
    await page.goto(`/app/sites/${site.id}/crawl`);

    const schedule = page.getByRole("switch", { name: "Scheduled crawling" });
    const wasOn = (await schedule.getAttribute("aria-checked")) === "true";
    await schedule.click();
    await expect(schedule).toHaveAttribute("aria-checked", String(!wasOn));

    const pages = page.getByLabel("Pages per crawl");
    await pages.fill("25");
    await pages.press("Enter");
    await expect(page.getByText("Crawls start from up to 25 pages")).toBeVisible();
    // out of range: Enter is blocked by the input's own validation, so leave the field
    await pages.fill("9000");
    await pages.blur();
    await expect(page.getByText("Pages per crawl must be between 1 and 500")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Pages per crawl")).toHaveValue("25");
    await expect(page.getByRole("switch", { name: "Scheduled crawling" })).toHaveAttribute(
      "aria-checked",
      String(!wasOn),
    );

    await page.getByLabel("Status code to ignore").fill("403");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop ignoring 403" })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Stop ignoring 403" }).click();
    await expect(page.getByRole("button", { name: "Stop ignoring 403" })).toHaveCount(0);

    await page.getByLabel("Status code to ignore").fill("999");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Enter a status code between 100 and 599")).toBeVisible();
  });
});
