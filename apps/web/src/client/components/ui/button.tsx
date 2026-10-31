// Button: @groot/ui's Button, plus `pending` (spinner + disabled), a
// non-submitting default type, and press feedback: a quick scale-down on
// :active (transform only, so hover colors stay instant as the DLS asks).
import { LoaderCircle } from "lucide-react";
import { Button as GrootButton, type ButtonProps as GrootButtonProps } from "@groot/ui/button";
import { cn } from "../../lib/utils";

export type ButtonProps = GrootButtonProps & { pending?: boolean };

/** Replaces the kit's all-property transition and 1px nudge; menu triggers (aria-haspopup) don't shrink. */
const PRESS =
  "transition-transform duration-150 ease-out active:not-aria-[haspopup]:translate-y-0 active:not-aria-[haspopup]:scale-[0.97]";

export function Button({
  pending,
  disabled,
  children,
  type = "button",
  className,
  ...props
}: ButtonProps) {
  // asChild: the child element (e.g. an <a>) is the one control, styled as a button
  if (props.asChild)
    return (
      <GrootButton className={cn(PRESS, className)} {...props}>
        {children}
      </GrootButton>
    );
  return (
    <GrootButton
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={cn(PRESS, className)}
      {...props}
    >
      {pending && <LoaderCircle className="animate-spin" />}
      {children}
    </GrootButton>
  );
}
