// Skeletons — data is loading, not missing. Built from @groot/ui's.
import { Card } from "@groot/ui/card";
import { Skeleton, SkeletonTable } from "@groot/ui/loading-skeleton";

export { Skeleton };

export function TableSkeleton({ rows = 4, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy>
      <SkeletonTable rows={rows} columns={cols} header={false} />
    </div>
  );
}

/** A row of stat tiles: a small label over a large value. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} size="sm" className="gap-2.5 px-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-24" />
        </Card>
      ))}
    </div>
  );
}

/** A whole page whose data has not arrived: header lines + one card. */
export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <StatGridSkeleton />
      <Card className="py-0">
        <SkeletonTable rows={5} columns={4} />
      </Card>
    </div>
  );
}
