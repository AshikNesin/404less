// Tabs. NavTabs are router links styled as underline tabs (pages with their
// own URL); SegmentedTabs is a controlled pill group for switching what a
// table shows, with optional counts.
import { createLink } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function NavTabs({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <nav aria-label={label} className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}>
      {children}
    </nav>
  );
}

// The router sets data-status="active" + aria-current="page" on the matching link.
function NavTabAnchor({ className, ...props }: ComponentProps<'a'>) {
  return (
    <a
      className={cn(
        'relative inline-flex h-9 shrink-0 items-center gap-1.5 px-3 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground',
        'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 data-[status=active]:after:opacity-100',
        className,
      )}
      {...props}
    />
  );
}
export const NavTab = createLink(NavTabAnchor);

export function SegmentedTabs<T extends string>({ value, onChange, items, className }: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('inline-flex h-8 items-center gap-0.5 rounded-lg bg-foreground/[0.06] p-[3px]', className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'inline-flex h-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
              active ? 'bg-card text-foreground shadow-xs' : 'text-foreground/60 hover:text-foreground',
            )}
          >
            {it.label}
            {it.count !== undefined && (
              <span className={cn('num rounded px-1 text-[0.6875rem]', active ? 'bg-foreground/[0.06] text-foreground/70' : 'text-foreground/45')}>
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
