// Alert — an inline callout: info by default, warning or destructive when it matters.
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/utils';

const STYLES = {
  info: { box: 'border-info/30 bg-info/[0.06]', icon: 'text-info', Icon: Info },
  warning: { box: 'border-warning/50 bg-warning/10', icon: 'text-warning-foreground', Icon: TriangleAlert },
  destructive: { box: 'border-destructive/30 bg-destructive/[0.06]', icon: 'text-destructive', Icon: CircleAlert },
} as const;

export function Alert({ tone = 'info', title, children, action, className }: {
  tone?: keyof typeof STYLES;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { box, icon, Icon } = STYLES[tone];
  return (
    <div role={tone === 'destructive' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-[0.8125rem]', box, className)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-foreground/80">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
