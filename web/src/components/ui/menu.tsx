// Menu — a small popover list anchored to a trigger. Closes on outside click,
// Escape, or item click. Enough for the site switcher and row actions; no
// dependency.
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

type TriggerProps = { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu'; 'aria-controls': string };

export function Menu({ trigger, children, align = 'start', className, width = 'w-56' }: {
  trigger: (props: TriggerProps, open: boolean) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: 'start' | 'end';
  className?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div ref={ref} className={cn('relative', className)}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu', 'aria-controls': id }, open)}
      {open && (
        <div
          id={id}
          role="menu"
          className={cn(
            'animate-fade-up absolute z-40 mt-1.5 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg',
            width,
            align === 'end' ? 'right-0' : 'left-0',
          )}
          onClick={(e) => { if ((e.target as HTMLElement).closest('[data-menu-item]')) close(); }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ className, children, active, destructive, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; destructive?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-menu-item
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.8125rem] outline-none hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
        active && 'bg-foreground/[0.05] font-medium',
        destructive && 'text-destructive hover:bg-destructive/10 [&_svg]:text-destructive',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pt-1.5 pb-1 text-eyebrow">{children}</div>;
}
