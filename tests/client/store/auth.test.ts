/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ApiError, apiClient } from "@groot/shell/lib/api";
import { loginErrorDescription, useAuthStore } from "@groot/shell/store/auth";

const USER = { id: 1, email: "demo@example.com", name: "Demo" };

type Route = { status: number; body?: unknown };

/** Answer each `/api/v1/<path>` from `routes`; anything else is a 404. */
function serve(routes: Record<string, Route | (() => Route | Promise<Route>)>) {
  vi.stubGlobal("fetch", async (url: string) => {
    const entry = routes[url.replace("/api/v1", "")];
    const route = typeof entry === "function" ? await entry() : entry;
    if (!route) return new Response(null, { status: 404 });
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status,
    });
  });
}

const ok = (data: unknown): Route => ({ status: 200, body: { success: true, data } });
const unauthorized: Route = {
  status: 401,
  body: { success: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials" } },
};

beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, hasCheckedAuth: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session", () => {
  it("signs in with a password and starts a new generation", async () => {
    serve({ "/auth/login": ok({ token: "t", user: USER }) });
    const generation = useAuthStore.getState().generation;
    await expect(useAuthStore.getState().login(USER.email, "secret")).resolves.toEqual(USER);
    expect(useAuthStore.getState()).toMatchObject({ user: USER, isAuthenticated: true });
    expect(useAuthStore.getState().generation).toBe(generation + 1);
  });

  it("words a rejected password as wrong credentials", async () => {
    serve({ "/auth/login": unauthorized });
    const error = await useAuthStore
      .getState()
      .login(USER.email, "wrong")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(loginErrorDescription(error, "fallback")).toBe("Invalid email or password.");
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("words network failures and other server errors", () => {
    expect(loginErrorDescription(new TypeError("Failed to fetch"), "fallback")).toMatch(
      /Could not reach the server/,
    );
    const limited = new ApiError({
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many requests",
      url: "/auth/login",
    });
    expect(loginErrorDescription(limited, "fallback")).toBe("Too many requests");
    expect(loginErrorDescription(undefined, "fallback")).toBe("fallback");
  });

  it("resolves the session from the cookie on load", async () => {
    serve({ "/auth/me": ok(USER) });
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState()).toMatchObject({ user: USER, hasCheckedAuth: true });

    serve({ "/auth/me": unauthorized });
    await useAuthStore.getState().checkAuth();
    expect(useAuthStore.getState()).toMatchObject({ user: null, hasCheckedAuth: true });
  });

  it("signs out locally even when the server call fails", async () => {
    serve({ "/auth/login": ok({ token: "t", user: USER }) });
    await useAuthStore.getState().login(USER.email, "secret");
    serve({ "/auth/logout": { status: 500 } });
    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });

  it("clears the session when a request made in it gets a 401", async () => {
    serve({ "/auth/login": ok({ token: "t", user: USER }), "/todos": unauthorized });
    await useAuthStore.getState().login(USER.email, "secret");
    await expect(apiClient.get("/todos")).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });

  it("ignores a 401 for a request sent before the current session began", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    serve({
      "/auth/login": ok({ token: "t", user: USER }),
      "/todos": async () => {
        await held;
        return unauthorized;
      },
    });
    const stale = apiClient.get("/todos").catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await useAuthStore.getState().login(USER.email, "secret");
    release();
    await stale;
    expect(useAuthStore.getState()).toMatchObject({ user: USER, isAuthenticated: true });
  });
});
