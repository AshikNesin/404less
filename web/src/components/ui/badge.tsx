import { cn } from '../../lib/utils';

export function Badge({ className, tone = 'default', ...props }: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'default' | 'destructive' | 'success' | 'warning' | 'info' | 'muted';
}) {
  const tones = {
    default: 'bg-muted text-foreground',
    destructive: 'bg-destructive/10 text-destructive',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/25 text-foreground',
    info: 'bg-primary/10 text-primary',
    muted: 'bg-muted text-muted-foreground',
  } as const;
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)} {...props} />;
}
