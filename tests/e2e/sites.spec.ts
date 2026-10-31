import { addSite, expect, signIn, test } from "./fixtures";

test.describe("Sites", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("add the first site and land on its overview with the setup checklist", async ({ page }) => {
    const site = await addSite(page, "https://www.first-site.example/some/page");

    // www. and the path are stripped; the name defaults to the domain
    expect(site.domain).toBe("first-site.example");
    await expect(
      page.getByRole("heading", { level: 1, name: /first-site\.example/ }),
    ).toBeVisible();
    await expect(page.getByText("No hits yet").first()).toBeVisible();
    await expect(page.getByText("Install the snippet on your 404 page")).toBeVisible();
    await expect(page.getByText("Import your sitemap or run a crawl")).toBeVisible();
    await expect(page.getByText("Add a notification channel")).toBeVisible();

    // the site's pages are in the sidebar
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    for (const label of ["Overview", "Broken links", "Crawler", "Site settings"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("a duplicate domain is refused with a reason", async ({ page }) => {
    await addSite(page, "dupe.example");
    await page.goto("/app/sites/new");
    await page.getByLabel("Domain").fill("dupe.example");
    await page.getByRole("button", { name: "Add site" }).click();
    await expect(page.getByText("dupe.example is already monitored by this team")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/sites\/new$/);
  });

  test("switch between sites from the sidebar; /app remembers the last one", async ({ page }) => {
    const alpha = await addSite(page, "alpha.example", "Alpha");
    const beta = await addSite(page, "beta.example", "Beta");

    await page.getByRole("button", { name: /Beta/ }).first().click();
    await page.getByRole("menuitem", { name: "Alpha" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/sites/${alpha.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: /Alpha/ })).toBeVisible();

    // site-scoped navigation follows the active site
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Broken links" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/app/sites/${alpha.id}/links`));

    await page.goto("/app");
    await expect(page).toHaveURL(new RegExp(`/app/sites/${alpha.id}$`));
    expect(beta.id).not.toBe(alpha.id);
  });

  test("an unknown site shows not found", async ({ page }) => {
    await page.goto("/app/sites/does-not-exist");
    await expect(page.getByText("Site not found")).toBeVisible();
  });

  test("site settings: rename, exclusions, alerts, delete", async ({ page }) => {
    const site = await addSite(page, "settings.example");
    await page.goto(`/app/sites/${site.id}/settings`);
    await expect(page.getByRole("heading", { name: "Site settings" })).toBeVisible();

    // the install snippet carries this site's key
    await expect(page.getByText(site.site_key).first()).toBeVisible();

    // rename
    await page.getByLabel("Name", { exact: true }).fill("Marketing");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Name saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Marketing");

    // exclusions: add, persists, remove
    await page.getByLabel("Exclusion pattern").fill("/wp-admin/*");
    await page.getByRole("button", { name: "Add pattern" }).click();
    await expect(page.getByLabel("Exclusion pattern")).toHaveValue("");
    await page.reload();
    await expect(page.getByRole("button", { name: "Remove /wp-admin/*" })).toBeVisible();
    await page.getByRole("button", { name: "Remove /wp-admin/*" }).click();
    await expect(page.getByRole("button", { name: "Remove /wp-admin/*" })).toHaveCount(0);

    // alerts: pause, then change the digest window
    const alerts = page.getByRole("switch", { name: "Send alerts" });
    await expect(alerts).toHaveAttribute("aria-checked", "true");
    await alerts.click();
    await expect(alerts).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("Paused: nothing is sent for this site")).toBeVisible();
    await alerts.click();
    await expect(alerts).toHaveAttribute("aria-checked", "true");
    await page.getByLabel("Digest window").selectOption("60");
    await page.reload();
    await expect(page.getByLabel("Digest window")).toHaveValue("60");

    // delete: two clicks (arm, then confirm)
    await page.getByRole("button", { name: "Delete site" }).click();
    await page.getByRole("button", { name: "Delete settings.example?" }).click();
    await expect(page.getByText("settings.example removed")).toBeVisible();
    // it was the only site: back to onboarding
    await expect(page).toHaveURL(/\/app\/sites\/new$/);
  });
});
