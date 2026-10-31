// API keys + MCP setup. Secrets are shown once.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { KeyRound, Plus, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import type { ApiKey } from "../lib/types";
import { relTime } from "../lib/format";
import { Button } from "../components/ui/button";
import { Alert } from "../components/ui/alert";
import { ConfirmButton } from "../components/ui/confirm-button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { CodeBlock } from "../components/copy-button";
import { EmptyState } from "../components/ui/empty-state";
import { TableSkeleton } from "../components/ui/skeleton";
import { useToast } from "../components/ui/toast";
import { Page, PageHeader } from "../components/page-header";
import { meQuery } from "../features/sites/queries";
import { McpSetup } from "../features/keys/mcp-setup";

export function ApiKeysPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useQuery(meQuery);
  const teamId = me.data?.teams[0]?.id;
  const [secret, setSecret] = useState("");
  const keys = useQuery({
    queryKey: ["keys", teamId],
    queryFn: () => api<{ keys: ApiKey[] }>(`/api/v1/teams/${teamId}/keys`),
    enabled: !!teamId,
  });
  const create = useMutation({
    mutationFn: () =>
      api<{ key: ApiKey; secret: string }>(`/api/v1/teams/${teamId}/keys`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (d) => {
      setSecret(d.secret);
      void qc.invalidateQueries({ queryKey: ["keys", teamId] });
    },
    onError: (e: Error) => toast("error", e.message),
  });
  // first visit with no keys: make one so the agent prompt below is immediately usable
  const autoCreated = useRef(false);
  useEffect(() => {
    if (teamId && keys.data && keys.data.keys.length === 0 && !secret && !autoCreated.current) {
      autoCreated.current = true;
      create.mutate();
    }
  }, [teamId, keys.data]);
  const list = keys.data?.keys ?? [];

  return (
    <Page>
      <PageHeader
        title="API & MCP"
        description="Bearer tokens for the REST API and the MCP server. Keys belong to the team and can read every site on it."
        actions={
          <Button
            size="sm"
            pending={create.isPending}
            disabled={!teamId}
            onClick={() => create.mutate()}
          >
            <Plus /> Create key
          </Button>
        }
      />

      {secret && (
        <Alert
          tone="info"
          title="Copy this key now. It won’t be shown again."
          action={
            <Button variant="ghost" size="sm" onClick={() => setSecret("")}>
              Done
            </Button>
          }
        >
          <CodeBlock code={secret} label="Copy API key" className="mt-2" />
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" /> Connect your agent
          </CardTitle>
          <CardDescription>
            Hand this whole setup to Claude Code, Cursor or any MCP client. It lists broken links,
            reads referrers and suggested fixes, and opens the PR.
          </CardDescription>
          <CardAction>
            <code className="text-code text-muted-foreground">{window.location.origin}/mcp</code>
          </CardAction>
        </CardHeader>
        {/* a truncated real key would copy into a command that fails auth: the full secret or a placeholder */}
        <CardContent>
          <McpSetup apiKey={secret || "404l_your_key"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keys</CardTitle>
          <CardDescription>
            Only a prefix is kept for display; the key itself is stored hashed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.isPending || !teamId ? (
            <TableSkeleton rows={2} cols={2} />
          ) : list.length === 0 ? (
            <EmptyState
              variant="plain"
              icon={KeyRound}
              title="No API keys"
              description="Create one to connect an agent over MCP or script the REST API."
            />
          ) : (
            <ul className="-mx-4 divide-y divide-border">
              {list.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-4 py-2.5">
                  <code className="text-code min-w-0 flex-1 truncate">{k.prefix}…</code>
                  <span className="text-meta">created {relTime(k.created_at)}</span>
                  <ConfirmButton
                    variant="ghost"
                    size="sm"
                    confirmLabel="Revoke?"
                    onConfirm={() =>
                      api(`/api/v1/teams/${teamId}/keys/${k.id}`, { method: "DELETE" }).then(
                        () => {
                          toast("success", `Revoked ${k.prefix}…`);
                          void qc.invalidateQueries({ queryKey: ["keys", teamId] });
                        },
                        (e: Error) => toast("error", e.message),
                      )
                    }
                  >
                    Revoke
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
