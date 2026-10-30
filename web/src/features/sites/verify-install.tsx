// "Did it work?" — sits on the overview until the first real 404 lands.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { useToast } from '../../components/ui/toast';
import type { Overview, Site } from '../../lib/types';
import { overviewQuery } from './queries';

export function VerifyInstall({ site, overview }: { site: Site; overview: Overview }) {
  const qc = useQueryClient();
  const toast = useToast();
  const mountedAt = useRef(Date.now());
  const notified = useRef(false);
  const [testUrl] = useState(() => `https://${site.domain}/404less-verify-${Date.now()}`);

  // Same "tracking" rule as the overview header: quiet once hits are recent.
  const waiting = site.last_hit_at === null || Date.now() - site.last_hit_at >= 7 * 86_400_000;

  // Poll for the first hit while the card is up. Shares the parent's cache,
  // so a fresh overview reaches us through the `overview` prop.
  useQuery({ ...overviewQuery(site.id), refetchInterval: waiting ? 4_000 : false });

  const hitArrived = overview.recent.some((e) => e.ts > mountedAt.current);

  useEffect(() => {
    if (!hitArrived || notified.current) return;
    notified.current = true;
    toast('success', 'Snippet verified — first hit received');
    void qc.invalidateQueries({ queryKey: ['sites'] }); // refreshes last_hit_at, which hides this card
  }, [hitArrived, qc, toast]);

  if (!waiting) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting for the first hit…</CardTitle>
        <CardDescription>Trigger a real 404 to confirm the snippet is live.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <a href={testUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">Open a test 404 <ArrowUpRight /></Button>
          </a>
          <Button variant="ghost" size="sm" onClick={() => void qc.invalidateQueries({ queryKey: ['overview', site.id] })}>
            <RefreshCw /> Check again
          </Button>
        </div>
        <p className="text-meta">We re-check automatically every few seconds — this card disappears once a hit lands.</p>
      </CardContent>
    </Card>
  );
}
