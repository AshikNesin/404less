// The embed snippet + how to install it, reused by settings and the new-site page.
import { CodeBlock } from "../../components/copy-button";
import { Button } from "../../components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { cn } from "../../lib/utils";

export function embedSnippet(siteKey: string, origin = window.location.origin): string {
  return `<script src="${origin}/embed.js" data-site="${siteKey}" defer></script>`;
}

export function InstallSnippet({
  siteKey,
  domain,
  compact,
  hideCode,
  className,
}: {
  siteKey: string;
  domain: string;
  compact?: boolean;
  hideCode?: boolean;
  className?: string;
}) {
  const origin = window.location.origin;
  const preview = (extra = "") =>
    `/embed-preview.html?site=${encodeURIComponent(siteKey)}&url=${encodeURIComponent(`https://${domain}/some-missing-page`)}${extra}`;
  return (
    <div className={cn("space-y-3", className)}>
      {!hideCode && <CodeBlock code={embedSnippet(siteKey, origin)} label="Copy snippet" />}
      {!compact && (
        <ul className="space-y-1.5 text-[0.8125rem] text-foreground/80">
          <li>
            <span className="font-medium text-foreground">Add it to your 404 template only.</span>{" "}
            The script detects a 404 page from the title, a{" "}
            <code className="text-code rounded bg-foreground/[0.05] px-1">data-404</code> attribute
            on <code className="text-code rounded bg-foreground/[0.05] px-1">&lt;html&gt;</code>, or
            a{" "}
            <code className="text-code rounded bg-foreground/[0.05] px-1">
              prerender-status-code
            </code>{" "}
            meta tag.
          </li>
          <li>
            <span className="font-medium text-foreground">Prefer to be explicit?</span> Add{" "}
            <code className="text-code rounded bg-foreground/[0.05] px-1">data-404="true"</code> to
            the script tag itself.
          </li>
          <li>
            <span className="font-medium text-foreground">Options:</span>{" "}
            <code className="text-code rounded bg-foreground/[0.05] px-1">
              data-mode="inline" data-target="#suggestions"
            </code>{" "}
            renders suggestions inside your page instead of a floating card;{" "}
            <code className="text-code rounded bg-foreground/[0.05] px-1">data-theme</code>,{" "}
            <code className="text-code rounded bg-foreground/[0.05] px-1">data-accent</code> and{" "}
            <code className="text-code rounded bg-foreground/[0.05] px-1">data-title</code> tune the
            look.
          </li>
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <a href={preview()} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm">
            Preview the widget <ArrowUpRight />
          </Button>
        </a>
        <a href={preview("&mode=inline")} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm">
            Inline mode <ArrowUpRight />
          </Button>
        </a>
      </div>
    </div>
  );
}
