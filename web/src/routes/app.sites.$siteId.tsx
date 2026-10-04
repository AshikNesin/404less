// Site detail: install snippet, stats, top broken URLs, recent events, exclusions, notify settings.
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Site } from '../lib/types';

export const Route = createFileRoute('/app/sites/$siteId')({
  component: SiteDetail,
});

function useSite(siteId: string) {
  return useQuery({
    queryKey: ['sites'],
    queryFn: () => api<{ sites: Site[] }>('/api/sites'),
    select: (d) => d.sites.find((s) => s.id === siteId),
  });
}

function SiteDetail() {
  const { siteId } = Route.useParams();
  const site = useSite(siteId).data;
  const qc = useQueryClient();
  const [excl, setExcl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const top = useQuery({
    queryKey: ['top', siteId],
    queryFn: () => api<{ results: { url: string; hits: number; last_seen: number }[] }>(`/api/sites/${siteId}/top`),
  });
  const events = useQuery({
    queryKey: ['events', siteId],
    queryFn: () => api<{ events: import('../lib/types').Event[] }>(`/api/sites/${siteId}/events?limit=20`),
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/sites/${siteId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  });
  const importSitemap = useMutation({
    mutationFn: () => api<{ imported: number }>(`/api/sites/${siteId}/import-sitemap`, { method: 'POST', body: '{}' }),
    onMutate: () => { setImporting(true); setImportMsg(''); },
    onSettled: () => setImporting(false),
    onSuccess: (d) => setImportMsg(`Imported ${d.imported} URLs`),
    onError: (e: Error) => setImportMsg(e.message),
  });

  if (!site) return <p className="text-sm text-slate-500">Loading…</p>;
  const origin = window.location.origin;

  async function addExclusion(e: React.FormEvent) {
    e.preventDefault();
    if (!excl.trim()) return;
    const next = [...site!.exclude_patterns, excl.trim()];
    await patch.mutateAsync({ exclude_patterns: next });
    setExcl('');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/app" className="text-xs text-slate-400 hover:text-slate-600">← Overview</Link>
          <h1 className="text-xl font-semibold">{site.name} <span className="text-sm font-normal text-slate-400">{site.domain}</span></h1>
        </div>
        <div className="flex gap-2">
          <a href={`/api/sites/${siteId}/events.csv`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">CSV</a>
          <a href={`/api/sites/${siteId}/events.csv?group=url`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">CSV (grouped)</a>
        </div>
      </div>

      {/* Install */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-medium">Install</h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {`<script src="${origin}/embed.js" data-site="${site.site_key}" defer></script>`}
          </code>
          <CopyButton text={`<script src="${origin}/embed.js" data-site="${site.site_key}" defer></script>`} />
        </div>
        <button
          onClick={() => importSitemap.mutate()}
          disabled={importing}
          className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {importing ? 'Importing…' : 'Import sitemap'}
        </button>
        {importMsg && <span className="ml-3 text-sm text-slate-500">{importMsg}</span>}
      </section>

      {/* Top broken */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-medium">Top broken URLs</h2>
        {top.data?.results?.length ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400"><th className="pb-2">URL</th><th className="pb-2">Hits</th><th className="pb-2">Last seen</th></tr></thead>
            <tbody>
              {top.data.results.map((r) => (
                <tr key={r.url} className="border-t border-slate-100">
                  <td className="py-1.5 pr-4 text-blue-700"><a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></td>
                  <td className="py-1.5 pr-4">{r.hits}</td>
                  <td className="py-1.5 text-slate-500">{new Date(r.last_seen).toISOString().slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-slate-400">No 404s recorded yet.</p>}
      </section>

      {/* Recent events */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-medium">Recent events</h2>
        {events.data?.events?.length ? (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400"><th className="pb-2">URL</th><th className="pb-2">Referrer</th><th className="pb-2">When</th></tr></thead>
            <tbody>
              {events.data.events.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="max-w-[320px] truncate py-1.5 pr-4">{e.url}</td>
                  <td className="max-w-[220px] truncate py-1.5 pr-4 text-slate-500">{e.referrer ?? '—'}</td>
                  <td className="py-1.5 text-slate-500">{new Date(e.ts).toISOString().slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-slate-400">Nothing yet.</p>}
      </section>

      {/* Settings */}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium">Exclusions</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {site.exclude_patterns.length === 0 && <span className="text-sm text-slate-400">None</span>}
            {site.exclude_patterns.map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-0.5 text-xs">
                {p}
                <button className="text-slate-400 hover:text-red-600"
                  onClick={() => patch.mutate({ exclude_patterns: site.exclude_patterns.filter((x) => x !== p) })}>×</button>
              </span>
            ))}
          </div>
          <form onSubmit={addExclusion} className="flex gap-2">
            <input value={excl} onChange={(e) => setExcl(e.target.value)} placeholder="/wp-admin/* or substring"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
            <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">Add</button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-medium">Notifications</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={site.notify_enabled !== 0}
              onChange={(e) => patch.mutate({ notify_enabled: e.target.checked })} />
            Send alerts for this site
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            Digest window
            <select value={String(site.digest_minutes || 15)}
              onChange={(e) => patch.mutate({ digest_minutes: Number(e.target.value) })}
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm">
              <option value="15">15 min</option>
              <option value="60">60 min</option>
              <option value="360">6 hours</option>
              <option value="1440">daily</option>
            </select>
          </label>
          <Link to="/app/settings/channels" className="mt-4 inline-block text-sm text-blue-700 hover:underline">
            Manage channels →
          </Link>
        </section>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}
