// Add a site. Afterwards the overview's setup checklist takes over.
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Globe } from 'lucide-react';
import { api, json } from '../lib/api';
import type { Site } from '../lib/types';
import { setLastSiteId } from '../lib/site-memory';
import { Button } from '../components/ui/button';
import { FormField, Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useToast } from '../components/ui/toast';
import { useSites } from '../features/sites/queries';

export const Route = createFileRoute('/app/sites/new')({ component: NewSitePage });

function NewSitePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const sites = useSites();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const first = (sites.data?.length ?? 0) === 0;

  const create = useMutation({
    mutationFn: () => api<{ site: Site }>('/api/sites', json({ name: name.trim() || domainToName(domain), domain })),
    onSuccess: async ({ site }) => {
      setLastSiteId(site.id);
      await qc.invalidateQueries({ queryKey: ['sites'] });
      toast('success', `${site.domain} added — install the snippet to start tracking`);
      void navigate({ to: '/app/sites/$siteId', params: { siteId: site.id } });
    },
    onError: (e: Error) => toast('error', e.message),
  });

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center">
      <Card size="lg">
        <CardHeader>
          <span className="mb-2 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Globe className="size-4.5" /></span>
          <CardTitle className="text-page-title">{first ? 'Add your first site' : 'Add a site'}</CardTitle>
          <CardDescription>
            Enter the domain you want to monitor. You’ll get a snippet for your 404 page next; the crawler and alerts are optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
            <FormField label="Domain" htmlFor="domain" hint="Subdomains are separate sites. www. is stripped automatically.">
              <Input id="domain" autoFocus required value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" inputMode="url" className="h-9" />
            </FormField>
            <FormField label="Name" htmlFor="name" hint="How the site appears in the sidebar. Defaults to the domain.">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={domainToName(domain) || 'Marketing site'} className="h-9" />
            </FormField>
            <div className="flex items-center justify-end gap-2 pt-1">
              {!first && <Button variant="ghost" onClick={() => history.back()}>Cancel</Button>}
              <Button type="submit" pending={create.isPending}>Add site</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function domainToName(domain: string): string {
  try {
    const host = new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`).hostname.replace(/^www\./, '');
    return host || '';
  } catch {
    return domain.trim();
  }
}
