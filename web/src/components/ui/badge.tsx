// Badge — status dots + tones. Semantic meaning only.
import { cn } from '../../lib/utils';

const TONES = {
  neutral: 'bg-muted text-foreground/70',
  destructive: 'bg-destructive-subtle text-destructive',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-foreground',
  accent: 'bg-primary-subtle text-primary',
  outline: 'border border-border text-muted-foreground',
} as const;

const DOT = {
  neutral: 'bg-subtle',
  destructive: 'bg-destructive',
  success: 'bg-success',
  warning: 'bg-warning',
  accent: 'bg-primary',
  outline: 'bg-subtle',
} as const;

export function Badge({
  className, tone = 'neutral', dot, ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONES; dot?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap num',
      TONES[tone], className,
    )} {...props}>
      {dot && <span className={cn('size-1.5 rounded-full', DOT[tone])} />}
      {props.children}
    </span>
  );
}
