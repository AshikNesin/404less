import {
  bodyContentType,
  bodyToBytes,
  listKeys,
  type ListOptions,
  type ListResult,
  type PutOptions,
  type StorageAdapter,
  type StorageBody,
  type StoredObject,
} from "./adapter";

interface Entry {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  lastModified: Date;
}

/** In-memory storage for tests and quick experiments. */
export function memoryStorage(): StorageAdapter {
  const objects = new Map<string, Entry>();
  const toObject = (key: string, entry: Entry): StoredObject => ({
    key,
    size: entry.bytes.byteLength,
    contentType: entry.contentType,
    lastModified: entry.lastModified,
  });

  return {
    name: "memory",

    async put(key: string, body: StorageBody, options?: PutOptions) {
      const entry: Entry = {
        bytes: await bodyToBytes(body),
        contentType: bodyContentType(body, options?.contentType),
        lastModified: new Date(),
      };
      objects.set(key, entry);
      return toObject(key, entry);
    },

    async get(key: string) {
      const entry = objects.get(key);
      // A copy, so a caller mutating the bytes cannot change the stored object.
      return entry ? { object: toObject(key, entry), bytes: entry.bytes.slice() } : null;
    },

    async head(key: string) {
      const entry = objects.get(key);
      return entry ? toObject(key, entry) : null;
    },

    async delete(keys: string[]) {
      for (const key of keys) objects.delete(key);
    },

    async list(options: ListOptions = {}): Promise<ListResult> {
      const page = listKeys(objects.keys(), options);
      return {
        objects: page.keys.map((key) => toObject(key, objects.get(key)!)),
        prefixes: page.prefixes,
        cursor: page.cursor,
      };
    },

    async copy(from: string, to: string) {
      const entry = objects.get(from);
      if (!entry) throw new Error(`Object not found: ${from}`);
      objects.set(to, { ...entry, lastModified: new Date() });
    },
  };
}
