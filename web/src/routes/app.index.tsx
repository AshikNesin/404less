// Overview: all sites, add-site form, quick stats.
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { api } from '../lib/api';
import type { Site, Team } from '../lib/types';

export const Route = createFileRoute('/app/')({
  component: Overview,
});

function Overview() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');

  const { data: teamsData } = useQuery({ queryKey: ['teams'], queryFn: () => api<{ teams: Team[] }>('/api/teams') });
  const { data: sitesData } = useQuery({ queryKey: ['sites'], queryFn: () => api<{ sites: Site[] }>('/api/sites') });
  const teams = teamsData?.teams ?? [];
  const sites = sitesData?.sites ?? [];

  const addSite = useMutation({
    mutationFn: async () => {
      let teamId = teams[0]?.id;
      if (!teamId) {
        const t = await api<{ team: Team }>('/api/teams', { method: 'POST', body: JSON.stringify({ name: 'Default' }) });
        teamId = t.team.id;
        await qc.invalidateQueries({ queryKey: ['teams'] });
      }
      return api<{ site: Site }>('/api/sites', { method: 'POST', body: JSON.stringify({ teamId, name, domain }) });
    },
    onSuccess: () => {
      setName(''); setDomain(''); setError('');
      qc.invalidateQueries({ queryKey: ['sites'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Overview</h1>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); addSite.mutate(); }}
        className="flex flex-wrap gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Site name" required
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" required
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        <button disabled={addSite.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Add site
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-4">
        {sites.length === 0 && <p className="text-sm text-slate-500">No sites yet — add your first above.</p>}
        {sites.map((s) => (
          <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <Link to="/app/sites/$siteId" params={{ siteId: s.id }} className="font-medium text-blue-700 hover:underline">
                {s.name}
              </Link>
              <span className="text-sm text-slate-500">{s.domain}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
