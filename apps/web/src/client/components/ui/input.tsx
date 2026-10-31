// Form controls: @groot/ui's Input, Textarea and Label; a native <select>
// styled like Input (pages need its plain value/onChange); FormField stacks
// a label, the control and a hint.
import { Input } from "@groot/ui/input";
import { Label } from "@groot/ui/label";
import { Textarea } from "@groot/ui/textarea";
import { cn } from "../../lib/utils";

export { Input, Label, Textarea };

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-auto min-w-0 cursor-pointer appearance-none rounded-xl border border-input bg-transparent px-3 pr-7 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        'bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%236b7280%27%20stroke-width=%272.5%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_10px_center] bg-no-repeat',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** A labeled form control with an optional hint, stacked. */
export function FormField({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-meta">{hint}</p>}
    </div>
  );
}
