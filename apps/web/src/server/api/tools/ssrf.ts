// Public URL checks run on our Worker, so a visitor can ask us to fetch.
// Only public http(s) hosts, on a small set of ports, and only after DNS
// answers with public addresses. Redirects are checked one hop at a time by
// the caller (redirect: "manual"); each hop comes back through here.
import { AsyncLocalStorage } from "node:async_hooks";

export const CRAWLER_UA = "404less-bot/0.1 (+https://404less.com)";

const ALLOWED_PORTS = new Set(["80", "443", "8080", "8443"]);

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google",
  "metadata.google.internal",
  "instance-data",
  "kubernetes",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_SUFFIXES = [
  ".local",
  ".localhost",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".home.arpa",
  ".corp",
];

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export class FetchBudgetSpent extends Error {
  constructor() {
    super("fetch budget spent");
    this.name = "FetchBudgetSpent";
  }
}

type Budget = { left: number };
const budget = new AsyncLocalStorage<Budget>();

/** Cap outbound fetches for one public-tool request (Workers Free allows 50). */
export function withFetchBudget<T>(limit: number, fn: () => Promise<T>): Promise<T> {
  return budget.run({ left: limit }, fn);
}

function takeBudget(): void {
  const current = budget.getStore();
  if (!current) return;
  if (current.left <= 0) throw new FetchBudgetSpent();
  current.left -= 1;
}

const publicHosts = new Map<string, number>();

export function clearPublicHostCache(): void {
  publicHosts.clear();
}

/** Syntax and address checks only. Does not resolve DNS. */
export function parsePublicUrl(raw: string): URL {
  if (typeof raw !== "string" || raw.length > 2000 || raw.includes("\\")) {
    throw new UnsafeUrlError("Enter a full http or https URL.");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("Enter a full URL, including https://.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with a username or password are not checked.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs can be checked.");
  }
  if (url.port && !ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeUrlError("Only ports 80, 443, 8080 and 8443 can be checked.");
  }
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  assertHostname(host);
  url.hostname = host;
  return url;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = parsePublicUrl(raw);
  await ensurePublicHost(url.hostname);
  return url;
}

export async function ensurePublicHost(host: string): Promise<void> {
  assertHostname(host);
  if (host.includes(":") || ipv4(host)) return;
  const until = publicHosts.get(host);
  if (until && until > Date.now()) return;
  const ips = await resolveIps(host);
  if (!ips.length || ips.some((ip) => isPrivateIp(ip))) {
    throw new UnsafeUrlError("That hostname does not point at a public address.");
  }
  publicHosts.set(host, Date.now() + 60_000);
}

export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const parsed = parsePublicUrl(url);
  await ensurePublicHost(parsed.hostname);
  takeBudget();
  const headers = new Headers(init?.headers);
  if (!headers.has("user-agent")) headers.set("User-Agent", CRAWLER_UA);
  return fetch(parsed.toString(), { ...init, headers, redirect: "manual" });
}

/** Read at most `max` bytes, then cancel the rest. */
export async function readLimited(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  try {
    while (read < max) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      read += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(Math.min(read, max));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, buf.length - offset);
    if (take <= 0) break;
    buf.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder().decode(buf);
}

function assertHostname(host: string): void {
  if (!host || host.length > 253) throw new UnsafeUrlError("That hostname is not allowed.");
  if (
    BLOCKED_HOSTS.has(host) ||
    BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix) || host === suffix.slice(1))
  ) {
    throw new UnsafeUrlError("That host is not a public website.");
  }
  if (/^\d+$/.test(host) || host.includes("0x")) {
    throw new UnsafeUrlError("That address is not allowed.");
  }
  if (host.includes(":")) {
    if (isPrivateIp(host)) throw new UnsafeUrlError("That address is not a public website.");
    return;
  }
  const labels = host.split(".");
  if (labels.every((label) => /^\d+$/.test(label))) {
    if (labels.length !== 4 || labels.some((label) => label.length > 1 && label.startsWith("0"))) {
      throw new UnsafeUrlError("That address is not allowed.");
    }
    if (isPrivateIp(host)) throw new UnsafeUrlError("That address is not a public website.");
    return;
  }
  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)
  ) {
    throw new UnsafeUrlError("That hostname is not allowed.");
  }
}

export function isPrivateIp(ip: string): boolean {
  const v4mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4mapped) return isPrivateV4(v4mapped[1]);
  if (ipv4(ip)) return isPrivateV4(ip);
  const v6 = expandIpv6(ip);
  if (!v6) return true;
  if (v6 === "0000:0000:0000:0000:0000:0000:0000:0000") return true;
  if (v6 === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  const mapped = /^0000:0000:0000:0000:0000:ffff:([0-9a-f]{4}):([0-9a-f]{4})$/.exec(v6);
  if (mapped) {
    const n = (Number.parseInt(mapped[1], 16) << 16) | Number.parseInt(mapped[2], 16);
    return isPrivateV4int(n >>> 0);
  }
  const first = Number.parseInt(v6.slice(0, 4), 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (v6.startsWith("2001:0db8:")) return true; // documentation
  if (v6.startsWith("2001:0002:")) return true;
  return false;
}

function ipv4(ip: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  return isPrivateV4int(n);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateV4int(n: number): boolean {
  const inNet = (start: number, mask: number) => (n & mask) === (start & mask);
  return (
    inNet(0x00000000, 0xff000000) || // 0.0.0.0/8
    inNet(0x0a000000, 0xff000000) || // 10/8
    inNet(0x7f000000, 0xff000000) || // 127/8
    inNet(0xa9fe0000, 0xffff0000) || // 169.254/16
    inNet(0xac100000, 0xfff00000) || // 172.16/12
    inNet(0xc0a80000, 0xffff0000) || // 192.168/16
    inNet(0x64400000, 0xffc00000) || // 100.64/10
    inNet(0xc0000000, 0xffffff00) || // 192.0.0.0/24
    inNet(0xc0000200, 0xffffff00) || // 192.0.2.0/24
    inNet(0xc6120000, 0xfffe0000) || // 198.18.0.0/15
    inNet(0xc6336400, 0xffffff00) || // 198.51.100.0/24
    inNet(0xcb007100, 0xffffff00) || // 203.0.113.0/24
    inNet(0xe0000000, 0xf0000000) || // 224/4
    inNet(0xf0000000, 0xf0000000) || // 240/4
    n === 0xffffffff
  );
}

export function expandIpv6(input: string): string | null {
  const ip = input.toLowerCase();
  if (ip.includes("%")) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (
    head.some((g) => !/^[0-9a-f]{0,4}$/.test(g)) ||
    tail.some((g) => !/^[0-9a-f]{0,4}$/.test(g))
  ) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array.from({ length: Math.max(0, missing) }, () => "0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, "0")).join(":");
}

async function resolveIps(host: string): Promise<string[]> {
  const [v4, v6] = await Promise.all([doh(host, "A"), doh(host, "AAAA")]);
  return [...v4, ...v6];
}

async function doh(host: string, type: "A" | "AAAA"): Promise<string[]> {
  takeBudget();
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      redirect: "manual",
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    throw new UnsafeUrlError("Could not resolve that hostname.");
  }
  if (!res.ok || res.status >= 300) {
    await res.body?.cancel().catch(() => {});
    throw new UnsafeUrlError("Could not resolve that hostname.");
  }
  const data = (await res.json().catch(() => null)) as {
    Status?: number;
    Answer?: { type?: number; data?: string }[];
  } | null;
  if (!data || data.Status === 3) return [];
  if (data.Status !== 0 && data.Status !== undefined) return [];
  const want = type === "A" ? 1 : 28;
  return (data.Answer ?? [])
    .filter((answer) => answer.type === want && typeof answer.data === "string")
    .map((answer) => answer.data as string);
}
