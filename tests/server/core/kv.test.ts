import { describe, expect, it } from "vite-plus/test";
import { createNamespaceKv, kv, purgeExpiredKv } from "@groot/core/kv";

describe("kv", () => {
  it("round-trips JSON values", async () => {
    await kv.set("k1", { count: 3, ok: true });
    expect(await kv.get("k1")).toEqual({ count: 3, ok: true });
    expect(await kv.has("k1")).toBe(true);
    expect(await kv.delete("k1")).toBe(true);
    expect(await kv.delete("k1")).toBe(false);
    expect(await kv.get("k1")).toBeUndefined();
  });

  it("overwrites on set", async () => {
    await kv.set("k2", "a");
    await kv.set("k2", "b");
    expect(await kv.get("k2")).toBe("b");
  });

  it("matches prefixes case-sensitively and treats LIKE wildcards literally", async () => {
    const store = createNamespaceKv("case:");
    await store.set("user:1", 1);
    await store.set("User:2", 2);
    await store.set("user_3", 3);
    await store.set("u%er:4", 4);
    expect((await store.list("user:")).map((e) => e.key)).toEqual(["user:1"]);
    expect((await store.list("u%")).map((e) => e.key)).toEqual(["u%er:4"]);
    expect(await store.clear("user:")).toBe(1);
    expect(await store.get("User:2")).toBe(2);
    expect(await store.get("user_3")).toBe(3);
    await store.clear();
  });

  it("isolates namespaces and lists by prefix", async () => {
    const a = createNamespaceKv("ns-a");
    const b = createNamespaceKv("ns-b");
    await a.set("shared", "from-a");
    await b.set("shared", "from-b");
    await a.set("other", 1);
    expect(await a.get("shared")).toBe("from-a");
    expect(await b.get("shared")).toBe("from-b");
    expect((await a.list()).map((e) => e.key).sort()).toEqual(["other", "shared"]);
    expect(await a.list("sh")).toEqual([{ key: "shared", value: "from-a" }]);
    expect(await a.clear()).toBe(2);
    expect(await b.get("shared")).toBe("from-b");
  });

  it("expires entries", async () => {
    await kv.set("ttl", "soon", 1);
    await kv.set("keep", "forever");
    await new Promise((r) => setTimeout(r, 5));
    expect(await kv.get("ttl")).toBeUndefined();
    await kv.set("ttl2", "soon", 1);
    await new Promise((r) => setTimeout(r, 5));
    expect(await purgeExpiredKv()).toBe(1);
    expect(await kv.get("keep")).toBe("forever");
  });
});
