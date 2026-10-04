// Notification channels: list / add / toggle / test / remove.
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Channel, Team } from '../lib/types';

export const Route = createFileRoute('/app/settings/channels')({
  component: ChannelsPage,
});

function ChannelsPage() {
  const qc = useQueryClient();
  const [type, setType] = useState<'slack' | 'pushover' | 'email'>('slack');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [testMsg, setTestMsg] = useState('');

  const { data: teamsData } = useQuery({ queryKey: ['teams'], queryFn: () => api<{ teams: Team[] }>('/api/teams') });
  const teamId = teamsData?.teams?.[0]?.id;
  const { data: chansData } = useQuery({
    queryKey: ['channels', teamId],
    queryFn: () => api<{ channels: Channel[] }>(`/api/teams/${teamId}/channels`),
    enabled: !!teamId,
  });

  const add = useMutation({
    mutationFn: async () => {
      const config =
        type === 'slack' ? { url: value } :
        type === 'email' ? { to: value } :
        (() => { const [token, user] = value.split(':'); return { token, user }; })();
      return api(`/api/teams/${teamId}/channels`, { method: 'POST', body: JSON.stringify({ type, config }) });
    },
    onSuccess: () => { setValue(''); setError(''); qc.invalidateQueries({ queryKey: ['channels'] }); },
    onError: (e: Error) => setError(e.message),
  });

  async function test(id: string) {
    setTestMsg('');
    const r = await api<{ ok?: boolean; error?: string }>(`/api/teams/${teamId}/channels/${id}/test`, { method: 'POST', body: '{}' });
    setTestMsg(r.ok ? 'Test sent — check the channel' : `Failed: ${r.error}`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Notification channels</h1>

      <div className="space-y-3">
        {(chansData?.channels ?? []).map((ch) => (
          <div key={ch.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-600">{ch.type}</span>
              <span className="ml-2 font-medium">{ch.name}</span>
              {ch.enabled === 0 && <span className="ml-2 text-xs text-slate-400">(disabled)</span>}
            </div>
            <div className="flex gap-2 text-sm">
              <button onClick={() => test(ch.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50">Test</button>
              <button
                onClick={() => api(`/api/teams/${teamId}/channels/${ch.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: ch.enabled === 0 }) })
                  .then(() => qc.invalidateQueries({ queryKey: ['channels'] }))}
                className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50">
                {ch.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={() => api(`/api/teams/${teamId}/channels/${ch.id}`, { method: 'DELETE' })
                  .then(() => qc.invalidateQueries({ queryKey: ['channels'] }))}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50">
                Remove
              </button>
            </div>
          </div>
        ))}
        {chansData && chansData.channels.length === 0 && <p className="text-sm text-slate-500">No channels yet.</p>}
      </div>
      {testMsg && <p className="text-sm text-slate-600">{testMsg}</p>}

      <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as never)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="slack">Slack</option>
          <option value="pushover">Pushover</option>
          <option value="email">Email</option>
        </select>
        <input value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={type === 'slack' ? 'webhook URL' : type === 'email' ? 'you@example.com' : 'token:user'}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
        <button disabled={add.isPending || !teamId}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Add channel
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
