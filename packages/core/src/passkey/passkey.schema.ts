import { z } from "zod";

/** Which authenticator holds a passkey; the client picks the icon from this. */
export type PasskeyKind = "security-key" | "synced" | "device";

/**
 * A passkey as the server presents it over JSON (`GET /passkey/list`,
 * register/verify, `PATCH /passkey/:id`): no key material, no credential id,
 * and dates as ISO strings. This is the wire type the client imports
 * (type-only); `canDelete` is false for a user's last passkey, which the
 * server refuses to delete.
 */
export interface PasskeySummary {
  id: number;
  credentialName: string | null;
  kind: PasskeyKind;
  /** What to call the authenticator, e.g. "Security key (USB)". */
  label: string;
  backedUp: boolean;
  canDelete: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/**
 * Schema for verifying passkey registration
 */
export const verifyRegistrationSchema = z.object({
  response: z.any(), // RegistrationResponseJSON from @simplewebauthn/types
  credentialName: z.string().trim().min(1).max(100).optional(),
});

/**
 * Schema for verifying passkey authentication
 */
export const verifyAuthenticationSchema = z.object({
  response: z.any(), // AuthenticationResponseJSON from @simplewebauthn/types
});

/**
 * Schema for generating authentication options
 */
export const generateAuthenticationOptionsSchema = z.object({
  email: z.email().trim().toLowerCase().optional(),
});

/**
 * Schema for updating passkey name
 */
export const updatePasskeyNameSchema = z.object({
  credentialName: z
    .string()
    .trim()
    .min(1, "Passkey name must not be empty")
    .max(100, "Passkey name must be at most 100 characters"),
});
