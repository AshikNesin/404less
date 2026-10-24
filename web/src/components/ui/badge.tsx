// Badge — status dots + tones. Semantic meaning only; never decoration.
import { cn } from '../../lib/utils';

const TONES = {
  neutral: 'bg-foreground/[0.06] text-foreground/75',
  destructive: 'bg-destructive/10 text-destructive',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/20 text-warning-foreground',
  info: 'bg-info/10 text-info',
  accent: 'bg-primary/10 text-primary',
  outline: 'border border-border text-muted-foreground',
} as const;

const DOT = {
  neutral: 'bg-subtle',
  destructive: 'bg-destructive',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  accent: 'bg-primary',
  outline: 'bg-subtle',
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  className, tone = 'neutral', dot, size = 'default', ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean; size?: 'sm' | 'default' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[0.6875rem] font-medium whitespace-nowrap num [&_svg]:size-3',
        size === 'sm' && 'h-4 px-1 text-[0.625rem]',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('size-1.5 rounded-full', DOT[tone])} />}
      {props.children}
    </span>
  );
}
