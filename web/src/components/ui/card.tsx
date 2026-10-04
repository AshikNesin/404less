// Card primitives modeled on open-seo's card slots.
import { cn } from '../../lib/utils';

export function Card({ className, size, ...props }: React.HTMLAttributes<HTMLDivElement> & { size?: 'sm' | 'default' }) {
  return <div className={cn('flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card py-4 text-sm text-card-foreground shadow-sm', size === 'sm' && 'gap-2 py-3', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid auto-rows-min items-start gap-1 px-4 has-[>[data-slot=card-action]]:grid-cols-[1fr_auto]', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-sm leading-snug font-semibold', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-muted-foreground text-xs', className)} {...props} />;
}
export function CardAction({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('col-start-2 self-start', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4', className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-auto px-4', className)} {...props} />;
}
