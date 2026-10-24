// Skeleton — data is loading, not missing.
import { cn } from '../../lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-foreground/[0.06]', className)} aria-hidden {...props} />;
}

export function TableSkeleton({ rows = 4, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border/60" aria-busy>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'flex-[3]' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A row of stat tiles: a small label over a large value. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2.5 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** A whole page whose data has not arrived: header lines + one card. */
export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <StatGridSkeleton />
      <div className="rounded-xl border border-border bg-card">
        <TableSkeleton rows={5} cols={4} />
      </div>
    </div>
  );
}
