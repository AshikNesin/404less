// Minimal robots.txt parser (RFC 9309 subset): collects Disallow rules per
// user-agent group, preferring our agent (404less-bot) over * when present.
export type Robots = { allowed: (path: string) => boolean };

const OUR_AGENT = '404less-bot';

export function parseRobots(origin: string, body: string): Robots {
  const groups = new Map<string, string[]>();
  let currentAgents: string[] = [];
  let sawRule = false; // any rule directive since the last user-agent line?

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      // consecutive user-agent lines extend the group; after a rule, a new group starts
      if (sawRule) {
        currentAgents = [];
        sawRule = false;
      }
      if (value) currentAgents.push(value.toLowerCase());
      continue;
    }
    if (key !== 'disallow' || !currentAgents.length) continue;

    sawRule = true;
    for (const agent of currentAgents) {
      const set = groups.get(agent) ?? [];
      if (value === '') set.length = 0; // empty Disallow => allow everything for this group
      else set.push(value);
      groups.set(agent, set);
    }
  }

  const rules = groups.has(OUR_AGENT) ? groups.get(OUR_AGENT)! : (groups.get('*') ?? []);
  const abs = (v: string) => {
    try {
      return new URL(v, origin).toString();
    } catch {
      return v;
    }
  };
  const prefixes = rules.map(abs);

  return {
    allowed(path: string) {
      const p = path.startsWith('/') ? abs(path) : path;
      return !prefixes.some((d) => p.startsWith(d));
    },
  };
}

/** Fetch + parse robots.txt; failure => allow-all (standard behavior). */
export async function loadRobots(origin: string): Promise<Robots> {
  const UA = '404less-bot/0.1 (+https://404less.dev)';
  try {
    const res = await fetch(new URL('/robots.txt', origin).toString(), {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { allowed: () => true };
    return parseRobots(origin, await res.text());
  } catch {
    return { allowed: () => true };
  }
}
