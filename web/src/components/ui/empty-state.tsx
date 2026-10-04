// The one empty state: icon, title, description, optional action (open-seo pattern).
import { CircleAlert, Inbox, SearchX, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

const KIND_ICONS: Record<EmptyStateKind, LucideIcon> = {
  'no-data': Inbox,
  filtered: SearchX,
  error: CircleAlert,
};
type EmptyStateKind = 'no-data' | 'filtered' | 'error';

export function EmptyState({
  kind = 'no-data',
  icon: Icon = KIND_ICONS[kind],
  title,
  description,
  action,
  className,
}: {
  kind?: EmptyStateKind;
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-32 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-card/50 p-8 text-center',
        className,
      )}
    >
      <Icon className="mb-2 size-8 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
