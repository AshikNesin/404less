// The one way the app shows an HTTP status, a link's triage status, and which
// detector found it. Status colors mean state; never decoration.
import { Bot, CircleCheck, CircleDashed, EyeOff, MousePointerClick } from "lucide-react";
import { Badge, type BadgeTone } from "./badge";
import type { LinkSource, LinkStatus } from "../../lib/types";

export function HttpStatusBadge({
  code,
  size,
}: {
  code: number | null | undefined;
  size?: "sm" | "default";
}) {
  if (!code)
    return (
      <Badge tone="outline" size={size} title="Request failed (no HTTP response)">
        ERR
      </Badge>
    );
  const tone: BadgeTone = code < 300 ? "success" : code < 400 ? "warning" : "destructive";
  return (
    <Badge tone={tone} size={size}>
      {code}
    </Badge>
  );
}

const STATUS: Record<LinkStatus, { label: string; tone: BadgeTone; Icon: typeof CircleCheck }> = {
  open: { label: "Open", tone: "destructive", Icon: CircleDashed },
  resolved: { label: "Resolved", tone: "success", Icon: CircleCheck },
  ignored: { label: "Ignored", tone: "neutral", Icon: EyeOff },
};

export function LinkStatusBadge({ status, size }: { status: LinkStatus; size?: "sm" | "default" }) {
  const { label, tone, Icon } = STATUS[status];
  return (
    <Badge tone={tone} size={size}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

const SOURCE: Record<LinkSource, { label: string; title: string }> = {
  visitor: { label: "Visitors", title: "Reported by visitors hitting your 404 page" },
  crawler: { label: "Crawler", title: "Found by the scheduled crawler" },
  both: { label: "Visitors + crawler", title: "Hit by visitors and confirmed by the crawler" },
};

export function SourceBadge({
  source,
  size = "sm",
}: {
  source: LinkSource;
  size?: "sm" | "default";
}) {
  const { label, title } = SOURCE[source];
  return (
    <Badge tone="outline" size={size} title={title} className="gap-1 font-normal">
      {source !== "crawler" && <MousePointerClick aria-hidden />}
      {source !== "visitor" && <Bot aria-hidden />}
      {label}
    </Badge>
  );
}
