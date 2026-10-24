// StatCard — label · value · delta vs a named period · optional sparkline.
// Proportional figures for the big number (tabular only in table columns).
import { cn } from '../../lib/utils';
import { Sparkline } from './charts';

export function StatCard({ label, value, delta, hint, trend, tone = 'default', className }: {
  label: string;
  value: React.ReactNode;
  /** Signed change vs the previous period. `upIsGood=false` for things like 404 hits. */
  delta?: { value: number; period: string; upIsGood?: boolean } | null;
  hint?: React.ReactNode;
  trend?: number[];
  tone?: 'default' | 'destructive' | 'success';
  className?: string;
}) {
  const deltaTone = delta && delta.value !== 0
    ? (delta.value > 0) === (delta.upIsGood ?? true) ? 'text-success' : 'text-destructive'
    : 'text-muted-foreground';
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5 shadow-xs', className)}>
      <div className="text-meta truncate">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className={cn('text-metric', tone === 'destructive' && 'text-destructive', tone === 'success' && 'text-success')}>{value}</div>
        {trend && trend.length > 1 && <Sparkline values={trend} className="mb-1 shrink-0" />}
      </div>
      {(delta || hint) && (
        <div className="text-meta flex min-w-0 items-center gap-1.5">
          {delta && (
            <span className={cn('num font-medium', deltaTone)}>
              {delta.value > 0 ? '+' : ''}{delta.value}%
            </span>
          )}
          {delta && <span className="truncate">vs {delta.period}</span>}
          {!delta && hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  );
}

/** Percent change between two counts; null when the previous period had nothing to compare to. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null; // nothing to compare against
  return Math.round(((current - previous) / previous) * 100);
}
