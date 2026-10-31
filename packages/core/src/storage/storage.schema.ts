import { z } from "zod";

/**
 * One entry of `GET /storage/files`, typed as it arrives over JSON:
 * `lastModified` is an ISO string, not a `Date`. Declared in this zod-only
 * module so the client can import it (type-only) without pulling in the
 * service's server graph.
 */
export interface FileInfo {
  key: string;
  name: string;
  size: number;
  /** ISO string (JSON has no `Date`). */
  lastModified: string;
  isDirectory: boolean;
}

/** Result of `POST /storage/files/upload`: one failure does not fail the rest. */
export interface UploadFilesResult {
  uploadedFiles: string[];
  failedFiles: Array<{ filePath: string; error: string }>;
}

/** Most files one upload request accepts. */
export const MAX_UPLOAD_FILES = 50;

const isSegment = (segment: string) =>
  segment !== "" && segment !== "." && segment !== ".." && !segment.includes("\\");

const isKey = (path: string) => path.split("/").every(isSegment);

/** An uploaded file's name: exactly one key segment (no `/`, `.`, `..` or `\\`). */
const isFileName = (name: string) => !name.includes("/") && isSegment(name);

/** An object key such as `docs/report.pdf`: no leading, trailing or doubled `/`, no `.` or `..`. */
export const filePathSchema = z
  .string()
  .min(1, "File path is required")
  .refine(isKey, "Invalid file path");

/**
 * A folder prefix, normalised once here so every route and service sees the
 * same shape: `""` for the root, otherwise `a/b/`. Surrounding slashes are
 * optional on input.
 */
export const folderPathSchema = z
  .string()
  .transform((value) => value.replace(/^\/+|\/+$/g, ""))
  .refine((value) => value === "" || isKey(value), "Invalid folder path")
  .transform((value) => (value ? `${value}/` : ""));

const requiredFolderPathSchema = folderPathSchema.refine(Boolean, "Folder path is required");

export const listFilesSchema = z.object({
  folder: folderPathSchema.default(""),
});

export const uploadFilesSchema = z.object({
  file: z.preprocess(
    (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
    z
      .array(z.instanceof(File).refine((file) => isFileName(file.name), "Invalid file name"))
      .min(1, "No file uploaded")
      .max(MAX_UPLOAD_FILES, `At most ${MAX_UPLOAD_FILES} files per upload`),
  ),
  folder: folderPathSchema.default(""),
});

export const downloadFileSchema = z.object({
  filePath: filePathSchema,
});

export const deleteFilesSchema = z.object({
  filePaths: z.array(filePathSchema).min(1, "At least one file path is required"),
});

export const createFolderSchema = z.object({
  folderPath: requiredFolderPathSchema,
});

export const deleteFolderSchema = z.object({
  folderPath: requiredFolderPathSchema,
});

export const renameFileSchema = z.object({
  oldPath: filePathSchema,
  newPath: filePathSchema,
});
