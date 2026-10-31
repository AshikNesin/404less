// Tables: @groot/ui's Table inside a Card frame, with a toolbar row above and
// pagination below. Cells wrap (long URLs truncate inside their own cells).
import { Card } from "@groot/ui/card";
import {
  Table as GrootTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@groot/ui/table";
import { cn } from "../../lib/utils";

export { TableBody as TBody, TableHeader as THead };

export function TableCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Card className={cn("gap-0 py-0", className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <GrootTable className={cn("text-[0.8125rem]", className)} {...props} />;
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <TableHead className={cn("h-9 px-3 py-0 first:pl-4 last:pr-4", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <TableCell
      className={cn("px-3 py-2.5 whitespace-normal first:pl-4 last:pr-4", className)}
      {...props}
    />
  );
}
export function Tr({
  className,
  "data-selected": selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { "data-selected"?: boolean }) {
  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className={cn("group", className)}
      {...props}
    />
  );
}

/** Filter controls on the left, actions on the right — the row above a table. */
export function TableToolbar({
  children,
  actions,
  className,
}: {
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
