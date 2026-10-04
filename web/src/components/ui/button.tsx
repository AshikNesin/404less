// Button — Stripe-style: one accent, quiet secondaries, spinner on pending.
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent text-[0.8125rem] font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:outline-2 focus-visible:outline-ring active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        outline: 'border-border-strong bg-card text-foreground shadow-xs hover:bg-muted',
        secondary: 'bg-muted text-foreground hover:bg-border',
        ghost: 'text-foreground/75 hover:bg-muted hover:text-foreground',
        destructive: 'bg-destructive-subtle text-destructive hover:bg-destructive hover:text-primary-foreground',
        link: 'text-primary underline-offset-3 hover:underline',
      },
      size: {
        default: 'h-8 px-3.5',
        sm: 'h-7 px-3 text-xs',
        xs: 'h-6 px-2 text-[0.6875rem]',
        lg: 'h-10 px-5 text-sm',
        icon: 'size-8',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { pending?: boolean };

export function Button({ className, variant, size, pending, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || pending}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </button>
  );
}
