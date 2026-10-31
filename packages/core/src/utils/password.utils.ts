import {
  fromBase64Url,
  timingSafeEqual,
  toBase64Url,
  utf8Encode,
  type Bytes,
} from "./encoding.utils";

/**
 * Password hashing with PBKDF2-SHA256 through WebCrypto. Runs identically on
 * Node and Cloudflare Workers (which cap PBKDF2 at 100,000 iterations and
 * budget 10 ms of CPU per request on the free plan, so the count stays there).
 *
 * Stored format: `pbkdf2-sha256$<iterations>$<salt>$<hash>` (base64url).
 */

const ALGORITHM = "pbkdf2-sha256";
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

async function derive(password: string, salt: Bytes, iterations: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", utf8Encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${ALGORITHM}$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterations, salt, hash] = stored.split("$");
  if (algorithm !== ALGORITHM || !iterations || !salt || !hash) return false;
  // a malformed stored hash (bad base64, zero/NaN iterations) is a failed match, not a 500
  try {
    const expected = fromBase64Url(hash);
    const actual = await derive(password, fromBase64Url(salt), Number(iterations));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** True when `stored` was produced with an older iteration count and should be re-hashed. */
export function needsRehash(stored: string): boolean {
  const [algorithm, iterations] = stored.split("$");
  return algorithm !== ALGORITHM || Number(iterations) !== ITERATIONS;
}
