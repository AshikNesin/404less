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
    // the connect panel fills the real key into each client's setup
    const panel = page.getByRole("tabpanel", { name: "Assistant" });
    await expect(page.getByText("Using the key you just created")).toBeVisible();
    await panel.getByRole("radio", { name: "Cursor" }).click();
    await expect(panel.getByText(`"Bearer ${secret}"`)).toBeVisible();
    // one-click install carries the same config
    const install = await panel.getByRole("link", { name: "Add to Cursor" }).getAttribute("href");
    const config = JSON.parse(
      Buffer.from(new URL(install!).searchParams.get("config")!, "base64").toString("utf8"),
    );
    expect(config).toEqual({ url: `${APP}/mcp`, headers: { Authorization: `Bearer ${secret}` } });
    // one picker on the page, no dialog on top of it
    await expect(page.getByRole("radiogroup", { name: "Agent" })).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);

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

test("connect panel: no key on hand, create one in place and the setup works", async ({ page }) => {
  await signIn(page);
  await page.goto("/app/settings/api-keys");
  await page.getByRole("button", { name: "Done" }).click(); // the first key's secret is gone

  const panel = page.getByRole("tabpanel", { name: "Assistant" });
  await panel.getByRole("radio", { name: "Claude Code" }).click();
  await expect(panel.getByRole("region", { name: "Add 404less to Claude Code" })).toBeVisible();
  await expect(panel.getByText("Bearer 404l_your_key")).toBeVisible();

  await page
    .getByText("Keys are shown once")
    .locator("..")
    .getByRole("button", { name: "Create key" })
    .click();
  await expect(page.getByText("Using the key you just created")).toBeVisible();
  const command = await panel.locator("pre").first().innerText();
  const secret = command.match(/Bearer (404l_[0-9a-f]+)/)![1];
  expect(command).toContain(`claude mcp add --transport http 404less ${APP}/mcp`);

  const res = await page.request.post(`${APP}/mcp`, {
    headers: { Authorization: `Bearer ${secret}` },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(res.status()).toBe(200);
});
