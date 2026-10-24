// Table footer pagination + the floating bulk-action bar for selected rows.
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from './button';

export function TablePagination({ page, pageSize, total, onPageChange, isLoading }: {
  page: number; pageSize: number; total: number; onPageChange: (p: number) => void; isLoading?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
      <span className="text-meta num">
        {total === 0 ? 'No results' : `${start}–${end} of ${total.toLocaleString()}`}
        {isLoading && ' · updating…'}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft /></Button>
          <span className="text-meta num px-1">{page} / {pages}</span>
          <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= pages} onClick={() => onPageChange(page + 1)}><ChevronRight /></Button>
        </div>
      )}
    </div>
  );
}

export function BulkBar({ count, label = 'selected', onClear, children }: {
  count: number; label?: string; onClear: () => void; children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
      <div role="toolbar" aria-label="Bulk actions"
        className="animate-fade-up pointer-events-auto flex items-stretch rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur">
        <div className="flex items-center gap-2 border-r border-border py-1.5 pr-3 pl-2 text-[0.8125rem]">
          <Button variant="ghost" size="icon-xs" aria-label="Clear selection" className="text-muted-foreground" onClick={onClear}><X /></Button>
          <span className="num font-medium">{count}</span>
          <span className="text-muted-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-1 px-1.5">{children}</div>
      </div>
    </div>
  );
}
