# File storage

A small file browser (list, upload, download, delete, folders, rename) over a
storage adapter. Three adapters ship; the runtime entry injects one through
`bootstrap({ storage })` and the rest of the code uses `storage` from
`@groot/core/storage`.

| Adapter                                  | File                                  | Used by                                                                                                                                    |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `localStorage(root = "./local/uploads")` | `packages/core/src/storage/node.ts`   | `entry.node.ts` — plain files on disk, content type from the extension, empty folders pruned on delete, a key that escapes the root throws |
| `r2Storage(env.STORAGE)`                 | `packages/core/src/storage/r2.ts`     | `entry.worker.ts` — an R2 bucket binding; no credentials, no SDK                                                                           |
| `memoryStorage()`                        | `packages/core/src/storage/memory.ts` | `tests/server/setup.ts`                                                                                                                    |

`localStorage` and `uploadsRoot` are Node-only, so they are imported from
`@groot/core/storage/node`, not the barrel.

Keys are `/`-separated object paths. Folders are common prefixes, as on any
object store; "creating" a folder writes a `<folder>/.keep` marker.

## The contract (`packages/core/src/storage/adapter.ts`)

```ts
interface StorageAdapter {
  readonly name: string;
  put(
    key: string,
    body: Uint8Array | ArrayBuffer | Blob | string,
    options?: { contentType?: string },
  ): Promise<StoredObject>;
  get(key: string): Promise<{ object: StoredObject; bytes: Uint8Array } | null>;
  head(key: string): Promise<StoredObject | null>;
  delete(keys: string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    delimiter?: string;
    cursor?: string;
    limit?: number;
  }): Promise<ListResult>;
  copy(from: string, to: string): Promise<void>;
}
// StoredObject = { key, size, contentType, lastModified: Date | null }
// ListResult   = { objects: StoredObject[]; prefixes: string[]; cursor?: string }
```

The semantics every adapter follows:

- **Keys** are `/`-separated paths with no leading or trailing `/`.
- **`put`** creates or replaces, and resolves with what `head` reports afterwards.
- **`get` / `head`** resolve to `null` for a missing key.
- **`delete`** removes the keys and ignores missing ones. It returns nothing:
  object stores delete blindly, and a count would cost one `head` per key.
- **`list`** walks keys in ascending order. With `delimiter: "/"` it returns one
  folder level (the objects directly under `prefix` plus the sub-prefixes);
  without it, every key under `prefix`. A page holds at most `limit` entries
  (objects plus prefixes, default and maximum 1000); `cursor` is set only when
  more exist, and passing it back reads the next page.
- **`copy`** replaces `to` with the bytes and content type of `from`, and throws
  when `from` is missing.
- **`contentType`** is the type given to `put`, else the Blob's type, else
  `application/octet-stream`. The local adapter has no metadata store and
  derives it from the extension instead.

`tests/server/core/storage-adapters.test.ts` runs one contract suite against
all three adapters (local on a temp directory, R2 on an in-memory bucket fake).

Need S3, GCS or anything else? Implement these six methods (the helpers
`bodyToBytes`, `bodyContentType` and `listKeys` in `adapter.ts` do the boring
parts), add it to the contract suite, and pass it to `bootstrap()` in your
entry file. Nothing else changes.

## Using it from code

```ts
import { storage } from "@groot/core/storage";

await storage.put("reports/2026-10.csv", csvText, { contentType: "text/csv" });
const found = await storage.get("reports/2026-10.csv"); // { object, bytes } or null
const page = await storage.list({ prefix: "reports/", delimiter: "/" });
await storage.delete(["reports/2026-10.csv"]);
```

The higher-level operations the routes use (sorted folder listing, multi-file
upload, rename as copy + delete, recursive folder delete) are in
`storage.service.ts`, exported as `storageService` from `@groot/core/storage`.
The service trusts its input: `createFolder()` and `deleteFolder()` expect a
folder path ending in `/`, and paths are validated only by the route schemas.

## Module structure

```
packages/core/src/storage/
├── index.ts              # the @groot/core/storage barrel (no Node-only adapter)
├── adapter.ts            # StorageAdapter contract + helpers
├── storage.ts            # the `storage` proxy, setStorageAdapter(), getStorage()
├── node.ts · r2.ts · memory.ts
├── storage.routes.ts     # Hono router (rate-limited, 100 MB upload limit)
├── storage.service.ts    # listFiles, uploadFile, uploadFiles, downloadFile, deleteFiles,
│                         # createFolder, deleteFolder, renameFile, copyFile
├── storage.schema.ts     # Zod schemas (path validation) and the wire types
└── storage.utils.ts      # getContentType(), sanitizeFileName()
```

## HTTP API

All under `/api/v1/storage`, behind the JWT middleware of the protected sub-app
in `app.ts`, and rate-limited per IP by `storageRateLimiter`. Uploads also pass
`uploadRateLimiter` (so they count against both) and a 100 MB body limit. The
limits come from `config.rateLimits.storage` and `.upload`; defaults are in
[Config](../reference/config.md#settings).

| Method | Path                          | Notes                                                                                                                                       |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/files?folder=docs/`         | One folder level, folders first then files, each by name. Omit `folder` for the root                                                        |
| POST   | `/files/upload` _(multipart)_ | Field `file`, repeated for up to 50 files; optional `folder`. Each lands at `<folder><file name>`. Returns `{ uploadedFiles, failedFiles }` |
| GET    | `/files/download?filePath=…`  | Raw bytes with the object's content type, `Content-Disposition: inline`; `404` when missing                                                 |
| DELETE | `/files`                      | Body `{ "filePaths": [...] }` → `204`; missing files are ignored                                                                            |
| PUT    | `/files/rename`               | Body `{ oldPath, newPath }` → `{ newPath }`; `404` when `oldPath` is missing. An existing `newPath` is overwritten                          |
| POST   | `/folders`                    | Body `{ "folderPath": "docs/2026" }` → `{ folderPath: "docs/2026/" }`; writes a `.keep` marker                                              |
| DELETE | `/folders/:folderPath`        | The path may contain `/`. Deletes every object under the prefix → `{ deletedCount }`                                                        |

Paths are checked once, by the schemas in `storage.schema.ts`: a file path has
no leading, trailing or doubled `/`, no `.` or `..` segment and no `\`, and an
upload's file names are single segments. A folder is normalised to `""` (the
root) or `a/b/`, so `folder=docs`, `folder=/docs/` and `folder=docs/` are the
same. Anything else is a `400`.

Every JSON route returns `200` with the `{ success, data }` envelope, except
`DELETE /files` (`204`). One failed file in an upload does not fail the rest;
it is listed in `failedFiles`. curl examples are in
[API requests](../reference/api-requests.md#storage-jwt).

The response types `FileInfo` (with `lastModified` as an ISO string) and
`UploadFilesResult` are declared in `storage.schema.ts`. Client code imports
them type-only from `@groot/core/storage/storage.schema`: the barrel's import
graph reaches server middleware that the client tsconfig cannot type.

## Runtime notes

- **Node**: files live under `./local/uploads` relative to the working
  directory (git-ignored). In production they default to `/data/uploads`, next
  to the SQLite file (`uploadsRoot(env)` in `@groot/core/storage/node`); set
  `UPLOADS_DIR` to use another folder.
- **Workers**: the `STORAGE` R2 binding in `wrangler.jsonc`. Bucket bindings
  have no signed URLs, so downloads always stream through the API. Free-plan
  quotas are in
  [Deploying on Cloudflare Workers](../guides/deploy-cloudflare.md#free-plan-limits-that-shaped-the-design).
- **Tests**: `memoryStorage()`; nothing touches the disk outside the adapter contract suite.

## Frontend

`packages/shell/src/pages/storage/` renders the `/storage` page (breadcrumbs,
multi-file upload into the open folder, folder dialog, rename, delete). The
React Query hooks are in `pages/storage/hooks/useStorage.ts`:
`useStorageFiles(folder)`, `useUploadFiles()` (takes `{ files, folder }` and
sends one request), `useDeleteFiles()`, `useCreateFolder()`,
`useDeleteFolder()` and `useRenameFile()`. Every mutation invalidates the
`["storage"]` queries.

## Troubleshooting

- **429** — rate limits; tune `config.rateLimits.storage` / `.upload`. On
  Workers with the `STORAGE_RATE_LIMITER` / `UPLOAD_RATE_LIMITER` bindings, the
  binding's own limit applies instead.
- **413 on upload** — larger than 100 MB (`MAX_UPLOAD_BYTES` in `storage.routes.ts`).
- **"Storage is not configured"** — the entry did not pass `storage` to
  `bootstrap()`; on Workers that means the `STORAGE` binding is missing.
- **Download prints binary** — it streams raw bytes; use `curl -o file`.
