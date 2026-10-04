// API keys: create (secret shown once), list prefixes, delete.
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Team } from '../lib/types';

export const Route = createFileRoute('/app/settings/api-keys')({
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const qc = useQueryClient();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');

  const { data: teamsData } = useQuery({ queryKey: ['teams'], queryFn: () => api<{ teams: Team[] }>('/api/teams') });
  const teamId = teamsData?.teams?.[0]?.id;
  const { data: keysData, refetch } = useQuery({
    queryKey: ['keys', teamId],
    queryFn: () => api<{ keys: { id: string; prefix: string; created_at: number }[] }>(`/api/teams/${teamId}/keys`),
    enabled: !!teamId,
  });

  const create = useMutation({
    mutationFn: () => api<{ key: { id: string; prefix: string }; secret: string }>(`/api/teams/${teamId}/keys`, { method: 'POST', body: '{}' }),
    onSuccess: (d) => { setSecret(d.secret); setError(''); refetch(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">API keys</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use as <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">Authorization: Bearer …</code> for the REST API
          and the MCP server (<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">POST /mcp</code>).
        </p>
      </div>

      {secret && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-800">Copy this key now — it won't be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-white px-3 py-2 text-xs">{secret}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(secret); }}
              className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100"
            >Copy</button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {(keysData?.keys ?? []).map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <code className="text-sm">{k.prefix}…</code>
              <span className="ml-3 text-xs text-slate-400">created {new Date(k.created_at).toISOString().slice(0, 10)}</span>
            </div>
            <button
              onClick={() => api(`/api/teams/${teamId}/keys/${k.id}`, { method: 'DELETE' }).then(() => refetch())}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >Revoke</button>
          </div>
        ))}
        {keysData && keysData.keys.length === 0 && <p className="text-sm text-slate-500">No keys yet.</p>}
      </div>

      <button
        onClick={() => create.mutate()}
        disabled={create.isPending || !teamId}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Create key
      </button>
    </div>
  );
}
