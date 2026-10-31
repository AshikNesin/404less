// Alert: @groot/ui's Alert as an inline callout, info by default, warning or
// destructive when it matters.
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { Alert as GrootAlert, AlertDescription, AlertTitle } from "@groot/ui/alert";
import { cn } from "../../lib/utils";

const STYLES = {
  info: { box: "border-info/30 bg-info/[0.06]", icon: "text-info", Icon: Info },
  warning: {
    box: "border-warning/50 bg-warning/10",
    icon: "text-warning-foreground",
    Icon: TriangleAlert,
  },
  destructive: {
    box: "border-destructive/30 bg-destructive/[0.06]",
    icon: "text-destructive",
    Icon: CircleAlert,
  },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof STYLES;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { box, icon, Icon } = STYLES[tone];
  return (
    <GrootAlert
      role={tone === "destructive" ? "alert" : "status"}
      className={cn("px-4 py-3", box, className)}
    >
      <Icon className={cn("size-4", icon)} aria-hidden />
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          {title && <AlertTitle>{title}</AlertTitle>}
          {children && (
            <AlertDescription className="text-foreground/80">{children}</AlertDescription>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </GrootAlert>
  );
}
