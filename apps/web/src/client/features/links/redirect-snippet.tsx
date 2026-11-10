// Redirect rule for the user's platform, from the broken path to the chosen fix.
// Copy-paste ready: the fastest way to turn a suggestion into a real fix.
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { CodeBlock } from "../../components/copy-button";
import type { Language } from "../../lib/highlight";
import { SegmentedTabs } from "../../components/ui/tabs";
import { pathOf } from "../../lib/format";
import { productRule, type ProductPlatform } from "../../../shared/redirect-rules";

type Platform = "agent" | ProductPlatform;

function agentPrompt(from: string, to: string, fromUrl: string, toUrl: string): string {
  return [
    "Fix this broken link.",
    "",
    `Broken URL: ${fromUrl}`,
    `Replace it with: ${toUrl}`,
    "",
    "Do three things:",
    `1. Add a 301 redirect from ${from} to ${to} in whatever redirect mechanism this repo uses (look for _redirects, vercel.json, next.config.js, nginx config, or .htaccess).`,
    `2. Find every page that links to ${fromUrl} and update the href to ${toUrl}.`,
    "3. Open a PR with both changes; keep it minimal.",
  ].join("\n");
}

function rule(
  platform: Platform,
  from: string,
  to: string,
  fromUrl: string,
  toUrl: string,
): string {
  if (platform === "agent") return agentPrompt(from, to, fromUrl, toUrl);
  return productRule(platform, from, to);
}

const language: Record<Platform, Language> = {
  agent: "text",
  redirects: "conf",
  vercel: "json",
  nextjs: "jsx",
  nginx: "conf",
  apache: "conf",
};

export function RedirectSnippet({ fromUrl, toUrl }: { fromUrl: string; toUrl: string }) {
  const [platform, setPlatform] = useState<Platform>("agent");
  const from = pathOf(fromUrl).split("?")[0];
  const to = pathOf(toUrl).split("?")[0] || "/";
  return (
    <div className="space-y-3">
      <SegmentedTabs
        value={platform}
        onChange={setPlatform}
        items={[
          { value: "agent", label: "Ask your agent" },
          { value: "redirects", label: "_redirects" },
          { value: "vercel", label: "Vercel" },
          { value: "nextjs", label: "Next.js" },
          { value: "nginx", label: "Nginx" },
          { value: "apache", label: "Apache" },
        ]}
      />
      {platform === "agent" && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 text-[0.8125rem]">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden />
          <span>
            Paste this into your agent. If the 404less MCP server is connected, it can also pull
            every other broken link at once.
          </span>
        </div>
      )}
      <CodeBlock
        code={rule(platform, from, to, fromUrl, toUrl)}
        language={language[platform]}
        label={platform === "agent" ? "Copy agent prompt" : "Copy redirect rule"}
      />
    </div>
  );
}
