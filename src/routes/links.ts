// Authenticated: broken-link triage for one site. Thin: parse → service → status code.
import { Hono } from 'hono';
import { siteForUser } from '../server/features/sites/service';
import {
  getLink, LINK_STATUSES, listLinks, recheckLink, setLinkStatus,
  type LinkStatus, type ListQuery,
} from '../server/features/links/service';
import type { Env } from '../types';

export const links = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

function parseList(q: Record<string, string | undefined>): ListQuery {
  const status = (LINK_STATUSES as readonly string[]).includes(q.status ?? '') ? (q.status as LinkStatus) : q.status === 'all' ? 'all' : 'open';
  const source = q.source === 'visitor' || q.source === 'crawler' ? q.source : undefined;
  const sort = q.sort === 'first_seen' || q.sort === 'last_seen' ? q.sort : 'hits';
  const page = Math.max(1, Math.floor(Number(q.page ?? 1)) || 1);
  const limit = Math.min(Math.max(1, Math.floor(Number(q.limit ?? 25)) || 25), 100);
  const search = q.q?.trim().slice(0, 200) || undefined;
  return { status, source, sort, page, limit, q: search };
}

links.get('/sites/:id/links', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);
  return c.json(await listLinks(c.env, site.site.id, parseList(c.req.query())));
});

// CSV of the current filter (same params as the list; up to 5000 rows)
links.get('/sites/:id/links.csv', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);
  const q = parseList(c.req.query());
  const { links: rows } = await listLinks(c.env, site.site.id, { ...q, page: 1, limit: 5000 });
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : '');
  const header = 'url,status,source,hits,http_status,first_seen,last_seen,found_on,suggested_url';
  const body = rows.map((r) =>
    [r.url, r.status, r.source, r.hits, r.http_status ?? '', iso(r.first_seen), iso(r.last_seen), r.found_on ?? '', r.suggested_url ?? ''].map(esc).join(','),
  ).join('\n');
  return c.body(`${header}\n${body}\n`, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="404less-${site.site.domain}-${q.status}-links.csv"`,
  });
});

links.get('/sites/:id/links/:linkId', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);
  const detail = await getLink(c.env, site.site.id, c.req.param('linkId'));
  if (!detail) return c.json({ error: 'not found' }, 404);
  return c.json(detail);
});

// bulk status change: { ids: string[], status: open|resolved|ignored }
links.patch('/sites/:id/links', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);
  const body = await c.req.json().catch(() => ({}));
  const ids: unknown = body?.ids;
  const status = body?.status;
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every((x) => typeof x === 'string')) {
    return c.json({ error: 'ids must be 1..100 strings' }, 400);
  }
  if (!(LINK_STATUSES as readonly string[]).includes(status)) return c.json({ error: 'status must be open|resolved|ignored' }, 400);
  const changed = await setLinkStatus(c.env, site.site.id, ids as string[], status as LinkStatus);
  return c.json({ ok: true, changed });
});

// re-check one URL now (outbound fetch; applies the result like a crawl)
links.post('/sites/:id/links/:linkId/check', async (c) => {
  const site = await siteForUser(c.env, c.req.param('id'), c.get('userId'));
  if ('error' in site) return c.json({ error: site.error }, site.status as 403 | 404);
  const result = await recheckLink(c.env, site.site, c.req.param('linkId'));
  if (!result) return c.json({ error: 'not found' }, 404);
  return c.json(result);
});
