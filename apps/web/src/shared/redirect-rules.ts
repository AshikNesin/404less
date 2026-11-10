// Redirect rules shared by the dashboard snippet and the public generator.
// One place so "301" means the same thing in both: Vercel/Next `permanent: true`
// is 308, and the generator says so instead of silently emitting it.

export type ProductPlatform = "redirects" | "vercel" | "nginx" | "apache" | "nextjs";

/** The one-link snippet on a broken-link page. Output is part of the dashboard. */
export function productRule(platform: ProductPlatform, from: string, to: string): string {
  switch (platform) {
    case "redirects":
      return `# _redirects (Cloudflare Pages / Netlify)\n${from}  ${to}  301`;
    case "vercel":
      return JSON.stringify(
        { redirects: [{ source: from, destination: to, permanent: true }] },
        null,
        2,
      );
    case "nginx":
      return `location = ${from} {\n  return 301 ${to};\n}`;
    case "apache":
      return `# .htaccess\nRedirect 301 ${from} ${to}`;
    case "nextjs":
      return `// next.config.js\nmodule.exports = {\n  async redirects() {\n    return [{ source: ${JSON.stringify(from)}, destination: ${JSON.stringify(to)}, permanent: true }];\n  },\n};\n`;
  }
}

export type Pair = {
  from: string;
  to: string;
  status: number;
  /** Netlify/Cloudflare Pages force flag (`301!`): redirect even if a file exists. */
  force: boolean;
  line: number;
};

export type Issue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  line?: number;
};

export type Detected = "pairs" | "csv" | "netlify" | "vercel";

export type BuiltRules = {
  detected: Detected;
  pairs: Pair[];
  issues: Issue[];
  notes: string[];
  rules: Record<ProductPlatform, string>;
};

const MAX_PAIRS = 500;
const STATUSES = new Set([200, 301, 302, 303, 307, 308, 404]);

const EMPTY_RULES: Record<ProductPlatform, string> = {
  redirects: "",
  vercel: "",
  nginx: "",
  apache: "",
  nextjs: "",
};

export function buildRules(input: string): BuiltRules {
  const text = input.replace(/^\uFEFF/, "").trim();
  if (!text) {
    return {
      detected: "pairs",
      pairs: [],
      issues: [
        {
          severity: "error",
          code: "empty",
          message: "Paste at least one old URL and the URL it should redirect to.",
        },
      ],
      notes: [],
      rules: EMPTY_RULES,
    };
  }
  if (text.startsWith("{") || text.startsWith("[")) return finish(fromVercel(text));
  const lines = text.split(/\r?\n/);
  const content = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (content.length && content.every((l) => l.includes(",") && !/(?:→|->|=>)/.test(l))) {
    return finish(fromCsv(lines));
  }
  return finish(fromWhitespace(lines));
}

function finish(draft: Draft): BuiltRules {
  const pairs = draft.pairs.slice(0, MAX_PAIRS);
  const issues = [...draft.issues];
  if (draft.pairs.length > MAX_PAIRS) {
    issues.push({
      severity: "warning",
      code: "too-many",
      message: `Only the first ${MAX_PAIRS} rules are generated.`,
    });
  }
  issues.push(...validate(pairs));
  const notes: string[] = [];
  if (pairs.some((p) => p.status === 301)) {
    notes.push(
      "Vercel and Next.js send 308 when a rule says permanent: true. The files below set statusCode: 301, so these stay 301s. 308 keeps the HTTP method; 301 lets clients switch POST to GET.",
    );
  }
  if (pairs.some((p) => p.force)) {
    notes.push(
      "The ! force flag (redirect even when a file exists at the old path) only exists in Netlify and Cloudflare Pages _redirects. The other files omit it.",
    );
  }
  return {
    detected: draft.detected,
    pairs,
    issues,
    notes,
    rules: pairs.length ? renderAll(pairs) : EMPTY_RULES,
  };
}

type Draft = { detected: Detected; pairs: Pair[]; issues: Issue[] };

function fromVercel(text: string): Draft {
  const issues: Issue[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      detected: "vercel",
      pairs: [],
      issues: [{ severity: "error", code: "json", message: "That JSON could not be parsed." }],
    };
  }
  const record = Array.isArray(data) ? { redirects: data } : data;
  if (!record || typeof record !== "object") {
    return {
      detected: "vercel",
      pairs: [],
      issues: [
        {
          severity: "error",
          code: "json",
          message: "Expected a vercel.json with a redirects array.",
        },
      ],
    };
  }
  const rec = record as Record<string, unknown>;
  const redirects = Array.isArray(rec.redirects) ? rec.redirects : [];
  const rewrites = Array.isArray(rec.rewrites) ? rec.rewrites : [];
  if (!redirects.length && !rewrites.length) {
    return {
      detected: "vercel",
      pairs: [],
      issues: [
        {
          severity: "error",
          code: "json",
          message: "No redirects or rewrites array in that JSON.",
        },
      ],
    };
  }
  if (!Array.isArray(data)) {
    const extra = Object.keys(rec).filter((k) => k !== "redirects" && k !== "rewrites");
    if (extra.length) {
      issues.push({
        severity: "warning",
        code: "vercel-extra",
        message: `Other vercel.json keys (${extra.join(", ")}) are not copied. Merge the generated redirects into your existing file.`,
      });
    }
  }
  const pairs: Pair[] = [];
  const take = (
    item: unknown,
    statusFrom: (row: Record<string, unknown>) => number,
    line: number,
  ) => {
    if (!item || typeof item !== "object") return;
    const row = item as Record<string, unknown>;
    if (typeof row.source !== "string" || typeof row.destination !== "string") {
      issues.push({
        severity: "error",
        code: "unparsed",
        line,
        message: "A redirect is missing source or destination.",
      });
      return;
    }
    const status = statusFrom(row);
    pushPair(pairs, issues, row.source, row.destination, status, false, line);
  };
  redirects.forEach((item, i) => take(item, (row) => vercelStatus(row, issues, i + 1), i + 1));
  rewrites.forEach((item, i) => take(item, () => 200, redirects.length + i + 1));
  return { detected: "vercel", pairs, issues };
}

function vercelStatus(row: Record<string, unknown>, issues: Issue[], line: number): number {
  if (typeof row.statusCode === "number") return row.statusCode;
  if (row.permanent === true) {
    issues.push({
      severity: "warning",
      code: "permanent-is-308",
      line,
      message:
        "permanent: true is a 308, not a 301. This rule was read as 308. Set statusCode: 301 if you want a 301.",
    });
    return 308;
  }
  if (row.permanent === false) return 307;
  return 308;
}

function fromCsv(lines: string[]): Draft {
  const issues: Issue[] = [];
  const pairs: Pair[] = [];
  const rows: { cells: string[]; line: number }[] = [];
  lines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    rows.push({ cells: splitCsvLine(trimmed), line: i + 1 });
  });
  if (!rows.length) {
    return {
      detected: "csv",
      pairs,
      issues: [{ severity: "error", code: "empty", message: "No rows in that CSV." }],
    };
  }
  let start = 0;
  const header = rows[0].cells.map((c) => c.toLowerCase());
  const fromHeader = header.findIndex((h) => ["from", "source", "old"].includes(h));
  const toHeader = header.findIndex((h) => ["to", "destination", "new", "target"].includes(h));
  let fromIdx = 0;
  let toIdx = 1;
  let statusIdx = 2;
  if (fromHeader >= 0 && toHeader >= 0) {
    start = 1;
    fromIdx = fromHeader;
    toIdx = toHeader;
    statusIdx = header.findIndex((h) => h === "status" || h === "code");
  }
  for (const row of rows.slice(start)) {
    const from = row.cells[fromIdx] ?? "";
    const to = row.cells[toIdx] ?? "";
    if (!from || !to) {
      issues.push({
        severity: "error",
        code: "unparsed",
        line: row.line,
        message: "A row needs both an old URL and a new one.",
      });
      continue;
    }
    const statusCell = statusIdx >= 0 ? row.cells[statusIdx] : undefined;
    const { status, force } = parseStatus(statusCell, 301);
    pushPair(pairs, issues, from, to, status, force, row.line);
  }
  return { detected: "csv", pairs, issues };
}

function fromWhitespace(lines: string[]): Draft {
  const issues: Issue[] = [];
  const pairs: Pair[] = [];
  let detected: Detected = "pairs";
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const arrow = trimmed.match(/^(.*?)(?:\s*(?:→|->|=>)\s*)(.*)$/);
    let fromRaw: string;
    let toRaw: string;
    let statusRaw: string | undefined;
    let condition = false;
    if (arrow && /(?:→|->|=>)/.test(trimmed)) {
      fromRaw = arrow[1].trim();
      const right = arrow[2].trim().split(/\s+/);
      if (right.length > 1 && /^\d{3}!?$/.test(right[right.length - 1])) statusRaw = right.pop();
      toRaw = right.join(" ");
    } else {
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) {
        issues.push({
          severity: "error",
          code: "unparsed",
          line: lineNo,
          message: "Expected “old-url new-url”, or old → new.",
        });
        return;
      }
      fromRaw = parts[0];
      toRaw = parts[1];
      if (parts[2] && /^\d{3}!?$/.test(parts[2])) {
        statusRaw = parts[2];
        detected = "netlify";
        if (parts.length > 3) condition = true;
      } else if (parts.length > 2) {
        condition = true;
        detected = "netlify";
      }
      if (fromRaw.includes(":splat") || toRaw.includes(":splat") || fromRaw.includes("*")) {
        detected = "netlify";
      }
    }
    if (condition) {
      issues.push({
        severity: "warning",
        code: "condition",
        line: lineNo,
        message:
          "Netlify conditions (Country, Language, Role) are not translated. The other formats are unconditional.",
      });
    }
    const { status, force } = parseStatus(statusRaw, 301);
    if (force) detected = "netlify";
    pushPair(pairs, issues, fromRaw, toRaw, status, force, lineNo);
  });
  if (!pairs.length && !issues.length) {
    issues.push({
      severity: "error",
      code: "empty",
      message: "Paste at least one old URL and the URL it should redirect to.",
    });
  }
  return { detected, pairs, issues };
}

function pushPair(
  pairs: Pair[],
  issues: Issue[],
  fromRaw: string,
  toRaw: string,
  status: number,
  force: boolean,
  line: number,
): void {
  const fromEp = endpoint(fromRaw);
  const toEp = endpoint(toRaw);
  for (const ep of [fromEp, toEp]) {
    if (ep.issue) issues.push({ severity: "error", code: "bad-url", line, message: ep.issue });
  }
  if (fromEp.issue || toEp.issue) return;
  if (fromEp.addedSlash) {
    issues.push({
      severity: "warning",
      code: "leading-slash",
      line,
      message: `Added a leading slash: ${fromEp.path}. Redirect sources are paths, not hostnames.`,
    });
  }
  let to = toEp.path;
  if (toEp.absolute && (!fromEp.host || fromEp.host !== toEp.host)) to = toEp.absolute;
  if (!STATUSES.has(status)) {
    issues.push({
      severity: "error",
      code: "status",
      line,
      message: `Status ${status} is not a redirect these platforms share. Use 301, 302, 307 or 308.`,
    });
    return;
  }
  if (/[\s;<>]/.test(fromEp.path) || /[\s;<>]/.test(to)) {
    issues.push({
      severity: "error",
      code: "unsafe",
      line,
      message: "Paths cannot contain spaces, quotes or semicolons.",
    });
    return;
  }
  pairs.push({ from: fromEp.path, to, status, force, line });
}

type Endpoint = {
  path: string;
  host: string | null;
  absolute: string | null;
  addedSlash: boolean;
  issue: string | null;
};

function endpoint(raw: string): Endpoint {
  const trimmed = raw.trim();
  const fail = (issue: string): Endpoint => ({
    path: trimmed,
    host: null,
    absolute: null,
    addedSlash: false,
    issue,
  });
  if (!trimmed) return fail("A rule is missing a URL.");
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return fail(`“${trimmed}” is not a valid URL.`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fail("Only http and https URLs can be redirected.");
    }
    return {
      path: `${url.pathname}${url.search}` || "/",
      host: url.host,
      absolute: url.toString(),
      addedSlash: false,
      issue: null,
    };
  }
  if (trimmed.startsWith("/")) {
    return { path: trimmed, host: null, absolute: null, addedSlash: false, issue: null };
  }
  return { path: `/${trimmed}`, host: null, absolute: null, addedSlash: true, issue: null };
}

function parseStatus(
  raw: string | undefined,
  fallback: number,
): { status: number; force: boolean } {
  if (!raw) return { status: fallback, force: false };
  const force = raw.endsWith("!");
  const n = Number(force ? raw.slice(0, -1) : raw);
  return { status: Number.isFinite(n) ? n : fallback, force };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function validate(pairs: Pair[]): Issue[] {
  const issues: Issue[] = [];
  const seen = new Map<string, number>();
  const directed = new Set(pairs.map((p) => `${p.from}\n${p.to}`));
  let shadows = 0;
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const prev = seen.get(pair.from);
    if (prev !== undefined) {
      issues.push({
        severity: "warning",
        code: "duplicate",
        line: pair.line,
        message: `“${pair.from}” is already redirected on line ${prev}. The first rule wins.`,
      });
    } else seen.set(pair.from, pair.line);

    if (!hasSplat(pair.from) && pair.from === pair.to) {
      issues.push({
        severity: "error",
        code: "loop",
        line: pair.line,
        message: `“${pair.from}” redirects to itself.`,
      });
    }
    if (pair.from !== pair.to && directed.has(`${pair.to}\n${pair.from}`) && pair.from < pair.to) {
      const slash =
        stripSlash(pair.from) === stripSlash(pair.to) &&
        stripSlash(pair.from) === stripSlash(pair.from);
      issues.push({
        severity: "error",
        code: slash ? "slash-loop" : "loop",
        line: pair.line,
        message: slash
          ? `“${pair.from}” and “${pair.to}” redirect to each other. A trailing-slash pair that goes both ways loops.`
          : `“${pair.from}” and “${pair.to}” redirect to each other.`,
      });
    }
    if (slashMismatch(pair.from, pair.to)) {
      issues.push({
        severity: "warning",
        code: "slash-mismatch",
        line: pair.line,
        message: `“${pair.from}” and “${pair.to}” disagree about the trailing slash. Request the other form and this rule misses.`,
      });
    }
    if (hasSplat(pair.from) && !splatForwarded(pair.from, pair.to)) {
      issues.push({
        severity: "warning",
        code: "splat-dropped",
        line: pair.line,
        message: `“${pair.from}” captures the rest of the path, but “${pair.to}” never inserts it. Visitors all land on one URL.`,
      });
    }
    if ((pair.from.includes("?") || pair.to.includes("?")) && !hasSplat(pair.from)) {
      issues.push({
        severity: "warning",
        code: "query",
        line: pair.line,
        message:
          "Query strings do not translate 1:1. Netlify matches them in the path; Vercel needs a has: condition; Nginx only keeps the query when the destination has none.",
      });
    }
    if (pair.status === 200) {
      issues.push({
        severity: "warning",
        code: "rewrite",
        line: pair.line,
        message: `“${pair.from}” is a 200 rewrite, not a redirect. Browsers keep the old URL and search engines do not pass equity. It is omitted from the redirect lists and written as a rewrite where the format has one.`,
      });
    }
    for (let j = i + 1; j < pairs.length && shadows < 12; j++) {
      if (!shadowsPath(pair.from, pairs[j].from)) continue;
      shadows++;
      issues.push({
        severity: "warning",
        code: "shadowed",
        line: pairs[j].line,
        message: `The rule for “${pair.from}” on line ${pair.line} matches “${pairs[j].from}” first. Netlify, Cloudflare Pages, Vercel and Next.js all stop at the first match, so the later rule never runs.`,
      });
    }
  }
  const gaps: string[] = [];
  for (const pair of pairs) {
    if (hasSplat(pair.from) || pair.from === "/" || isAbsolute(pair.from)) continue;
    const other = pair.from.endsWith("/") ? pair.from.slice(0, -1) : `${pair.from}/`;
    if (other === "/" || other === "") continue;
    const covered = pairs.some((p) => p.from === other || shadowsPath(p.from, other));
    if (!covered) gaps.push(other);
  }
  if (gaps.length) {
    const shown = gaps.slice(0, 6).join(", ");
    const more = gaps.length > 6 ? ` and ${gaps.length - 6} more` : "";
    issues.push({
      severity: "warning",
      code: "trailing-slash",
      message: `Nothing matches ${shown}${more}. /about and /about/ are different URLs; a rule for one does not catch the other, which is a common reason Netlify redirects look like they do nothing.`,
    });
  }
  return issues;
}

function slashMismatch(from: string, to: string): boolean {
  if (hasSplat(from) || hasSplat(to) || isAbsolute(to)) return false;
  if (from === "/" || to === "/") return false;
  return from.endsWith("/") !== to.endsWith("/");
}

function stripSlash(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function isAbsolute(path: string): boolean {
  return /^https?:\/\//i.test(path);
}

function hasSplat(path: string): boolean {
  return /:path\*|:splat\*|:splat\b|\*/.test(path);
}

function splatForwarded(from: string, to: string): boolean {
  if (!hasSplat(from)) return true;
  return hasSplat(to) || /\$\d/.test(to);
}

/** Prefix of a splat rule, ending at the wildcard. Null when the path is exact. */
function splatPrefix(path: string): string | null {
  const m = /:path\*|:splat\*|\*/.exec(path);
  if (!m || m.index === undefined) return null;
  return path.slice(0, m.index);
}

function shadowsPath(earlier: string, later: string): boolean {
  const prefix = splatPrefix(earlier);
  if (prefix === null || later === earlier) return false;
  if (later.startsWith(prefix)) return true;
  // Vercel :path* also matches the path with no extra segments.
  return earlier.includes(":path*") && prefix.endsWith("/") && later === prefix.slice(0, -1);
}

function renderAll(pairs: Pair[]): Record<ProductPlatform, string> {
  return {
    redirects: renderRedirects(pairs),
    vercel: renderVercel(pairs),
    nextjs: renderNext(pairs),
    nginx: renderNginx(pairs),
    apache: renderApache(pairs),
  };
}

function renderRedirects(pairs: Pair[]): string {
  const lines = ["# _redirects — Netlify and Cloudflare Pages. The first matching rule wins."];
  for (const pair of pairs) {
    const status = `${pair.status}${pair.force ? "!" : ""}`;
    lines.push(`${toNetlifySource(pair.from)}  ${toNetlifyDest(pair.to)}  ${status}`);
  }
  return lines.join("\n") + "\n";
}

function renderVercel(pairs: Pair[]): string {
  const redirects = pairs
    .filter((p) => p.status !== 200)
    .map((p) => ({
      source: toVercelPath(p.from),
      destination: toVercelPath(p.to),
      statusCode: p.status,
    }));
  const rewrites = pairs
    .filter((p) => p.status === 200)
    .map((p) => ({ source: toVercelPath(p.from), destination: toVercelPath(p.to) }));
  const body: Record<string, unknown> = {};
  if (redirects.length) body.redirects = redirects;
  if (rewrites.length) body.rewrites = rewrites;
  return JSON.stringify(body, null, 2) + "\n";
}

function renderNext(pairs: Pair[]): string {
  const redirects = pairs.filter((p) => p.status !== 200);
  const rewrites = pairs.filter((p) => p.status === 200);
  const row = (p: Pair) =>
    `      { source: ${JSON.stringify(toVercelPath(p.from))}, destination: ${JSON.stringify(toVercelPath(p.to))}, statusCode: ${p.status} },`;
  const blocks = [
    "// next.config.js",
    "// statusCode: 301 stays a 301. permanent: true would send 308 instead.",
    "module.exports = {",
  ];
  if (redirects.length) {
    blocks.push("  async redirects() {", "    return [", ...redirects.map(row), "    ];", "  },");
  }
  if (rewrites.length) {
    blocks.push(
      "  async rewrites() {",
      "    return [",
      ...rewrites.map(
        (p) =>
          `      { source: ${JSON.stringify(toVercelPath(p.from))}, destination: ${JSON.stringify(toVercelPath(p.to))} },`,
      ),
      "    ];",
      "  },",
    );
  }
  blocks.push("};", "");
  return blocks.join("\n");
}

function renderNginx(pairs: Pair[]): string {
  const lines = [
    "# Exact locations (=) beat prefixes. Regex locations are first-match, in this order.",
  ];
  for (const pair of pairs) {
    if (pair.status === 200 || pair.status === 404) {
      lines.push(`# ${pair.status === 200 ? "rewrite" : "gone"}: ${pair.from} → ${pair.to}`);
      continue;
    }
    const code = pair.status;
    if (!hasSplat(pair.from)) {
      const dest = nginxReturn(pair.to);
      lines.push(`location = ${pair.from} {`, `  return ${code} ${dest};`, "}", "");
      continue;
    }
    const pattern = nginxPattern(pair.from);
    const dest = nginxReturn(replaceSplats(pair.to, (n) => `$${n}`));
    lines.push(`location ~ ${pattern} {`, `  return ${code} ${dest};`, "}", "");
  }
  return lines.join("\n").replace(/\n+$/, "\n");
}

function renderApache(pairs: Pair[]): string {
  const lines = [
    "# RedirectMatch is anchored, so /old does not also catch /old/page.",
    "# A plain `Redirect` directive is prefix-based and will.",
  ];
  for (const pair of pairs) {
    if (pair.status === 200 || pair.status === 404) {
      lines.push(
        `# ${pair.status === 200 ? "rewrite, not a redirect" : "not a redirect"}: ${pair.from} → ${pair.to}`,
      );
      continue;
    }
    if (!hasSplat(pair.from)) {
      lines.push(`RedirectMatch ${pair.status} ^${escapeRegex(pair.from)}$ ${pair.to}`);
      continue;
    }
    const pattern = nginxPattern(pair.from);
    const dest = replaceSplats(pair.to, (n) => `$${n}`);
    lines.push(`RedirectMatch ${pair.status} ${pattern} ${dest}`);
  }
  return lines.join("\n") + "\n";
}

/** Pass the original query through when the destination doesn't set its own. */
function nginxReturn(dest: string): string {
  if (dest.includes("?")) return dest;
  return `${dest}$is_args$args`;
}

function nginxPattern(path: string): string {
  const token = "\u0000";
  const marked = path
    .replace(/:path\*|:splat\*/g, token)
    .replace(/:splat\b/g, token)
    .replace(/\*/g, token);
  const escaped = marked.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return `^${escaped.replaceAll(token, "(.*)")}$`;
}

function replaceSplats(path: string, replacer: (n: number) => string): string {
  let n = 0;
  return path
    .replace(/:path\*|:splat\*/g, () => replacer(++n))
    .replace(/:splat\b/g, () => replacer(++n))
    .replace(/(^|\/)\*(?=$|\/)/g, (_m, slash: string) => `${slash}${replacer(++n)}`);
}

function toVercelPath(path: string): string {
  return replaceSplats(path, () => ":path*");
}

function toNetlifySource(path: string): string {
  return path.replace(/:path\*/g, "*").replace(/:splat\*/g, "*");
}

function toNetlifyDest(path: string): string {
  return path.replace(/:path\*/g, ":splat").replace(/:splat\*/g, ":splat");
}

function escapeRegex(path: string): string {
  return path.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}
