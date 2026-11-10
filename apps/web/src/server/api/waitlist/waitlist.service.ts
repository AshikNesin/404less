// Cloud-version waitlist. Rows live in the existing kv table (no new migration):
// `waitlist:<email>` → { source, created_at }. Rate-limit buckets are a
// separate prefix so a listing of signups does not include counters.
import { createNamespaceKv } from "@groot/core/kv";
import { sha256Hex } from "../../lib/auth";

const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

export type WaitlistResult = { status: 200; ok: true } | { status: 400 | 429; error: string };

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeSource(raw: unknown): string {
  const source = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return /^[a-z0-9-]{1,32}$/.test(source) ? source : "site";
}

/**
 * Store one signup. A filled honeypot or a cross-origin POST returns the same
 * `{ ok: true }` as a real signup and writes nothing, so a bot learns nothing.
 * Duplicate emails stay on the list once and still answer ok.
 */
export async function joinWaitlist(input: {
  email: unknown;
  source: unknown;
  company: unknown;
  ip: string;
  origin: string | undefined;
  host: string;
}): Promise<WaitlistResult> {
  if (typeof input.company === "string" && input.company.trim()) return { status: 200, ok: true };
  if (input.origin) {
    try {
      if (new URL(input.origin).host !== input.host) return { status: 200, ok: true };
    } catch {
      return { status: 200, ok: true };
    }
  }

  const email = normalizeEmail(input.email);
  if (!email) return { status: 400, error: "Enter a valid email address." };

  const ipHash = (await sha256Hex(input.ip || "unknown")).slice(0, 16);
  const bucket = `${ipHash}:${Math.floor(Date.now() / WINDOW_MS)}`;
  const limits = createNamespaceKv("waitlist-rl");
  const used = (await limits.get<number>(bucket)) ?? 0;
  if (used >= LIMIT) {
    return { status: 429, error: "Too many attempts from this network. Try again in an hour." };
  }
  await limits.set(bucket, used + 1, WINDOW_MS * 2);

  const signups = createNamespaceKv("waitlist");
  if (!(await signups.get(email))) {
    await signups.set(email, { source: normalizeSource(input.source), created_at: Date.now() });
  }
  return { status: 200, ok: true };
}
