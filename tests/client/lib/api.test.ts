/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ApiError, apiClient } from "@groot/shell/lib/api";

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn(
    async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof respond>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init, headers: init.headers as Headers };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiClient", () => {
  it("prefixes the base path, drops empty params and unwraps data", async () => {
    const fetchMock = respond(200, { success: true, data: [{ id: 1 }] });
    const data = await apiClient.get<{ id: number }[]>("/todos", {
      page: 2,
      q: undefined,
      done: null,
    });
    expect(data).toEqual([{ id: 1 }]);
    const { url, init, headers } = sent(fetchMock);
    expect(url).toBe("/api/v1/todos?page=2");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect(headers.get("accept")).toBe("application/json");
  });

  it("sends JSON bodies and leaves FormData to the browser", async () => {
    const fetchMock = respond(200, { success: true, data: { ok: true } });
    await apiClient.post("/todos", { title: "x" });
    expect(sent(fetchMock).init.body).toBe('{"title":"x"}');
    expect(sent(fetchMock).headers.get("content-type")).toBe("application/json");

    const form = new FormData();
    form.append("file", "content");
    const uploadMock = respond(200, { success: true, data: { filePath: "a.txt" } });
    await apiClient.postForm("/storage/files/upload", form);
    expect(sent(uploadMock).init.body).toBe(form);
    expect(sent(uploadMock).headers.get("content-type")).toBeNull();
  });

  it("throws an ApiError carrying the server's error envelope", async () => {
    respond(400, {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Title is required", details: { title: [] } },
    });
    const error = await apiClient.put("/todos/1", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Title is required",
      details: { title: [] },
      url: "/todos/1",
    });
  });

  it("falls back to the HTTP status when the body is not an envelope", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>", { status: 502 }));
    await expect(apiClient.get("/todos")).rejects.toMatchObject({
      status: 502,
      code: "HTTP_502",
    });
  });

  it("throws when a successful envelope has no data, except for DELETE", async () => {
    respond(200, { success: true });
    await expect(apiClient.patch("/todos/1", {})).rejects.toMatchObject({ code: "NO_DATA" });
    respond(204);
    await expect(apiClient.delete("/todos/1")).resolves.toBeUndefined();
  });

  it("returns blobs without unwrapping", async () => {
    vi.stubGlobal("fetch", async () => new Response("raw bytes", { status: 200 }));
    const blob = await apiClient.getBlob("/storage/files/download", { filePath: "a.txt" });
    expect(await blob.text()).toBe("raw bytes");
  });

  it("reports every 401 to the unauthorized handlers until they unsubscribe", async () => {
    const handler = vi.fn();
    const unsubscribe = apiClient.onUnauthorized(handler);
    const before = performance.now();
    respond(401, { success: false, error: { code: "UNAUTHORIZED", message: "No token" } });
    await expect(apiClient.get("/todos")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]![0]).toMatchObject({ path: "/todos" });
    expect(handler.mock.calls[0]![0].sentAt).toBeGreaterThanOrEqual(before);

    unsubscribe();
    await expect(apiClient.get("/todos")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledOnce();
  });
});
