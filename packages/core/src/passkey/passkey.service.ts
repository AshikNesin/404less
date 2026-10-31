import { Buffer } from "node:buffer";
import { and, desc, eq, count } from "drizzle-orm";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Boom } from "../errors";
import { logger } from "../logger";
import { db, passkeys, type Passkey } from "../database";
import { findUserById, findUserByEmail } from "../auth/auth.service";
import type { SessionUser } from "../auth/auth.schema";
import type { PasskeySummary } from "./passkey.schema";
import { generateToken } from "../utils/jwt.utils";
import { fromBase64Url, utf8Decode } from "../utils/encoding.utils";
import { createNamespaceKv } from "../kv";
import {
  describePasskey,
  generateDeviceName,
  generatePasskeyAuthenticationOptions,
  generatePasskeyRegistrationOptions,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from "./webauthn.utils";

// The wire type lives in passkey.schema; re-exported here so existing imports
// from passkey.service keep working.
export type { PasskeySummary };

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const challengeKv = createNamespaceKv("passkey:challenge");

function toSummary(passkey: Passkey, total: number): PasskeySummary {
  return {
    id: passkey.id,
    credentialName: passkey.credentialName,
    ...describePasskey(passkey),
    backedUp: passkey.backedUp,
    canDelete: total > 1,
    lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
    createdAt: passkey.createdAt.toISOString(),
  };
}

async function countPasskeys(userId: number): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
  return total;
}

async function storeChallenge(challenge: string): Promise<void> {
  await challengeKv.set(challenge, true, CHALLENGE_TTL_MS);
}

/** Challenges are single use: consume on first sight. */
async function consumeChallenge(challenge: string): Promise<boolean> {
  const exists = await challengeKv.has(challenge);
  if (exists) await challengeKv.delete(challenge);
  return exists;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractChallengeFromResponse(response: { response: { clientDataJSON: string } }): string {
  try {
    const clientData = JSON.parse(utf8Decode(fromBase64Url(response.response.clientDataJSON)));
    if (!clientData.challenge) throw Boom.badRequest("Missing challenge in WebAuthn response");
    return clientData.challenge;
  } catch (error) {
    if (Boom.isHttpError(error)) throw error;
    throw Boom.badRequest("Invalid WebAuthn response: malformed clientDataJSON");
  }
}

async function passkeysForUser(userId: number): Promise<Passkey[]> {
  return db
    .select()
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(desc(passkeys.createdAt));
}

export async function generateRegistrationOptions({
  userId,
}: {
  userId: number;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const user = await findUserById(userId);
  if (!user) throw Boom.notFound("User not found");

  const options = await generatePasskeyRegistrationOptions(user, await passkeysForUser(userId));
  await storeChallenge(options.challenge);
  logger.debug({ userId, email: user.email }, "Generated passkey registration options");
  return options;
}

export async function verifyRegistration({
  userId,
  response,
  credentialName,
}: {
  userId: number;
  response: RegistrationResponseJSON;
  credentialName?: string;
}): Promise<PasskeySummary> {
  const challenge = extractChallengeFromResponse(response);
  if (!(await consumeChallenge(challenge))) {
    throw Boom.badRequest("Challenge not found or expired");
  }

  const verification = await verifyPasskeyRegistration(response, challenge).catch(
    (error: unknown) => {
      // Malformed attestation data is a client error, not a server fault.
      throw Boom.badRequest(`Passkey registration verification failed: ${errorMessage(error)}`);
    },
  );
  if (!verification.verified || !verification.registrationInfo) {
    throw Boom.badRequest("Passkey registration verification failed");
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  if (!credential?.id) throw Boom.badRequest("Missing credential ID in registration info");
  if (!credential.publicKey) throw Boom.badRequest("Missing public key in registration info");

  const [existing] = await db
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.credentialId, credential.id))
    .limit(1);
  if (existing) throw Boom.conflict("This passkey is already registered");

  const name =
    credentialName || generateDeviceName(response.authenticatorAttachment, credential.transports);

  const [passkey] = await db
    .insert(passkeys)
    .values({
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter ?? 0,
      deviceType: credentialDeviceType ?? null,
      backedUp: Boolean(credentialBackedUp),
      transports: credential.transports ?? [],
      credentialName: name,
    })
    .returning();

  logger.info({ userId, passkeyId: passkey!.id, credentialName: name }, "Passkey registered");
  return toSummary(passkey!, await countPasskeys(userId));
}

export async function generateAuthenticationOptions({
  email,
}: { email?: string } = {}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  let userPasskeys: Passkey[] = [];
  if (email) {
    const user = await findUserByEmail(email);
    if (user) userPasskeys = await passkeysForUser(user.id);
  }

  const options = await generatePasskeyAuthenticationOptions(userPasskeys);
  await storeChallenge(options.challenge);
  logger.debug({ email }, "Generated passkey authentication options");
  return options;
}

export async function verifyAuthentication({
  response,
}: {
  response: AuthenticationResponseJSON;
}): Promise<{ token: string; user: SessionUser }> {
  const challenge = extractChallengeFromResponse(response);
  if (!(await consumeChallenge(challenge))) {
    throw Boom.badRequest("Challenge not found or expired");
  }

  const [passkey] = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.credentialId, response.id))
    .limit(1);
  if (!passkey) throw Boom.unauthorized("Passkey not found");

  const verification = await verifyPasskeyAuthentication(response, challenge, passkey).catch(
    (error: unknown) => {
      throw Boom.unauthorized(`Passkey authentication verification failed: ${errorMessage(error)}`);
    },
  );
  if (!verification.verified) {
    throw Boom.unauthorized("Passkey authentication verification failed");
  }

  const user = await findUserById(passkey.userId);
  if (!user) throw Boom.unauthorized("User not found");

  await db
    .update(passkeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(passkeys.id, passkey.id));

  const token = await generateToken({ userId: user.id, email: user.email });
  logger.info({ userId: user.id, passkeyId: passkey.id }, "User authenticated with passkey");

  const { password: _password, ...userWithoutPassword } = user;
  return { token, user: userWithoutPassword };
}

export async function listPasskeys({ userId }: { userId: number }): Promise<PasskeySummary[]> {
  const rows = await passkeysForUser(userId);
  return rows.map((passkey) => toSummary(passkey, rows.length));
}

async function findOwnedPasskey(userId: number, passkeyId: number): Promise<Passkey> {
  const [passkey] = await db
    .select()
    .from(passkeys)
    .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)))
    .limit(1);
  if (!passkey) throw Boom.notFound("Passkey not found");
  return passkey;
}

export async function deletePasskey({
  passkeyId,
  userId,
}: {
  passkeyId: number;
  userId: number;
}): Promise<void> {
  await findOwnedPasskey(userId, passkeyId);
  if ((await countPasskeys(userId)) === 1) {
    throw Boom.badRequest("Cannot delete the last passkey. Please add another passkey first.");
  }

  await db.delete(passkeys).where(eq(passkeys.id, passkeyId));
  logger.info({ userId, passkeyId }, "Passkey deleted");
}

export async function updatePasskeyName({
  passkeyId,
  userId,
  credentialName,
}: {
  passkeyId: number;
  userId: number;
  credentialName: string;
}): Promise<PasskeySummary> {
  await findOwnedPasskey(userId, passkeyId);
  const [updated] = await db
    .update(passkeys)
    .set({ credentialName })
    .where(eq(passkeys.id, passkeyId))
    .returning();
  logger.info({ userId, passkeyId, credentialName }, "Passkey renamed");
  return toSummary(updated!, await countPasskeys(userId));
}
