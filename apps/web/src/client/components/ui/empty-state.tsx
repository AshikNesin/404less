// The one empty state: @groot/ui's EmptyState / ErrorState. `kind` says why the
// region is empty; `variant` says where it sits (a dashed section, a card, or
// plain inside a card or table); `icon={null}` is the quiet text-only form
// used inside small cards.
import { CircleAlert, Inbox, SearchX, type LucideIcon } from "lucide-react";
import { Card } from "@groot/ui/card";
import { EmptyState as GrootEmptyState, ErrorState } from "@groot/ui/empty-state";
import { cn } from "../../lib/utils";

type EmptyStateKind = "no-data" | "filtered" | "error";
const KIND_ICONS: Record<EmptyStateKind, LucideIcon> = {
  "no-data": Inbox,
  filtered: SearchX,
  error: CircleAlert,
};

const PADDING = { sm: "py-6", default: "py-10", lg: "py-16" } as const;

export function EmptyState({
  kind = "no-data",
  icon = KIND_ICONS[kind],
  title,
  description,
  action,
  variant = "dashed",
  size = "default",
  className,
}: {
  kind?: EmptyStateKind;
  icon?: LucideIcon | null;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** `dashed` for sections, `card` for a whole panel, `plain` inside a card or table. */
  variant?: "dashed" | "card" | "plain";
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const body =
    icon === null ? (
      <div
        className={cn(
          "flex flex-col items-center gap-1 px-6 text-center text-balance",
          PADDING[size],
        )}
      >
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
        {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
      </div>
    ) : kind === "error" ? (
      <div role="alert">
        <ErrorState
          icon={icon}
          title={title}
          description={description}
          action={action}
          className={cn("text-balance", PADDING[size])}
        />
      </div>
    ) : (
      <GrootEmptyState
        icon={icon}
        title={title}
        description={description}
        action={action}
        className={cn("text-balance", PADDING[size])}
      />
    );
  if (variant === "card") return <Card className={cn("py-0", className)}>{body}</Card>;
  if (variant === "dashed")
    return (
      <div className={cn("w-full rounded-2xl border border-dashed border-border", className)}>
        {body}
      </div>
    );
  return <div className={cn("w-full", className)}>{body}</div>;
}
