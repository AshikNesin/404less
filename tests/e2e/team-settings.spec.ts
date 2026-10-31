import { APP, expect, signIn, test } from "./fixtures";

test.describe("Notification channels", () => {
  test("add a Slack channel, send a test, pause it and remove it", async ({
    page,
    customerSite,
  }) => {
    await signIn(page);
    await page.goto("/app/settings/channels");
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await expect(page.getByText("No channels yet")).toBeVisible();

    await page.getByRole("button", { name: /^Slack/ }).click();
    await page.getByLabel("Webhook URL").fill(customerSite.webhookUrl);
    await page.getByLabel("Name (optional)").fill("#ops-alerts");
    await page.getByRole("button", { name: "Add channel" }).click();
    await expect(page.getByText("Channel added. Send a test to confirm it works")).toBeVisible();
    await expect(page.getByText("#ops-alerts")).toBeVisible();

    // "Test" really posts to the webhook
    await page.getByRole("button", { name: "Test" }).click();
    await expect(page.getByText("Test sent. Check the channel")).toBeVisible();
    expect(customerSite.webhookCalls).toHaveLength(1);
    expect(JSON.stringify(customerSite.webhookCalls[0])).toContain("404less");

    // pause / resume
    const enabled = page.getByRole("switch", { name: "#ops-alerts enabled" });
    await enabled.click();
    await expect(page.getByText("Paused")).toBeVisible();
    await enabled.click();
    await expect(page.getByText("Paused")).toHaveCount(0);

    // remove: arm, then confirm
    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Remove?" }).click();
    await expect(page.getByText("Removed #ops-alerts")).toBeVisible();
    await expect(page.getByText("No channels yet")).toBeVisible();
  });

  test("an invalid email channel is refused", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/settings/channels");
    await page.getByRole("button", { name: /^Email/ }).click();
    await page.getByLabel("Send digests to").fill("not-an-email@x");
    await page.getByRole("button", { name: "Add channel" }).click();
    await expect(page.getByText("invalid config for email")).toBeVisible();
  });
});

test.describe("API & MCP", () => {
  test("a key is shown once, works against /mcp, and stops working when revoked", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/settings/api-keys");
    await expect(page.getByRole("heading", { level: 1, name: "API & MCP" })).toBeVisible();

    // first visit creates a key and shows the secret once
    const notice = page.getByText("Copy this key now. It won’t be shown again.");
    await expect(notice).toBeVisible();
    const secret = (
      await page
        .getByText(/^404l_[0-9a-f]+$/)
        .first()
        .innerText()
    ).trim();
    expect(secret).toMatch(/^404l_[0-9a-f]{20,}$/);
    // the agent setup is filled in with the real key
    await expect(page.getByText(`Bearer ${secret}`).first()).toBeVisible();

    const callMcp = (token: string) =>
      page.request.post(`${APP}/mcp`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
    const ok = await callMcp(secret);
    expect(ok.status()).toBe(200);
    expect(
      ((await ok.json()) as { result: { tools: unknown[] } }).result.tools.length,
    ).toBeGreaterThan(0);

    // dismissing hides the secret for good; only the prefix stays listed
    await page.getByRole("button", { name: "Done" }).click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByText(/^404l_\w+…$/)).toBeVisible();
    await expect(page.getByText(secret)).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Copy this key now")).toHaveCount(0);

    // revoke: arm, then confirm
    await page.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("button", { name: "Revoke?" }).click();
    await expect(page.getByText(/^Revoked /)).toBeVisible();
    await expect(page.getByText("No API keys")).toBeVisible();
    expect((await callMcp(secret)).status()).toBe(401);
  });
});
