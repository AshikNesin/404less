// Checkbox: @groot/ui's (Radix) Checkbox, with "select all"'s indeterminate state.
import { Checkbox as GrootCheckbox } from "@groot/ui/checkbox";

export function Checkbox({
  checked,
  indeterminate,
  onCheckedChange,
  ...props
}: Omit<React.ComponentProps<typeof GrootCheckbox>, "checked" | "onCheckedChange"> & {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <GrootCheckbox
      checked={indeterminate && !checked ? "indeterminate" : checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      {...props}
    />
  );
}
