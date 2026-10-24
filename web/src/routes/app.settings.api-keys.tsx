// API keys + MCP setup. Secrets are shown once.
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { api } from '../lib/api';
import type { ApiKey } from '../lib/types';
import { relTime } from '../lib/format';
import { Button } from '../components/ui/button';
import { Alert } from '../components/ui/alert';
import { ConfirmButton } from '../components/ui/confirm-button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { CodeBlock } from '../components/copy-button';
import { EmptyState } from '../components/ui/empty-state';
import { TableSkeleton } from '../components/ui/skeleton';
import { useToast } from '../components/ui/toast';
import { Page, PageHeader } from '../components/page-header';
import { meQuery } from '../features/sites/queries';
import { McpSetup } from '../features/keys/mcp-setup';

export const Route = createFileRoute('/app/settings/api-keys')({ component: ApiKeysPage });

function ApiKeysPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useQuery(meQuery);
  const teamId = me.data?.teams[0]?.id;
  const [secret, setSecret] = useState('');
  const keys = useQuery({
    queryKey: ['keys', teamId],
    queryFn: () => api<{ keys: ApiKey[] }>(`/api/teams/${teamId}/keys`),
    enabled: !!teamId,
  });
  const create = useMutation({
    mutationFn: () => api<{ key: ApiKey; secret: string }>(`/api/teams/${teamId}/keys`, { method: 'POST', body: '{}' }),
    onSuccess: (d) => { setSecret(d.secret); void qc.invalidateQueries({ queryKey: ['keys', teamId] }); },
    onError: (e: Error) => toast('error', e.message),
  });
  const list = keys.data?.keys ?? [];

  return (
    <Page>
      <PageHeader
        title="API & MCP"
        description="Bearer tokens for the REST API and the MCP server. Keys belong to the team and can read every site on it."
        actions={<Button size="sm" pending={create.isPending} disabled={!teamId} onClick={() => create.mutate()}><Plus /> Create key</Button>}
      />

      {secret && (
        <Alert tone="info" title="Copy this key now — it won’t be shown again." action={<Button variant="ghost" size="sm" onClick={() => setSecret('')}>Done</Button>}>
          <CodeBlock code={secret} label="Copy API key" className="mt-2" />
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Keys</CardTitle>
          <CardDescription>Only a prefix is kept for display; the key itself is stored hashed.</CardDescription>
        </CardHeader>
        <CardContent>
          {keys.isPending || !teamId ? (
            <TableSkeleton rows={2} cols={2} />
          ) : list.length === 0 ? (
            <EmptyState variant="plain" icon={KeyRound} title="No API keys" description="Create one to connect an agent over MCP or script the REST API." />
          ) : (
            <ul className="-mx-4 divide-y divide-border">
              {list.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-4 py-2.5">
                  <code className="text-code min-w-0 flex-1 truncate">{k.prefix}…</code>
                  <span className="text-meta">created {relTime(k.created_at)}</span>
                  <ConfirmButton variant="ghost" size="sm" confirmLabel="Revoke?"
                    onConfirm={() => api(`/api/teams/${teamId}/keys/${k.id}`, { method: 'DELETE' }).then(() => { toast('success', `Revoked ${k.prefix}…`); void qc.invalidateQueries({ queryKey: ['keys', teamId] }); })}>
                    Revoke
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect your agent</CardTitle>
          <CardDescription>Streamable-HTTP MCP server, read-only. Ask Claude Code or Cursor to list broken links and draft the redirects.</CardDescription>
          <CardAction><code className="text-code text-muted-foreground">{window.location.origin}/mcp</code></CardAction>
        </CardHeader>
        <CardContent><McpSetup keyPlaceholder={secret || list[0] ? (secret || `${list[0].prefix}…`) : '404l_your_key'} /></CardContent>
      </Card>
    </Page>
  );
}
