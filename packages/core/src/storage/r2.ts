import type { R2Bucket, R2Object } from "@cloudflare/workers-types";
import {
  bodyContentType,
  bodyToBytes,
  MAX_LIST_LIMIT,
  type ListOptions,
  type ListResult,
  type PutOptions,
  type StorageAdapter,
  type StorageBody,
  type StoredObject,
} from "./adapter";

/**
 * Storage on a Cloudflare R2 bucket *binding* (`env.STORAGE`). No credentials
 * and no SDK: the Worker talks to the bucket directly.
 */
export function r2Storage(bucket: R2Bucket): StorageAdapter {
  const toObject = (object: R2Object): StoredObject => ({
    key: object.key,
    size: object.size,
    contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
    lastModified: object.uploaded,
  });

  return {
    name: "r2",

    async put(key: string, body: StorageBody, options?: PutOptions) {
      const bytes = await bodyToBytes(body);
      const object = await bucket.put(key, bytes.buffer, {
        httpMetadata: { contentType: bodyContentType(body, options?.contentType) },
      });
      if (!object) throw new Error(`Upload failed: ${key}`);
      return toObject(object);
    },

    async get(key: string) {
      const object = await bucket.get(key);
      if (!object) return null;
      return { object: toObject(object), bytes: new Uint8Array(await object.arrayBuffer()) };
    },

    async head(key: string) {
      const object = await bucket.head(key);
      return object ? toObject(object) : null;
    },

    async delete(keys: string[]) {
      // R2 accepts up to 1000 keys per call.
      for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
    },

    async list(options: ListOptions = {}): Promise<ListResult> {
      const listOptions = {
        prefix: options.prefix,
        delimiter: options.delimiter,
        cursor: options.cursor,
        limit: Math.min(options.limit ?? MAX_LIST_LIMIT, MAX_LIST_LIMIT),
        // Without it, listed objects carry no content type. The runtime supports
        // it; the default (oldest compat date) typings do not declare it.
        include: ["httpMetadata"],
      };
      const page = await bucket.list(listOptions);
      return {
        objects: page.objects.map(toObject),
        prefixes: page.delimitedPrefixes,
        cursor: page.truncated ? page.cursor : undefined,
      };
    },

    async copy(from: string, to: string) {
      const source = await bucket.get(from);
      if (!source) throw new Error(`Object not found: ${from}`);
      await bucket.put(to, await source.arrayBuffer(), {
        httpMetadata: source.httpMetadata,
        customMetadata: source.customMetadata,
      });
    },
  };
}
