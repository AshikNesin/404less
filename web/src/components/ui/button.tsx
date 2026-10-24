// Button — one accent, quiet secondaries, spinner on pending.
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-transparent text-[0.8125rem] font-medium whitespace-nowrap transition-all outline-none select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        outline: 'border-border bg-card text-foreground shadow-xs hover:bg-foreground/[0.04] aria-expanded:bg-foreground/[0.04]',
        secondary: 'bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1]',
        ghost: 'text-foreground/75 hover:bg-foreground/[0.06] hover:text-foreground aria-expanded:bg-foreground/[0.06]',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive hover:text-primary-foreground',
        link: 'link h-auto px-0 font-medium',
      },
      size: {
        default: 'h-8 px-3.5',
        sm: 'h-7 px-2.5 text-xs',
        xs: 'h-6 px-2 text-[0.6875rem] [&_svg]:size-3',
        lg: 'h-10 px-5 text-sm',
        icon: 'size-8',
        'icon-sm': 'size-7',
        'icon-xs': 'size-6 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { pending?: boolean };

export function Button({ className, variant, size, pending, disabled, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && <LoaderCircle className="animate-spin" />}
      {children}
    </button>
  );
}
