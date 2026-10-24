// Checkbox — native input, accent-colored, with indeterminate support for "select all".
import { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

export function Checkbox({ indeterminate, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !props.checked;
  }, [indeterminate, props.checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn('size-3.5 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed', className)}
      {...props}
    />
  );
}
