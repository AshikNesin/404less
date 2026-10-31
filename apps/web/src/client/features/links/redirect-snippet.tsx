// Redirect rule for the user's platform, from the broken path to the chosen fix.
// Copy-paste ready: the fastest way to turn a suggestion into a real fix.
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { CodeBlock } from "../../components/copy-button";
import { SegmentedTabs } from "../../components/ui/tabs";
import { pathOf } from "../../lib/format";

type Platform = "agent" | "redirects" | "vercel" | "nginx" | "apache" | "nextjs";

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
  switch (platform) {
    case "agent":
      return agentPrompt(from, to, fromUrl, toUrl);
    case "redirects":
      return `# _redirects (Cloudflare Pages / Netlify)\n${from}  ${to}  301`;
    case "vercel":
      return JSON.stringify(
        { redirects: [{ source: from, destination: to, permanent: true }] },
        null,
        2,
      );
    case "nginx":
      return `location = ${from} {\n  return 301 ${to};\n}`;
    case "apache":
      return `# .htaccess\nRedirect 301 ${from} ${to}`;
    case "nextjs":
      return `// next.config.js\nmodule.exports = {\n  async redirects() {\n    return [{ source: ${JSON.stringify(from)}, destination: ${JSON.stringify(to)}, permanent: true }];\n  },\n};\n`;
  }
}

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
        label={platform === "agent" ? "Copy agent prompt" : "Copy redirect rule"}
      />
    </div>
  );
}
