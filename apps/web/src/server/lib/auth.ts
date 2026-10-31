// Magic-link auth helpers: token creation/verification + session cookies (HMAC-signed).
// The signing secret is generated once and persisted in app_meta: zero config for
// self-hosters, stable across redeploys, revocable by deleting the row.
import { eq } from "drizzle-orm";
import type { Database } from "@groot/core/database";
import { appMeta, db } from "../db";

export const SESSION_COOKIE = "f404_session";
const SESSION_TTL_S = 60 * 60 * 24 * 30; // 30 days
const SECRET_KEY = "session_secret";

export function now(): number {
  return Date.now();
}

export function newId(): string {
  return crypto.randomUUID();
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newSiteKey(): string {
  // URL-safe, unguessable
  return randomHex(12);
}

export function newApiToken(): string {
  // 404l_ = "404less"; distinctive prefix keeps tokens recognizable and lets
  // secret scanners / pre-checks identify them cheaply.
  return `404l_${randomHex(24)}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bufToHex(buf);
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A random secret generated on first use and persisted in app_meta under `key`;
 * concurrent first calls converge on one value (insert-or-ignore, then re-read).
 * `database` defaults to the app's handle; the Workers boot passes its own
 * because it needs secrets before `bootstrap()` has set groot's `db`.
 */
export async function instanceSecret(key: string, database: Database = db): Promise<string> {
  const read = () =>
    database.select({ value: appMeta.value }).from(appMeta).where(eq(appMeta.key, key)).get();
  const row = await read();
  if (row) return row.value;
  const fresh = randomHex(32);
  await database.insert(appMeta).values({ key, value: fresh }).onConflictDoNothing();
  return (await read())?.value ?? fresh;
}

async function getSessionSecret(): Promise<Uint8Array<ArrayBuffer>> {
  return new TextEncoder().encode(await instanceSecret(SECRET_KEY));
}

export async function signSession(userId: string): Promise<string> {
  const key = await getSessionSecret();
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `${userId}.${exp}`;
  const sig = await hmac(key, payload);
  return `${payload}.${sig}`;
}

export async function verifySession(cookie: string | undefined): Promise<string | null> {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return null;
  const key = await getSessionSecret();
  const expected = await hmac(key, `${userId}.${exp}`);
  if (!timingSafeEqual(sig, expected)) return null;
  return userId;
}

async function hmac(key: Uint8Array<ArrayBuffer>, msg: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg));
  return bufToHex(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
