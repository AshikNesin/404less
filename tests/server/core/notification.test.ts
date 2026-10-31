import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { loadEnv } from "@groot/core/env";
import {
  notificationService,
  sendPushNotification,
  sendServerStartupNotification,
} from "@groot/core/notification/notification.service";

function stubFetch(status = 200) {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body as URLSearchParams });
      return new Response(status === 200 ? "ok" : "nope", { status });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("push notifications", () => {
  it("stays silent without the Pushover keys", async () => {
    loadEnv({ NODE_ENV: "test" });
    const calls = stubFetch();
    expect(await sendPushNotification({ title: "t", message: "m" })).toBe(false);
    expect(calls).toEqual([]);
  });

  it("posts the notification to Pushover with the validated env keys", async () => {
    loadEnv({ NODE_ENV: "test", PUSHOVER_USER_KEY: "user-key", PUSHOVER_API_TOKEN: "api-token" });
    const calls = stubFetch();
    const sent = await sendPushNotification({
      title: "Server started",
      message: "on port 3000",
      priority: 1,
      url: "https://example.com",
      urlTitle: "Open",
    });
    expect(sent).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.pushover.net/1/messages.json");
    expect(Object.fromEntries(calls[0]!.body)).toEqual({
      token: "api-token",
      user: "user-key",
      title: "Server started",
      message: "on port 3000",
      priority: "1",
      url: "https://example.com",
      url_title: "Open",
    });
  });

  it("throws when Pushover rejects the request", async () => {
    stubFetch(400);
    await expect(sendPushNotification({ title: "t", message: "m" })).rejects.toThrow(/status 400/);
  });

  it("sends the startup ping through the same module object", async () => {
    const calls = stubFetch();
    expect(notificationService.sendPushNotification).toBe(sendPushNotification);
    await notificationService.sendServerStartupNotification(3000, "test");
    expect(calls[0]!.body.get("title")).toBe("Server started");
    expect(calls[0]!.body.get("message")).toContain("3000");
    await sendServerStartupNotification(3000, "test");
    expect(calls).toHaveLength(2);
  });
});
