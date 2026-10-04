// ConfirmButton — two-step destructive action without dialogs.
// First click arms (turns destructive, shows "Sure?"), second confirms; blurs/disarms after 2.5s.
import { useEffect, useState } from 'react';
import { Button, type ButtonProps } from './button';

export function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirm', ...props }: {
  onConfirm: () => void; children: React.ReactNode; confirmLabel?: string;
} & Omit<ButtonProps, 'onClick' | 'variant'> & { variant?: ButtonProps['variant'] }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      {...props}
      variant={armed ? 'destructive' : (props.variant ?? 'outline')}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
