// Shared cells + actions for broken-link rows.
import { Link } from "../../lib/router";
import { ArrowUpRight, CircleCheck, EyeOff, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { HttpStatusBadge, SourceBadge } from "../../components/ui/status";
import { hostOf, isOnSite, pathOf } from "../../lib/format";
import type { LinkSource, LinkStatus } from "../../lib/types";
import { cn } from "../../lib/utils";

/** Path in site context (host shown only for off-site URLs), with title, status + source badges. */
export function UrlCell({
  url,
  domain,
  httpStatus,
  source,
  title,
  to,
  params,
  className,
}: {
  url: string;
  domain: string;
  httpStatus?: number | null;
  source?: LinkSource;
  title?: string | null;
  to?: string;
  params?: Record<string, string>;
  className?: string;
}) {
  const onSite = isOnSite(url, domain);
  const label = pathOf(url);
  const text = (
    <span className="block truncate font-medium" title={title ? `${title} — ${url}` : url}>
      {title ? (
        <span className="mr-1.5 font-semibold">{title}</span>
      ) : (
        !onSite && <span className="font-normal text-muted-foreground">{hostOf(url)}</span>
      )}
      {label}
    </span>
  );
  return (
    <div className={cn("min-w-0", className)}>
      {to ? (
        <Link to={to} params={params} className="block min-w-0 hover:underline">
          {text}
        </Link>
      ) : (
        text
      )}
      {(httpStatus !== undefined || source) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {httpStatus !== undefined && httpStatus !== null && (
            <HttpStatusBadge code={httpStatus} size="sm" />
          )}
          {source && <SourceBadge source={source} />}
        </div>
      )}
    </div>
  );
}

/** Opens a URL in a new tab; shows a readable label. */
export function ExternalUrl({
  url,
  label,
  className,
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className={cn("link inline-flex max-w-full items-center gap-1", className)}
    >
      <span className="truncate">{label ?? url}</span>
      <ArrowUpRight className="size-3 shrink-0" />
    </a>
  );
}

/** The suggested replacement for a broken URL: title over path, or a quiet dash. */
export function SuggestionCell({
  url,
  title,
  domain,
}: {
  url: string | null;
  title: string | null;
  domain: string;
}) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  const path = isOnSite(url, domain) ? pathOf(url) : url;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block min-w-0 hover:underline"
      title={url}
    >
      {title && <span className="block truncate">{title}</span>}
      <span className={cn("block truncate", title ? "text-meta" : "")}>{path}</span>
    </a>
  );
}

/** Resolve / Ignore / Reopen for one or many links, picked by the current status. */
export function StatusActions({
  status,
  onSet,
  pending,
  size = "sm",
  showLabels = true,
  recheck,
}: {
  status: LinkStatus | "mixed";
  onSet: (s: LinkStatus) => void;
  pending?: boolean;
  size?: "xs" | "sm";
  showLabels?: boolean;
  recheck?: { onClick: () => void; pending?: boolean };
}) {
  const iconSize = size === "xs" ? "icon-xs" : "icon-sm";
  const btn = (
    s: LinkStatus,
    label: string,
    Icon: typeof CircleCheck,
    variant: "outline" | "ghost" = "ghost",
  ) => (
    <Button
      key={s}
      variant={variant}
      size={showLabels ? size : iconSize}
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() => onSet(s)}
    >
      <Icon />
      {showLabels && label}
    </Button>
  );
  return (
    <div className="flex items-center gap-1">
      {recheck && (
        <Button
          variant="ghost"
          size={showLabels ? size : iconSize}
          aria-label="Re-check now"
          title="Re-check now"
          pending={recheck.pending}
          onClick={recheck.onClick}
        >
          {!recheck.pending && <RefreshCw />}
          {showLabels && "Re-check"}
        </Button>
      )}
      {status !== "resolved" && btn("resolved", "Resolve", CircleCheck, "outline")}
      {status !== "ignored" && btn("ignored", "Ignore", EyeOff)}
      {status !== "open" && btn("open", "Reopen", Undo2)}
    </div>
  );
}
