import type { StorageAdapter } from "./adapter";

/**
 * The active storage adapter, injected by `bootstrap({ storage })`: local
 * filesystem on Node, R2 on Workers, memory in tests. Import `storage` and
 * call it like the adapter; the proxy resolves lazily so modules can import
 * it before bootstrap has run.
 */
let adapter: StorageAdapter | null = null;

export function setStorageAdapter(next: StorageAdapter): void {
  adapter = next;
}

export function getStorage(): StorageAdapter {
  if (!adapter) {
    throw new Error("Storage is not configured. Pass a `storage` adapter to bootstrap().");
  }
  return adapter;
}

export const storage: StorageAdapter = new Proxy({} as StorageAdapter, {
  get(_target, prop) {
    const target = getStorage();
    const value = Reflect.get(target, prop, target);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  },
});
