// Switch — on/off settings (@groot/ui has none); Field lays out a setting row.
import { cn } from "../../lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-foreground/20",
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-[15px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

/** One setting: label + hint on the left, the control on the right. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-6 py-3", className)}>
      <div className="min-w-0">
        <div className="text-[0.8125rem] font-medium">{label}</div>
        {hint && <div className="text-meta mt-0.5">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
