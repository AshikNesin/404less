// Page chrome: the page frame, the title row with optional eyebrow / actions /
// back link, and section headings.
import { createLink } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

/** Standard page width + spacing. */
export function Page({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('mx-auto w-full space-y-6', wide ? 'max-w-7xl' : 'max-w-6xl', className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, actions, backLink, children }: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  backLink?: React.ReactNode;
  /** Extra row under the header, e.g. NavTabs. */
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {backLink}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          {eyebrow && <div className="text-eyebrow mb-1">{eyebrow}</div>}
          <h1 className="text-page-title flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{title}</h1>
          {description && <div className="text-caption mt-1">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function SectionHeader({ title, hint, action, className }: { title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-section-title">{title}</h2>
        {hint && <p className="text-meta">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function BackAnchor({ className, children, ...props }: ComponentProps<'a'>) {
  return (
    <a {...props} className={cn('inline-flex items-center gap-1 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground', className)}>
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </a>
  );
}
export const BackLink = createLink(BackAnchor);
