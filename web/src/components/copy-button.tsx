// Copies a value; the icon swaps to a check while copied.
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button, type ButtonProps } from './ui/button';

export function CopyButton({ value, label = 'Copy', children, ...props }: { value: string; label?: string } & Omit<ButtonProps, 'onClick' | 'value'>) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size={children ? 'sm' : 'icon-sm'}
      aria-label={label}
      title={label}
      {...props}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); } catch { /* clipboard blocked: nothing to do */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {children && (copied ? 'Copied' : children)}
    </Button>
  );
}

/** A read-only code block with a copy button, for snippets and keys. */
export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }) {
  return (
    <div className={className}>
      <div className="group relative rounded-lg border border-border bg-foreground/[0.03]">
        <pre className="overflow-x-auto px-3 py-2.5 pr-12 text-code leading-relaxed whitespace-pre-wrap break-all">{code}</pre>
        <div className="absolute top-1.5 right-1.5">
          <CopyButton value={code} label={label ?? 'Copy'} size="icon-xs" className="bg-card" />
        </div>
      </div>
    </div>
  );
}
