import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@groot/shell/lib/api";
// Leaf module, not the `@groot/core/storage` barrel: the barrel's graph
// reaches the server middlewares (`node:async_hooks`), which the client
// tsconfig has no types for.
import type { FileInfo, UploadFilesResult } from "@groot/core/storage/storage.schema";

/** Aliases of the core wire types in `@groot/core/storage` (type-only
 *  imports, erased at build) — kept under the names clients already import. */
export type StorageFile = FileInfo;
export type UploadResult = UploadFilesResult;

const storageKeys = {
  root: ["storage"] as const,
  files: (folder: string) => [...storageKeys.root, "files", folder] as const,
};

/** One folder level; `folder` is `""` for the root or a path ending with `/`. */
export function useStorageFiles(folder: string) {
  return useQuery({
    queryKey: storageKeys.files(folder),
    queryFn: () => apiClient.get<StorageFile[]>("/storage/files", { folder: folder || undefined }),
  });
}

/** Upload one or many files into `folder` in a single request. */
export function useUploadFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { files: File[]; folder: string }) => {
      const formData = new FormData();
      for (const file of params.files) formData.append("file", file);
      formData.append("folder", params.folder);
      return apiClient.postForm<UploadResult>("/storage/files/upload", formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.root });
    },
  });
}

export function useDeleteFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (filePaths: string[]) => apiClient.delete<void>("/storage/files", { filePaths }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.root });
    },
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderPath: string) =>
      apiClient.post<{ folderPath: string }>("/storage/folders", { folderPath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.root });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderPath: string) =>
      apiClient.delete<{ deletedCount: number }>(
        `/storage/folders/${encodeURIComponent(folderPath)}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.root });
    },
  });
}

export function useRenameFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { oldPath: string; newPath: string }) =>
      apiClient.put<{ newPath: string }>("/storage/files/rename", params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.root });
    },
  });
}
