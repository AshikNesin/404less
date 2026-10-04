// API keys: create (secret shown once), list prefixes, delete.
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '../components/ui/toast';
import { KeyRound, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { ConfirmButton } from '../components/ui/confirm-button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { CopyButton } from '../components/copy-button';
import { EmptyState } from '../components/ui/empty-state';
import type { Team } from '../lib/types';

export const Route = createFileRoute('/app/settings/api-keys')({
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const qc = useQueryClient();
  const [secret, setSecret] = useState('');

  const { data: teamsData } = useQuery({ queryKey: ['teams'], queryFn: () => api<{ teams: Team[] }>('/api/teams') });
  const teamId = teamsData?.teams?.[0]?.id;
  const { data: keysData, refetch } = useQuery({
    queryKey: ['keys', teamId],
    queryFn: () => api<{ keys: { id: string; prefix: string; created_at: number }[] }>(`/api/teams/${teamId}/keys`),
    enabled: !!teamId,
  });

  const toast = useToast();
  const create = useMutation({
    mutationFn: () => api<{ key: { id: string; prefix: string }; secret: string }>(`/api/teams/${teamId}/keys`, { method: 'POST', body: '{}' }),
    onSuccess: (d) => { setSecret(d.secret); refetch(); },
    onError: (e: Error) => toast('error', e.message),
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
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Copy this key now — it won't be shown again</CardTitle>
            <CardDescription>Use it as a bearer token for the REST API and MCP server.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-card px-3 py-2 text-xs">{secret}</code>
              <CopyButton value={secret} />
            </div>
          </CardContent>
        </Card>
      )}

      {keysData && keysData.keys.length === 0 ? (
        <EmptyState icon={KeyRound} title="No API keys" description="Create a key to use the REST API or connect an MCP client." />
      ) : (
        <div className="space-y-3">
          {(keysData?.keys ?? []).map((k) => (
            <Card key={k.id} size="sm">
              <CardHeader className="pb-0">
                <CardTitle className="font-mono">{k.prefix}…</CardTitle>
                <CardDescription>created {new Date(k.created_at).toISOString().slice(0, 10)}</CardDescription>
                <CardAction>
                  <ConfirmButton size="sm" confirmLabel="Revoke?"
                    onConfirm={() => api(`/api/teams/${teamId}/keys/${k.id}`, { method: 'DELETE' }).then(() => { toast('success', `Key ${k.prefix}… revoked`); refetch(); })}>
                    Revoke
                  </ConfirmButton>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Button onClick={() => create.mutate()} pending={create.isPending} disabled={!teamId}>
        <Plus /> Create key
      </Button>
    </div>
  );
}
