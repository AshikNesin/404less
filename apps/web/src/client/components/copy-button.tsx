// Copies a value; the icon swaps to a check while copied.
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { highlight, type Language, type TokenType } from "../lib/highlight";
import { Button, type ButtonProps } from "./ui/button";

export function CopyButton({
  value,
  label = "Copy",
  children,
  ...props
}: { value: string; label?: string } & Omit<ButtonProps, "onClick" | "value">) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size={children ? "sm" : "icon-sm"}
      aria-label={label}
      title={label}
      {...props}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          return; // clipboard blocked: don't claim it was copied
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {children && (copied ? "Copied" : children)}
    </Button>
  );
}

const tokenClass: Record<TokenType, string | undefined> = {
  comment: "text-syntax-comment",
  keyword: "text-syntax-keyword",
  tag: "text-syntax-tag",
  attr: "text-syntax-attr",
  string: "text-syntax-string",
  number: "text-syntax-number",
  punct: "text-syntax-punct",
  plain: undefined,
};

/**
 * A read-only code block with a copy button, for snippets and keys.
 * `language` turns on syntax highlighting; prose (agent prompts) and bare
 * values (keys, URLs) stay `text`.
 */
export function CodeBlock({
  code,
  label,
  language = "text",
  className,
}: {
  code: string;
  label?: string;
  language?: Language;
  className?: string;
}) {
  const tokens = useMemo(() => highlight(code, language), [code, language]);
  return (
    <div className={className}>
      <div className="group relative rounded-lg border border-border bg-foreground/[0.03]">
        <pre className="overflow-x-auto px-3 py-2.5 pr-12 text-code leading-relaxed whitespace-pre-wrap wrap-anywhere">
          <code>
            {tokens.map((t, i) =>
              tokenClass[t.type] ? (
                <span key={i} className={tokenClass[t.type]}>
                  {t.text}
                </span>
              ) : (
                t.text
              ),
            )}
          </code>
        </pre>
        <div className="absolute top-1.5 right-1.5">
          <CopyButton value={code} label={label ?? "Copy"} size="icon-xs" className="bg-card" />
        </div>
      </div>
    </div>
  );
}
