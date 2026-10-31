// Button: @groot/ui's Button, plus `pending` (spinner + disabled) and a
// non-submitting default type, as 404less pages expect.
import { LoaderCircle } from "lucide-react";
import { Button as GrootButton, type ButtonProps as GrootButtonProps } from "@groot/ui/button";

export type ButtonProps = GrootButtonProps & { pending?: boolean };

export function Button({ pending, disabled, children, type = "button", ...props }: ButtonProps) {
  return (
    <GrootButton
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && <LoaderCircle className="animate-spin" />}
      {children}
    </GrootButton>
  );
}
