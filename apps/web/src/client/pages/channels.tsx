// Notification channels (team-wide): list / add / toggle / test / remove.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, Mail, MessageSquare, Send, Smartphone, type LucideIcon } from "lucide-react";
import { api, patch } from "../lib/api";
import type { Channel } from "../lib/types";
import { relTime } from "../lib/format";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ConfirmButton } from "../components/ui/confirm-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { EmptyState } from "../components/ui/empty-state";
import { Switch } from "../components/ui/switch";
import { TableSkeleton } from "../components/ui/skeleton";
import { useToast } from "../components/ui/toast";
import { Page, PageHeader } from "../components/page-header";
import { meQuery } from "../features/sites/queries";
import { ChannelForm } from "../features/channels/channel-form";

const TYPE: Record<Channel["type"], { label: string; Icon: LucideIcon }> = {
  slack: { label: "Slack", Icon: MessageSquare },
  email: { label: "Email", Icon: Mail },
  pushover: { label: "Pushover", Icon: Smartphone },
};

export function ChannelsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useQuery(meQuery);
  const teamId = me.data?.teams[0]?.id;
  const [testing, setTesting] = useState<string | null>(null);
  const channels = useQuery({
    queryKey: ["channels", teamId],
    queryFn: () => api<{ channels: Channel[] }>(`/api/v1/teams/${teamId}/channels`),
    enabled: !!teamId,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["channels", teamId] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
  };
  const failed = (e: unknown) =>
    toast("error", e instanceof Error ? e.message : "Something went wrong");

  async function test(id: string) {
    setTesting(id);
    try {
      await api(`/api/v1/teams/${teamId}/channels/${id}/test`, { method: "POST", body: "{}" });
      toast("success", "Test sent — check the channel");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(null);
    }
  }

  const list = channels.data?.channels ?? [];
  return (
    <Page>
      <PageHeader
        title="Notifications"
        description="Where digests go. Every site on your team uses these channels; each site decides whether to send and how often."
      />

      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>
            {list.length === 0
              ? "None yet."
              : `${list.filter((c) => c.enabled).length} of ${list.length} enabled`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {channels.isPending || !teamId ? (
            <TableSkeleton rows={2} cols={3} />
          ) : list.length === 0 ? (
            <EmptyState
              variant="plain"
              icon={Bell}
              title="No channels yet"
              description="Add one below. Hits are grouped per site into one digest per window, so a bad deploy is one message, not hundreds."
            />
          ) : (
            <ul className="-mx-4 divide-y divide-border">
              {list.map((ch) => {
                const { label, Icon } = TYPE[ch.type];
                return (
                  <li key={ch.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[0.8125rem] font-medium">
                        <span className="truncate">{ch.name}</span>
                        <Badge tone="outline" size="sm">
                          {label}
                        </Badge>
                        {!ch.enabled && (
                          <Badge tone="neutral" size="sm">
                            Paused
                          </Badge>
                        )}
                      </div>
                      <div className="text-meta">added {relTime(ch.created_at)}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        pending={testing === ch.id}
                        onClick={() => test(ch.id)}
                      >
                        <Send /> Test
                      </Button>
                      <ConfirmButton
                        variant="ghost"
                        size="sm"
                        confirmLabel="Remove?"
                        onConfirm={() =>
                          api(`/api/v1/teams/${teamId}/channels/${ch.id}`, {
                            method: "DELETE",
                          }).then(() => {
                            toast("success", `Removed ${ch.name}`);
                            refresh();
                          }, failed)
                        }
                      >
                        Remove
                      </ConfirmButton>
                      <Switch
                        checked={ch.enabled === 1}
                        label={`${ch.name} enabled`}
                        onCheckedChange={(v) =>
                          api(
                            `/api/v1/teams/${teamId}/channels/${ch.id}`,
                            patch({ enabled: v }),
                          ).then(refresh, failed)
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a channel</CardTitle>
          <CardDescription>
            Secrets are stored once and never shown again. Use “Test” to confirm the wiring.
          </CardDescription>
        </CardHeader>
        <CardContent>{teamId && <ChannelForm teamId={teamId} />}</CardContent>
      </Card>
    </Page>
  );
}
