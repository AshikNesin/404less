// Notification channels: list / add / toggle / test / remove.
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { api } from '../lib/api';
import type { Channel, Team } from '../lib/types';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Badge } from '../components/ui/badge';

export const Route = createFileRoute('/app/settings/channels')({ component: ChannelsPage });

function ChannelsPage() {
  const qc = useQueryClient();
  const [type, setType] = useState<'slack' | 'pushover' | 'email'>('slack');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState<string | null>(null);

  const { data: teamsData } = useQuery({ queryKey: ['teams'], queryFn: () => api<{ teams: Team[] }>('/api/teams') });
  const teamId = teamsData?.teams?.[0]?.id;
  const { data: chansData, refetch } = useQuery({
    queryKey: ['channels', teamId],
    queryFn: () => api<{ channels: Channel[] }>(`/api/teams/${teamId}/channels`),
    enabled: !!teamId,
  });
  const channels = chansData?.channels ?? [];

  const add = useMutation({
    mutationFn: async () => {
      const config =
        type === 'slack' ? { url: value } :
        type === 'email' ? { to: value } :
        (() => { const [token, user] = value.split(':'); return { token, user }; })();
      return api(`/api/teams/${teamId}/channels`, { method: 'POST', body: JSON.stringify({ type, config }) });
    },
    onSuccess: () => { setValue(''); setError(''); refetch(); },
    onError: (e: Error) => setError(e.message),
  });

  async function test(id: string) {
    setTesting(id); setTestMsg('');
    try {
      const r = await api<{ ok?: boolean; error?: string }>(`/api/teams/${teamId}/channels/${id}/test`, { method: 'POST', body: '{}' });
      setTestMsg(r.ok ? 'Test sent — check the channel' : `Failed: ${r.error}`);
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">Where 404 digests and crawl-failure alerts are sent.</p>
      </div>

      {channels.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No channels yet"
          description="Add a Slack webhook, Pushover token, or email address below."
        />
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => (
            <Card key={ch.id} size="sm">
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-2">
                  <Badge tone="info">{ch.type}</Badge> {ch.name}
                  {ch.enabled === 0 && <Badge tone="muted">disabled</Badge>}
                </CardTitle>
                <CardAction>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" pending={testing === ch.id} onClick={() => test(ch.id)}>
                      <Send /> Test
                    </Button>
                    <Button variant="outline" size="sm"
                      onClick={() => api(`/api/teams/${teamId}/channels/${ch.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: ch.enabled === 0 }) }).then(() => refetch())}>
                      {ch.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button variant="destructive" size="sm"
                      onClick={() => api(`/api/teams/${teamId}/channels/${ch.id}`, { method: 'DELETE' }).then(() => refetch())}>
                      Remove
                    </Button>
                  </div>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
      {testMsg && <p className="text-sm text-muted-foreground">{testMsg}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Add channel</CardTitle>
          <CardDescription>Slack: webhook URL · Pushover: token:user · Email: address</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="flex flex-wrap gap-2">
            <Select value={type} onChange={(e) => setType(e.target.value as never)}>
              <option value="slack">Slack</option>
              <option value="pushover">Pushover</option>
              <option value="email">Email</option>
            </Select>
            <Input value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'slack' ? 'https://hooks.slack.com/services/…' : type === 'email' ? 'you@example.com' : 'token:user'}
              className="flex-1 min-w-64" />
            <Button type="submit" pending={add.isPending} disabled={!teamId}>Add channel</Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
