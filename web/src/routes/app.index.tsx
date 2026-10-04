// Overview: stats + site cards + add-site form.
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Globe, Plus, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import type { Site, Team } from '../lib/types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';

export const Route = createFileRoute('/app/')({ component: Overview });

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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {sites.length} site{sites.length === 1 ? '' : 's'} monitored
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); addSite.mutate(); }}
        className="flex flex-wrap items-center gap-2"
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Site name" required className="flex-1 min-w-40" />
        <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" required className="flex-1 min-w-40" />
        <Button type="submit" pending={addSite.isPending}>
          <Plus /> Add site
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          description="Add your first site above — you'll get an embed snippet and can import a sitemap for suggestions."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sites.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="size-4 text-muted-foreground" /> {s.name}
                </CardTitle>
                <CardDescription>{s.domain}</CardDescription>
                <CardAction>
                  <Link to="/app/sites/$siteId" params={{ siteId: s.id }}>
                    <Button variant="ghost" size="sm">
                      Open <ArrowRight />
                    </Button>
                  </Link>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
