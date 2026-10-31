// Add a notification channel: one form, fields per type.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { api, json } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { FormField, Input } from "../../components/ui/input";
import { useToast } from "../../components/ui/toast";
import { cn } from "../../lib/utils";
import type { Channel } from "../../lib/types";

type Type = Channel["type"];
const TYPES: { value: Type; label: string; hint: string }[] = [
  { value: "slack", label: "Slack", hint: "Incoming webhook" },
  { value: "email", label: "Email", hint: "Needs RESEND_API_KEY" },
  { value: "pushover", label: "Pushover", hint: "Phone push" },
];

export function ChannelForm({ teamId, onAdded }: { teamId: string; onAdded?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<Type>("slack");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [to, setTo] = useState("");
  const [user, setUser] = useState("");
  const [token, setToken] = useState("");

  const add = useMutation({
    mutationFn: () => {
      const config = type === "slack" ? { url } : type === "email" ? { to } : { user, token };
      return api(
        `/api/v1/teams/${teamId}/channels`,
        json({ type, name: name.trim() || undefined, config }),
      );
    },
    onSuccess: () => {
      setName("");
      setUrl("");
      setTo("");
      setUser("");
      setToken("");
      toast("success", "Channel added — send a test to confirm it works");
      void qc.invalidateQueries({ queryKey: ["channels", teamId] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      onAdded?.();
    },
    onError: (e: Error) => toast("error", e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            aria-pressed={type === t.value}
            className={cn(
              "cursor-pointer rounded-lg border px-3 py-2 text-left",
              type === t.value
                ? "border-primary bg-primary/[0.05] ring-1 ring-primary"
                : "border-border bg-card hover:bg-foreground/[0.02]",
            )}
          >
            <span className="block text-[0.8125rem] font-medium">{t.label}</span>
            <span className="block text-meta">{t.hint}</span>
          </button>
        ))}
      </div>

      {type === "slack" && (
        <FormField
          label="Webhook URL"
          htmlFor="ch-url"
          hint={
            <>
              Slack → Apps → <span className="font-medium">Incoming Webhooks</span> → Add to
              channel.
            </>
          }
        >
          <Input
            id="ch-url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/T000/B000/xxxx"
            inputMode="url"
          />
        </FormField>
      )}
      {type === "email" && (
        <FormField label="Send digests to" htmlFor="ch-to">
          <Input
            id="ch-to"
            required
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="alerts@example.com"
          />
        </FormField>
      )}
      {type === "pushover" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="User key" htmlFor="ch-user" hint="From your Pushover dashboard.">
            <Input
              id="ch-user"
              required
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="uQiRzpo4DXghDmr9QzzfQu27cmVRsG"
              className="font-mono text-xs"
            />
          </FormField>
          <FormField
            label="Application token"
            htmlFor="ch-token"
            hint="Create an application named 404less."
          >
            <Input
              id="ch-token"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="azGDORePK8gMaC0QOYAMyEEuzJnyUi"
              className="font-mono text-xs"
            />
          </FormField>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <FormField label="Name (optional)" htmlFor="ch-name" className="min-w-48 flex-1">
          <Input
            id="ch-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              type === "slack" ? "#ops-alerts" : type === "email" ? "On-call inbox" : "My phone"
            }
          />
        </FormField>
        <Button type="submit" pending={add.isPending}>
          <Plus /> Add channel
        </Button>
      </div>
    </form>
  );
}
