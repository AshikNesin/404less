// Three steps to a working site. Disappears once all are done.
import { Link } from '@tanstack/react-router';
import { Check, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import type { Overview, Site } from '../../lib/types';
import { cn } from '../../lib/utils';

export function setupSteps(site: Site, overview: Overview) {
  return [
    {
      key: 'install',
      title: 'Install the snippet on your 404 page',
      description: 'One script tag. Visitors’ 404 hits start showing up here within seconds.',
      done: site.last_hit_at !== null,
      to: '/app/sites/$siteId/settings' as const,
      hash: 'install',
    },
    {
      key: 'index',
      title: 'Import your sitemap or run a crawl',
      description: 'Known pages power “did you mean” suggestions and give the crawler its starting points.',
      done: overview.knownUrls > 0,
      to: '/app/sites/$siteId/crawl' as const,
      hash: undefined,
    },
    {
      key: 'alerts',
      title: 'Add a notification channel',
      description: 'Slack, Pushover or email. Hits are grouped into one digest per window, never one message per hit.',
      done: overview.channels > 0,
      to: '/app/settings/channels' as const,
      hash: undefined,
    },
  ];
}

export function SetupChecklist({ site, overview }: { site: Site; overview: Overview }) {
  const steps = setupSteps(site, overview);
  const remaining = steps.filter((s) => !s.done).length;
  if (remaining === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish setting up {site.name}</CardTitle>
        <CardDescription>{steps.length - remaining} of {steps.length} done</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {steps.map((s, i) => (
            <li key={s.key}>
              <Link
                to={s.to}
                params={{ siteId: site.id }}
                hash={s.hash}
                className={cn('group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.025]', s.done && 'opacity-60')}
              >
                <span className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold num',
                  s.done ? 'bg-success text-primary-foreground' : 'bg-foreground/[0.06] text-foreground/70',
                )}>
                  {s.done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-[0.8125rem] font-medium', s.done && 'line-through decoration-foreground/30')}>{s.title}</span>
                  <span className="block text-meta">{s.description}</span>
                </span>
                {!s.done && <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
