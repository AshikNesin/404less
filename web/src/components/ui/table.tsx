// Table primitives modeled on open-seo: edge-to-edge tables inside TableCard,
// a toolbar row above, pagination below. Row hover uses a foreground tint
// because bg-muted is the page background and would not show on a card.
import { cn } from '../../lib/utils';

export function TableCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-xs', className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full text-[0.8125rem]', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-9 border-b border-border px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4',
        className,
      )}
      {...props}
    />
  );
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle first:pl-4 last:pr-4', className)} {...props} />;
}
export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'group border-b border-border transition-colors last:border-b-0 hover:bg-foreground/[0.025] data-[selected=true]:bg-primary/[0.04]',
        className,
      )}
      {...props}
    />
  );
}

/** Filter controls on the left, actions on the right — the row above a table. */
export function TableToolbar({ children, actions, className }: { children?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5', className)}>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
