import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { R2Bucket } from "@cloudflare/workers-types";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { StorageAdapter } from "@groot/core/storage";
import { memoryStorage } from "@groot/core/storage/memory";
import { localStorage } from "@groot/core/storage/node";
import { r2Storage } from "@groot/core/storage/r2";

/**
 * The storage contract (packages/core/src/storage/adapter.ts), run once per
 * adapter. R2 runs against a small in-memory bucket that mimics the binding,
 * including its quirk of leaving `httpMetadata` off listed objects unless
 * `include: ["httpMetadata"]` is asked for.
 */

interface FakeObject {
  key: string;
  bytes: Uint8Array;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

function fakeR2Bucket() {
  const objects = new Map<string, FakeObject>();
  const calls = { head: 0, delete: 0 };
  const describeObject = (object: FakeObject, withMetadata = true) => ({
    key: object.key,
    size: object.bytes.byteLength,
    uploaded: object.uploaded,
    httpMetadata: withMetadata ? object.httpMetadata : undefined,
    customMetadata: withMetadata ? object.customMetadata : undefined,
  });
  const bucket = {
    async put(
      key: string,
      value: ArrayBuffer,
      options: Pick<FakeObject, "httpMetadata" | "customMetadata"> = {},
    ) {
      const object: FakeObject = {
        key,
        bytes: new Uint8Array(value.slice(0)),
        uploaded: new Date(),
        httpMetadata: { ...options.httpMetadata },
        customMetadata: { ...options.customMetadata },
      };
      objects.set(key, object);
      return describeObject(object);
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return { ...describeObject(object), arrayBuffer: async () => object.bytes.slice().buffer };
    },
    async head(key: string) {
      calls.head += 1;
      const object = objects.get(key);
      return object ? describeObject(object) : null;
    },
    async delete(keys: string | string[]) {
      calls.delete += 1;
      const list = Array.isArray(keys) ? keys : [keys];
      if (list.length > 1000) throw new Error("R2 deletes at most 1000 keys per call");
      for (const key of list) objects.delete(key);
    },
    async list(
      options: {
        prefix?: string;
        delimiter?: string;
        cursor?: string;
        limit?: number;
        include?: string[];
      } = {},
    ) {
      const prefix = options.prefix ?? "";
      const entries: Array<{ key: string; prefix: boolean }> = [];
      const seen = new Set<string>();
      for (const key of [...objects.keys()].sort()) {
        if (!key.startsWith(prefix)) continue;
        const index = options.delimiter ? key.indexOf(options.delimiter, prefix.length) : -1;
        const entry = index === -1 ? key : key.slice(0, index + (options.delimiter ?? "").length);
        if (seen.has(entry)) continue;
        seen.add(entry);
        entries.push({ key: entry, prefix: index !== -1 });
      }
      const start = options.cursor ? Number(options.cursor) : 0;
      const limit = options.limit ?? 1000;
      if (limit > 1000) throw new Error("R2 lists at most 1000 entries per call");
      const page = entries.slice(start, start + limit);
      const truncated = start + limit < entries.length;
      const withMetadata = options.include?.includes("httpMetadata") ?? false;
      return {
        objects: page
          .filter((entry) => !entry.prefix)
          .map((entry) => describeObject(objects.get(entry.key)!, withMetadata)),
        delimitedPrefixes: page.filter((entry) => entry.prefix).map((entry) => entry.key),
        truncated,
        cursor: truncated ? String(start + limit) : undefined,
      };
    },
  };
  return { bucket: bucket as unknown as R2Bucket, calls };
}

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "groot-storage-"));
  tempRoots.push(root);
  return root;
}

interface AdapterCase {
  name: string;
  create: () => Promise<StorageAdapter>;
  /** False when the adapter derives the content type from the key's extension. */
  storesContentType: boolean;
}

const adapters: AdapterCase[] = [
  { name: "memory", create: async () => memoryStorage(), storesContentType: true },
  { name: "local", create: async () => localStorage(await tempRoot()), storesContentType: false },
  { name: "r2", create: async () => r2Storage(fakeR2Bucket().bucket), storesContentType: true },
];

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function listAll(
  storage: StorageAdapter,
  options: { prefix?: string; delimiter?: string; limit?: number },
) {
  const keys: string[] = [];
  const prefixes: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await storage.list({ ...options, cursor });
    keys.push(...page.objects.map((object) => object.key));
    prefixes.push(...page.prefixes);
    cursor = page.cursor;
    pages += 1;
  } while (cursor && pages < 100);
  return { keys, prefixes, pages };
}

describe.each(adapters)("$name storage adapter", ({ create, storesContentType }) => {
  it("puts an object and reads back what head reports", async () => {
    const storage = await create();
    const put = await storage.put("docs/hello.txt", "hello groot");
    expect(put).toMatchObject({ key: "docs/hello.txt", size: 11 });
    expect(put.lastModified).toBeInstanceOf(Date);
    expect(await storage.head("docs/hello.txt")).toEqual(put);

    const found = await storage.get("docs/hello.txt");
    expect(found?.object).toEqual(put);
    expect(text(found!.bytes)).toBe("hello groot");
  });

  it("accepts every body type", async () => {
    const storage = await create();
    const bytes = new TextEncoder().encode("abc");
    await storage.put("a.bin", "abc");
    await storage.put("b.bin", bytes);
    await storage.put("c.bin", bytes.slice().buffer);
    await storage.put("d.bin", new Blob(["abc"]));
    for (const key of ["a.bin", "b.bin", "c.bin", "d.bin"]) {
      expect(text((await storage.get(key))!.bytes)).toBe("abc");
    }
  });

  it("returns null for missing keys", async () => {
    const storage = await create();
    expect(await storage.get("missing.txt")).toBeNull();
    expect(await storage.head("missing.txt")).toBeNull();
  });

  it("replaces an existing object", async () => {
    const storage = await create();
    await storage.put("note.txt", "first");
    await storage.put("note.txt", "second!");
    expect((await storage.head("note.txt"))?.size).toBe(7);
    expect(text((await storage.get("note.txt"))!.bytes)).toBe("second!");
  });

  it("reports the content type it will serve", async () => {
    const storage = await create();
    const explicit = await storage.put("data/report.csv", "a,b", { contentType: "text/x-custom" });
    const fromBlob = await storage.put(
      "data/report.json",
      new Blob(["{}"], { type: "text/x-blob" }),
    );
    const fallback = await storage.put("data/blob", "raw");
    expect((await storage.head("data/report.csv"))?.contentType).toBe(explicit.contentType);
    expect((await storage.head("data/report.json"))?.contentType).toBe(fromBlob.contentType);
    expect(fallback.contentType).toBe("application/octet-stream");
    if (storesContentType) {
      expect(explicit.contentType).toBe("text/x-custom");
      expect(fromBlob.contentType).toBe("text/x-blob");
    } else {
      expect(explicit.contentType).toBe("text/csv");
      expect(fromBlob.contentType).toBe("application/json");
    }
  });

  it("does not let callers mutate a stored object through returned bytes", async () => {
    const storage = await create();
    await storage.put("bytes.txt", "abc");
    (await storage.get("bytes.txt"))!.bytes.fill(0);
    expect(text((await storage.get("bytes.txt"))!.bytes)).toBe("abc");
  });

  it("deletes keys and ignores missing ones", async () => {
    const storage = await create();
    await storage.put("a.txt", "a");
    await storage.put("dir/b.txt", "b");
    await storage.put("keep.txt", "k");
    await expect(storage.delete(["a.txt", "dir/b.txt", "missing.txt"])).resolves.toBeUndefined();
    await expect(storage.delete([])).resolves.toBeUndefined();
    expect(await storage.head("a.txt")).toBeNull();
    expect(await storage.head("dir/b.txt")).toBeNull();
    expect(await storage.head("keep.txt")).not.toBeNull();
    expect((await storage.list()).objects.map((object) => object.key)).toEqual(["keep.txt"]);
  });

  it("lists every key under a prefix in order without a delimiter", async () => {
    const storage = await create();
    for (const key of ["docs/b.txt", "docs/a.txt", "docs/sub/c.txt", "docs-old/d.txt", "e.txt"]) {
      await storage.put(key, key);
    }
    const all = await storage.list();
    expect(all.objects.map((object) => object.key)).toEqual([
      "docs-old/d.txt",
      "docs/a.txt",
      "docs/b.txt",
      "docs/sub/c.txt",
      "e.txt",
    ]);
    expect(all.prefixes).toEqual([]);
    expect(all.cursor).toBeUndefined();

    const docs = await storage.list({ prefix: "docs/" });
    expect(docs.objects.map((object) => object.key)).toEqual([
      "docs/a.txt",
      "docs/b.txt",
      "docs/sub/c.txt",
    ]);
    expect(docs.objects[0]).toEqual(await storage.head("docs/a.txt"));

    const partial = await storage.list({ prefix: "docs/s" });
    expect(partial.objects.map((object) => object.key)).toEqual(["docs/sub/c.txt"]);
    expect((await storage.list({ prefix: "nothing/" })).objects).toEqual([]);
  });

  it("lists one folder level with a delimiter", async () => {
    const storage = await create();
    for (const key of [
      "root.txt",
      "docs/a.txt",
      "docs/sub/b.txt",
      "docs/sub/deep/c.txt",
      "img/x.png",
    ]) {
      await storage.put(key, key);
    }
    const root = await storage.list({ delimiter: "/" });
    expect(root.objects.map((object) => object.key)).toEqual(["root.txt"]);
    expect(root.prefixes).toEqual(["docs/", "img/"]);

    const docs = await storage.list({ prefix: "docs/", delimiter: "/" });
    expect(docs.objects.map((object) => object.key)).toEqual(["docs/a.txt"]);
    expect(docs.prefixes).toEqual(["docs/sub/"]);
  });

  it("pages with limit and cursor", async () => {
    const storage = await create();
    const keys = ["k/1", "k/2", "k/3", "k/4", "k/5"];
    for (const key of keys) await storage.put(key, key);
    await storage.put("k/sub/a", "a");
    await storage.put("k/sub/b", "b");

    const first = await storage.list({ prefix: "k/", limit: 2 });
    expect(first.objects).toHaveLength(2);
    expect(first.cursor).toBeTypeOf("string");

    const flat = await listAll(storage, { prefix: "k/", limit: 2 });
    expect(flat.keys).toEqual([...keys, "k/sub/a", "k/sub/b"]);
    expect(flat.pages).toBeGreaterThan(1);

    const level = await listAll(storage, { prefix: "k/", delimiter: "/", limit: 2 });
    expect(level.keys).toEqual(keys);
    expect(level.prefixes).toEqual(["k/sub/"]);

    const exact = await storage.list({ prefix: "k/", delimiter: "/", limit: 6 });
    expect(exact.cursor).toBeUndefined();
  });

  it("copies an object over the target and keeps the source", async () => {
    const storage = await create();
    const source = await storage.put("from.txt", "copy me", { contentType: "text/plain" });
    await storage.put("to.txt", "old");
    await storage.copy("from.txt", "to.txt");
    const copied = await storage.get("to.txt");
    expect(text(copied!.bytes)).toBe("copy me");
    expect(copied!.object.contentType).toBe(source.contentType);
    expect(await storage.head("from.txt")).not.toBeNull();

    await storage.copy("from.txt", "nested/dir/to.txt");
    expect(text((await storage.get("nested/dir/to.txt"))!.bytes)).toBe("copy me");
    await expect(storage.copy("missing.txt", "x.txt")).rejects.toThrow(/missing\.txt/);
  });
});

describe("local storage adapter", () => {
  it("rejects keys that escape the root", async () => {
    const root = await tempRoot();
    const storage = localStorage(path.join(root, "uploads"));
    await expect(storage.put("../escape.txt", "x")).rejects.toThrow(/Invalid storage key/);
    await expect(storage.get("../escape.txt")).rejects.toThrow(/Invalid storage key/);
    await expect(storage.head("a/../../escape.txt")).rejects.toThrow(/Invalid storage key/);
    await expect(storage.delete(["../escape.txt"])).rejects.toThrow(/Invalid storage key/);
    await expect(storage.list({ prefix: "../" })).rejects.toThrow(/Invalid storage key/);
    expect(existsSync(path.join(root, "escape.txt"))).toBe(false);
  });

  it("prunes folders a delete leaves empty, and only those", async () => {
    const root = await tempRoot();
    const storage = localStorage(root);
    await storage.put("a/b/c.txt", "c");
    await storage.put("a/keep.txt", "k");
    await storage.delete(["a/b/c.txt"]);
    expect(existsSync(path.join(root, "a/b"))).toBe(false);
    expect(existsSync(path.join(root, "a"))).toBe(true);
    await storage.delete(["a/keep.txt"]);
    expect(existsSync(path.join(root, "a"))).toBe(false);
    expect(existsSync(root)).toBe(true);
  });

  it("lists nothing before the root exists", async () => {
    const root = await tempRoot();
    const storage = localStorage(path.join(root, "not-yet"));
    expect(await storage.list({ delimiter: "/" })).toEqual({ objects: [], prefixes: [] });
  });
});

describe("r2 storage adapter", () => {
  it("deletes without a head per key, in batches of 1000", async () => {
    const { bucket, calls } = fakeR2Bucket();
    const storage = r2Storage(bucket);
    const keys = Array.from({ length: 1001 }, (_, index) => `bulk/${index}`);
    await storage.delete(keys);
    expect(calls.head).toBe(0);
    expect(calls.delete).toBe(2);
  });
});

describe("listKeys and getContentType edge cases", () => {
  it("rejects list limits below 1 instead of silently truncating", async () => {
    const { listKeys } = await import("@groot/core/storage/adapter");
    for (const limit of [0, -1, Number.NaN]) {
      expect(() => listKeys(["a", "b"], { limit })).toThrow(RangeError);
    }
    expect(listKeys(["a", "b"], { limit: 1.7 }).keys).toEqual(["a"]);
  });

  it("does not resolve Object.prototype members as content types", async () => {
    const { getContentType } = await import("@groot/core/storage/storage.utils");
    for (const name of ["report.constructor", "x.toString", "x.__proto__"]) {
      expect(getContentType(name)).toBe("application/octet-stream");
    }
  });

  it("local overwrites go through a temp file that never lingers", async () => {
    const { readdir } = await import("node:fs/promises");
    const root = await mkdtemp(path.join(tmpdir(), "groot-atomic-"));
    try {
      const storage = localStorage(root);
      await storage.put("d/f.txt", "old");
      await storage.put("d/f.txt", "new");
      expect(new TextDecoder().decode((await storage.get("d/f.txt"))!.bytes)).toBe("new");
      expect(await readdir(path.join(root, "d"))).toEqual(["f.txt"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
