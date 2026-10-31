import { storage } from "./storage";
import { Boom } from "../errors";
import type { StorageBody } from "./adapter";
import type { FileInfo, UploadFilesResult } from "./storage.schema";

// Declared in the schema module (zod-only) so the client can import the wire
// types without dragging the service's server graph along.
export type { FileInfo, UploadFilesResult };

/**
 * One folder level under `folder` (`""` for the root, otherwise ending in
 * `/`): sub-folders first, then files, each sorted by name. Folders are the
 * adapter's common prefixes.
 */
export async function listFiles({ folder }: { folder: string }): Promise<FileInfo[]> {
  const directories: FileInfo[] = [];
  const files: FileInfo[] = [];

  let cursor: string | undefined;
  do {
    const page = await storage.list({ prefix: folder, delimiter: "/", cursor });
    for (const dirKey of page.prefixes) {
      directories.push({
        key: dirKey,
        name: dirKey.slice(folder.length, -1),
        size: 0,
        lastModified: new Date(0).toISOString(),
        isDirectory: true,
      });
    }
    for (const object of page.objects) {
      files.push({
        key: object.key,
        name: object.key.slice(folder.length),
        size: object.size,
        lastModified: (object.lastModified ?? new Date(0)).toISOString(),
        isDirectory: false,
      });
    }
    cursor = page.cursor;
  } while (cursor);

  return [...directories, ...files].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function uploadFile(params: {
  filePath: string;
  fileData: StorageBody;
  contentType?: string;
}): Promise<{ filePath: string }> {
  if (!params.filePath) throw Boom.badRequest("File path is required");
  const object = await storage.put(params.filePath, params.fileData, {
    contentType: params.contentType,
  });
  return { filePath: object.key };
}

/** Upload several files; one failure does not stop the others. */
export async function uploadFiles(params: {
  files: Array<{ filePath: string; fileData: StorageBody; contentType?: string }>;
}): Promise<UploadFilesResult> {
  const results = await Promise.allSettled(params.files.map((file) => uploadFile(file)));
  const uploadedFiles: string[] = [];
  const failedFiles: Array<{ filePath: string; error: string }> = [];
  results.forEach((result, index) => {
    const filePath = params.files[index]!.filePath;
    if (result.status === "fulfilled") uploadedFiles.push(result.value.filePath);
    else
      failedFiles.push({
        filePath,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
  });
  return { uploadedFiles, failedFiles };
}

export async function downloadFile(params: { filePath: string }): Promise<{
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  fileName: string;
}> {
  const found = await storage.get(params.filePath);
  if (!found) throw Boom.notFound(`File not found: ${params.filePath}`);
  return {
    bytes: found.bytes,
    contentType: found.object.contentType,
    fileName: params.filePath.split("/").pop() ?? "file",
  };
}

/** Delete the given files; missing ones are ignored. */
export async function deleteFiles(params: { filePaths: string[] }): Promise<void> {
  await storage.delete(params.filePaths);
}

/** Folder paths end with `/` (`folderPathSchema` normalises them at the edge). */
export async function createFolder({
  folderPath,
}: {
  folderPath: string;
}): Promise<{ folderPath: string }> {
  await storage.put(`${folderPath}.keep`, "", { contentType: "text/plain" });
  return { folderPath };
}

/**
 * Delete every object under the folder prefix (ending with `/`). `deletedCount`
 * is how many were listed and removed.
 */
export async function deleteFolder({
  folderPath,
}: {
  folderPath: string;
}): Promise<{ deletedCount: number }> {
  let deletedCount = 0;
  let cursor: string | undefined;
  do {
    const page = await storage.list({ prefix: folderPath, cursor });
    if (page.objects.length) {
      await storage.delete(page.objects.map((o) => o.key));
      deletedCount += page.objects.length;
    }
    cursor = page.cursor;
  } while (cursor);
  return { deletedCount };
}

export async function copyFile(params: {
  oldPath: string;
  newPath: string;
}): Promise<{ newPath: string }> {
  if (!(await storage.head(params.oldPath))) {
    throw Boom.notFound(`Source file not found: ${params.oldPath}`);
  }
  await storage.copy(params.oldPath, params.newPath);
  return { newPath: params.newPath };
}

export async function renameFile(params: {
  oldPath: string;
  newPath: string;
}): Promise<{ newPath: string }> {
  // Renaming onto itself: copying succeeds, then deleting the "old" path would
  // remove the only copy. Keep the 404 contract for a missing source.
  if (params.oldPath === params.newPath) {
    if (!(await storage.head(params.oldPath))) {
      throw Boom.notFound(`Source file not found: ${params.oldPath}`);
    }
    return { newPath: params.newPath };
  }
  await copyFile(params);
  await storage.delete([params.oldPath]);
  return { newPath: params.newPath };
}
