// The one empty state: icon, title, description, optional action (open-seo pattern).
// `kind` says why the region is empty; `variant` says where it sits.
import { CircleAlert, Inbox, SearchX, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

type EmptyStateKind = 'no-data' | 'filtered' | 'error';
const KIND_ICONS: Record<EmptyStateKind, LucideIcon> = { 'no-data': Inbox, filtered: SearchX, error: CircleAlert };

export function EmptyState({
  kind = 'no-data',
  icon: Icon = KIND_ICONS[kind],
  title,
  description,
  action,
  variant = 'dashed',
  size = 'default',
  className,
}: {
  kind?: EmptyStateKind;
  icon?: LucideIcon | null;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** `dashed` for sections, `card` for a whole panel, `plain` inside a card or table. */
  variant?: 'dashed' | 'card' | 'plain';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}) {
  return (
    <div
      role={kind === 'error' ? 'alert' : undefined}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1 rounded-xl p-8 text-center text-balance',
        variant === 'dashed' && 'border border-dashed border-border bg-card/40',
        variant === 'card' && 'border border-border bg-card shadow-xs',
        size === 'sm' && 'gap-0.5 rounded-lg p-5',
        size === 'lg' && 'p-14',
        className,
      )}
    >
      {Icon && (
        <span className={cn(
          'mb-2 grid size-9 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground [&_svg]:size-4.5',
          kind === 'error' && 'bg-destructive/10 text-destructive',
        )}>
          <Icon aria-hidden />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-[0.8125rem] text-muted-foreground">{description}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
