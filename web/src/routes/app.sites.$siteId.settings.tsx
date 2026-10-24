// Site settings: install, general, filters, alerts, danger zone.
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { X } from 'lucide-react';
import { api, patch } from '../lib/api';
import { digestLabel } from '../lib/format';
import { clearLastSiteId } from '../lib/site-memory';
import { Button } from '../components/ui/button';
import { Input, Select, FormField } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ConfirmButton } from '../components/ui/confirm-button';
import { Field, Switch } from '../components/ui/switch';
import { CopyButton } from '../components/copy-button';
import { useToast } from '../components/ui/toast';
import { Page, PageHeader } from '../components/page-header';
import { InstallSnippet } from '../features/sites/install-snippet';
import { useCurrentSite } from '../features/sites/queries';

export const Route = createFileRoute('/app/sites/$siteId/settings')({ component: SettingsPage });

function SettingsPage() {
  const site = useCurrentSite();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(site.name);
  const [pattern, setPattern] = useState('');

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/api/sites/${site.id}`, patch(body)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sites'] }); },
    onError: (e: Error) => toast('error', e.message),
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/sites/${site.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      clearLastSiteId();
      toast('success', `${site.domain} removed`);
      await qc.invalidateQueries({ queryKey: ['sites'] });
      void navigate({ to: '/app' });
    },
    onError: (e: Error) => toast('error', e.message),
  });

  return (
    <Page>
      <PageHeader title="Site settings" description={site.domain} />

      <Card id="install">
        <CardHeader>
          <CardTitle>Install the snippet</CardTitle>
          <CardDescription>Paste this into your 404 page template. It reports each hit and shows visitors the closest matching pages.</CardDescription>
        </CardHeader>
        <CardContent><InstallSnippet siteKey={site.site_key} domain={site.domain} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== site.name) save.mutate({ name: name.trim() }, { onSuccess: () => toast('success', 'Name saved') }); }} className="flex items-end gap-2">
            <FormField label="Name" htmlFor="site-name" className="max-w-sm flex-1">
              <Input id="site-name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <Button type="submit" variant="outline" pending={save.isPending} disabled={!name.trim() || name.trim() === site.name}>Save</Button>
          </form>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Domain" hint="Fixed per site. Add a new site for another domain.">
              <Input value={site.domain} readOnly className="bg-foreground/[0.03]" />
            </FormField>
            <FormField label="Site key" hint="Identifies this site in the snippet. Not a secret, but keep it to your own pages.">
              <div className="flex gap-2"><Input value={site.site_key} readOnly className="bg-foreground/[0.03] font-mono text-xs" /><CopyButton value={site.site_key} label="Copy site key" /></div>
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exclusions</CardTitle>
          <CardDescription>URLs matching these patterns are never tracked, crawled or alerted on. Plain text matches anywhere; <code className="text-code">*</code> matches anything.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {site.exclude_patterns.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {site.exclude_patterns.map((p) => (
                <li key={p} className="inline-flex items-center gap-1 rounded-md border border-border bg-foreground/[0.03] px-2 py-0.5 text-code">
                  {p}
                  <button aria-label={`Remove ${p}`} className="cursor-pointer text-muted-foreground hover:text-destructive"
                    onClick={() => save.mutate({ exclude_patterns: site.exclude_patterns.filter((x) => x !== p) })}><X className="size-3" /></button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(e) => { e.preventDefault(); const v = pattern.trim(); if (!v) return; save.mutate({ exclude_patterns: [...site.exclude_patterns, v] }, { onSuccess: () => setPattern('') }); }} className="flex max-w-md gap-2">
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="/wp-admin/*" className="font-mono text-xs" aria-label="Exclusion pattern" />
            <Button type="submit" variant="outline">Add pattern</Button>
          </form>
          <p className="text-meta">Examples: <code className="text-code">/wp-admin/*</code> · <code className="text-code">*.php</code> · <code className="text-code">utm_</code> · <code className="text-code">https://{site.domain}/preview/*</code></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>Hits and crawler findings are grouped into one digest per window and sent to your team’s <Link to="/app/settings/channels" className="text-primary hover:underline">channels</Link>.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <Field label="Send alerts for this site" hint={site.notify_enabled ? `Digest ${digestLabel(site.digest_minutes || 15)}` : 'Paused — nothing is sent for this site'}>
            <Switch checked={site.notify_enabled !== 0} label="Send alerts" onCheckedChange={(v) => save.mutate({ notify_enabled: v })} />
          </Field>
          <Field label="Digest window" hint="Shorter windows mean faster alerts; longer windows mean fewer messages.">
            <Select value={String(site.digest_minutes || 15)} onChange={(e) => save.mutate({ digest_minutes: Number(e.target.value) })} aria-label="Digest window">
              <option value="5">Every 5 min</option>
              <option value="15">Every 15 min</option>
              <option value="60">Every hour</option>
              <option value="360">Every 6 hours</option>
              <option value="1440">Daily</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Deleting removes the site, its broken links, events, crawl history and known pages. The snippet stops working immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmButton variant="outline" confirmLabel={`Delete ${site.domain}?`} pending={remove.isPending} onConfirm={() => remove.mutate()}>Delete site</ConfirmButton>
        </CardContent>
      </Card>
    </Page>
  );
}
