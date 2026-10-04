// Switch — designed toggle replacing raw checkboxes for on/off settings.
import { cn } from '../../lib/utils';

export function Switch({ checked, onCheckedChange, label, disabled }: {
  checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; disabled?: boolean;
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
        'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent transition-colors',
        'focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-border-strong',
      )}
    >
      <span className={cn(
        'inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform',
        checked ? 'translate-x-[15px]' : 'translate-x-[3px]',
      )} />
    </button>
  );
}

export function Field({ label, hint, children, className }: {
  label: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="text-[0.8125rem] font-medium">{label}</div>
        {hint && <div className="text-meta">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
