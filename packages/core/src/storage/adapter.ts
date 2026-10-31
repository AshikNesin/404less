/**
 * The storage contract. Three implementations ship: the local filesystem for
 * Node (`./node`), an R2 bucket binding for Workers (`./r2`), and an in-memory
 * map for tests (`./memory`). `tests/server/core/storage-adapters.test.ts` runs
 * one contract suite against all three; a new adapter should pass it too.
 *
 * Semantics every adapter follows:
 *
 * - Keys are `/`-separated object paths with no leading or trailing `/`.
 *   "Folders" are just common prefixes, like on any object store.
 * - `put` creates or replaces an object and resolves with what `head` returns
 *   for it afterwards.
 * - `get` and `head` resolve to `null` for a missing key.
 * - `delete` removes the given keys and ignores missing ones. It returns no
 *   count: object stores delete blindly, and counting would cost one `head`
 *   per key.
 * - `list` walks keys in ascending lexicographic order (see `ListOptions`).
 * - `copy` replaces `to` with the bytes and content type of `from`; it throws
 *   when `from` does not exist.
 * - `contentType` is the type given to `put`, else the Blob's own type, else
 *   `application/octet-stream`. Adapters without a metadata store (local
 *   files) derive it from the key's extension instead.
 */

export type StorageBody = Uint8Array | ArrayBuffer | Blob | string;

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
  lastModified: Date | null;
}

export interface PutOptions {
  contentType?: string;
}

/** Most entries one `list()` page returns, and the default `limit`. */
export const MAX_LIST_LIMIT = 1000;

export interface ListOptions {
  /** Only keys that start with this string. */
  prefix?: string;
  /**
   * With "/", one folder level: the objects directly under `prefix` plus the
   * sub-prefixes below it. Omit to list every key under `prefix`.
   */
  delimiter?: string;
  /** The `cursor` of the previous page. */
  cursor?: string;
  /** Upper bound on objects plus prefixes in this page; capped at MAX_LIST_LIMIT. A page may hold fewer. */
  limit?: number;
}

export interface ListResult {
  objects: StoredObject[];
  /** Sub-folders (only when `delimiter` was given), each ending with the delimiter. */
  prefixes: string[];
  /** Present only when more results exist; pass it back to read the next page. */
  cursor?: string;
}

export interface StorageAdapter {
  readonly name: string;
  put(key: string, body: StorageBody, options?: PutOptions): Promise<StoredObject>;
  get(key: string): Promise<{ object: StoredObject; bytes: Uint8Array<ArrayBuffer> } | null>;
  head(key: string): Promise<StoredObject | null>;
  delete(keys: string[]): Promise<void>;
  list(options?: ListOptions): Promise<ListResult>;
  copy(from: string, to: string): Promise<void>;
}

/** Normalise any accepted body into bytes. */
export async function bodyToBytes(body: StorageBody): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof body === "string") return new Uint8Array(new TextEncoder().encode(body));
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(body);
}

/** Content type hint from the body when the caller gave none. */
export function bodyContentType(body: StorageBody, explicit?: string): string {
  if (explicit) return explicit;
  if (body instanceof Blob && body.type) return body.type;
  return "application/octet-stream";
}

/**
 * One `list()` page over a full set of keys, for adapters that can enumerate
 * every key themselves (memory, local files). The cursor is the last entry of
 * the page, so the next page starts strictly after it.
 */
export function listKeys(
  keys: Iterable<string>,
  options: ListOptions = {},
): { keys: string[]; prefixes: string[]; cursor?: string } {
  const prefix = options.prefix ?? "";
  const { delimiter, cursor } = options;
  const requested = options.limit ?? MAX_LIST_LIMIT;
  if (!(requested >= 1)) throw new RangeError(`list limit must be at least 1, got ${requested}`);
  const limit = Math.min(Math.floor(requested), MAX_LIST_LIMIT);
  const isPrefix = new Map<string, boolean>();
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const index = delimiter ? key.indexOf(delimiter, prefix.length) : -1;
    if (index === -1) isPrefix.set(key, false);
    else isPrefix.set(key.slice(0, index + delimiter!.length), true);
  }
  const remaining = [...isPrefix.keys()]
    .filter((entry) => cursor === undefined || entry > cursor)
    .sort();
  const page = remaining.slice(0, limit);
  return {
    keys: page.filter((entry) => !isPrefix.get(entry)),
    prefixes: page.filter((entry) => isPrefix.get(entry)),
    cursor: remaining.length > page.length ? page.at(-1) : undefined,
  };
}
