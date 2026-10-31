import { expect, signIn, test, uniqueEmail } from "./fixtures";

test.describe("Sign in", () => {
  test("the dashboard is behind sign-in", async ({ page }) => {
    await page.goto("/app/settings/channels");
    await expect(page).toHaveURL(/\/app\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("a first sign-in creates the account and starts onboarding", async ({ page }) => {
    const email = uniqueEmail("first");
    await signIn(page, email);

    // no sites yet: /app sends a new user straight to "add your first site"
    await expect(page).toHaveURL(/\/app\/sites\/new$/);
    await expect(page.getByText("Add your first site", { exact: true }).first()).toBeVisible();

    // the account menu shows who is signed in
    await page.getByRole("button", { name: email }).click();
    await expect(page.getByRole("menu")).toContainText(email);
  });

  test("rejects an invalid email without leaving the page", async ({ page }) => {
    await page.goto("/app/login");
    await page.getByLabel("Email").fill("not-an-email@nowhere");
    await page.getByRole("button", { name: "Send sign-in link" }).click();
    await expect(page.getByText("invalid email")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/login$/);
  });

  test("a used or expired link explains itself", async ({ page }) => {
    await page.goto("/api/v1/auth/verify?token=not-a-real-token");
    await expect(page).toHaveURL(/\/app\/login\?error=expired$/);
    await expect(page.getByText("That link has expired or was already used.")).toBeVisible();
  });

  test("a signed-in visitor skips the login page", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/login");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("sign out ends the session", async ({ page }) => {
    const email = await signIn(page);
    await page.getByRole("button", { name: email }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/app\/login$/);

    // the cookie is gone: protected pages bounce back to sign-in
    await page.goto("/app/settings/api-keys");
    await expect(page).toHaveURL(/\/app\/login$/);
  });
});
