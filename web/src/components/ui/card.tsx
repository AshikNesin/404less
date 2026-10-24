// Card primitives modeled on open-seo's card slots.
import { cn } from '../../lib/utils';

export function Card({ className, size = 'default', ...props }: React.HTMLAttributes<HTMLDivElement> & { size?: 'sm' | 'default' | 'lg' }) {
  return (
    <div
      data-size={size}
      className={cn(
        'group/card flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card py-4 text-sm text-card-foreground shadow-xs',
        size === 'sm' && 'gap-3 rounded-lg py-3',
        size === 'lg' && 'gap-5 py-5',
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'grid auto-rows-min items-start gap-1 px-4 group-data-[size=lg]/card:px-5 sm:has-[>[data-slot=card-action]]:grid-cols-[1fr_auto] [.border-b]:pb-4',
        className,
      )}
      {...props}
    />
  );
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-[0.9375rem] leading-snug font-semibold tracking-[-0.005em] group-data-[size=sm]/card:text-sm', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-[0.8125rem] text-muted-foreground', className)} {...props} />;
}
export function CardAction({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-action" className={cn('mt-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:self-start sm:justify-self-end', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 group-data-[size=lg]/card:px-5', className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('-mb-4 mt-auto flex items-center border-t border-border bg-muted/50 px-4 py-3 group-data-[size=sm]/card:-mb-3', className)} {...props} />;
}
