// Badge: @groot/ui's Badge with 404less's semantic tones and an optional status dot.
// Tones mean state only; never decoration.
import { Badge as GrootBadge } from "@groot/ui/badge";
import { cn } from "../../lib/utils";

const TONES = {
  neutral: "bg-foreground/[0.06] text-foreground/75",
  destructive: "bg-destructive/10 text-destructive",
  success: "bg-success/10 text-success",
  warning: "bg-warning/20 text-warning-foreground",
  info: "bg-info/10 text-info",
  accent: "bg-primary/10 text-primary",
  outline: "border-border text-muted-foreground",
} as const;

const DOT = {
  neutral: "bg-subtle",
  destructive: "bg-destructive",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  accent: "bg-primary",
  outline: "bg-subtle",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  className,
  tone = "neutral",
  dot,
  size = "default",
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  dot?: boolean;
  size?: "sm" | "default";
}) {
  return (
    <GrootBadge
      variant={tone === "outline" ? "outline" : "secondary"}
      className={cn(
        "num gap-1.5",
        size === "sm" && "h-4 px-1.5 text-[0.625rem]",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOT[tone])} />}
      {children}
    </GrootBadge>
  );
}
