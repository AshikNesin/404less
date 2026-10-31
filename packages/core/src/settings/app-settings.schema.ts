import { z } from "zod";

export const upsertAppSettingSchema = z.object({
  value: z.unknown(),
  metadata: z
    .object({
      description: z.string().optional(),
    })
    .optional(),
});

export type UpsertAppSettingDTO = z.infer<typeof upsertAppSettingSchema>;

export interface AppSettingMetadata {
  description?: string;
  updatedAt: string;
}

/**
 * One row of `GET /settings`, typed as it arrives over JSON. Declared in this
 * zod-only module so the client can import it (type-only) without pulling in
 * the service's server graph.
 */
export interface AppSetting<T = unknown> {
  key: string;
  value: T;
  metadata?: AppSettingMetadata;
}
