// The install snippet per platform: plain HTML, Next.js, WordPress, Astro,
// or a paste-ready prompt for an agent that knows the codebase.
import { useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { CodeBlock } from "../../components/copy-button";
import { SegmentedTabs } from "../../components/ui/tabs";

type Platform = "html" | "next" | "wordpress" | "astro" | "agent";

const inline = "text-code rounded bg-foreground/[0.05] px-1";

/** The snippet to paste for a platform. `agent` has no snippet of its own (see agentPrompt). */
export function snippetFor(
  siteKey: string,
  platform: string,
  origin = window.location.origin,
): string {
  if (platform === "next") {
    return [
      "// app/not-found.js (App Router)",
      "import Script from 'next/script'",
      "",
      "export default function NotFound() {",
      "  return (",
      "    <>",
      "      <h1>404</h1>",
      // data-404: App Router not-found pages keep the root layout's title, so don't rely on it
      `      <Script src="${origin}/embed.js" data-site="${siteKey}" data-404="true" strategy="afterInteractive" />`,
      "    </>",
      "  )",
      "}",
    ].join("\n");
  }
  return `<script src="${origin}/embed.js" data-site="${siteKey}" defer></script>`;
}

/** A prompt that hands the whole install to an agent: site, snippet, verification. */
export function agentPrompt(
  siteKey: string,
  domain: string,
  origin = window.location.origin,
): string {
  return [
    `Install the 404less broken-link tracker on https://${domain}.`,
    "",
    "Add this script tag to our 404 page template:",
    `<script src="${origin}/embed.js" data-site="${siteKey}" defer></script>`,
    "",
    `Then verify it works by loading any missing page (e.g. https://${domain}/this-page-does-not-exist) and checking that a request to /api/track fires.`,
  ].join("\n");
}

const guidance: Record<Exclude<Platform, "agent">, ReactNode> = {
  html: (
    <>
      Paste it before <code className={inline}>&lt;/body&gt;</code> of the 404 template.
    </>
  ),
  next: (
    <>
      The App Router file is <code className={inline}>app/not-found.js</code>; the pages router uses{" "}
      <code className={inline}>pages/404.js</code>.
    </>
  ),
  wordpress: (
    <>
      Add it to <code className={inline}>404.php</code> in your theme (Appearance → Theme File
      Editor), before <code className={inline}>&lt;?php get_footer(); ?&gt;</code>, or use a plugin
      like WPCode.
    </>
  ),
  astro: (
    <>
      Add it to <code className={inline}>src/pages/404.astro</code> before the closing{" "}
      <code className={inline}>&lt;/body&gt;</code>.
    </>
  ),
};

export function PlatformSnippet({ siteKey, domain }: { siteKey: string; domain: string }) {
  const [platform, setPlatform] = useState<Platform>("html");
  return (
    <div className="space-y-3">
      <SegmentedTabs
        value={platform}
        onChange={setPlatform}
        items={[
          { value: "html", label: "HTML" },
          { value: "next", label: "Next.js" },
          { value: "wordpress", label: "WordPress" },
          { value: "astro", label: "Astro" },
          { value: "agent", label: "Ask your agent ✦" },
        ]}
      />
      {platform === "agent" ? (
        <>
          <CodeBlock code={agentPrompt(siteKey, domain)} label="Copy prompt" />
          <p className="flex items-start gap-2 text-meta">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden />
            <span>
              Your agent knows your framework and file layout. It can find the right 404 template,
              add the tag, and verify the hit.
            </span>
          </p>
        </>
      ) : (
        <>
          <CodeBlock code={snippetFor(siteKey, platform)} label="Copy snippet" />
          <p className="text-meta">{guidance[platform]}</p>
        </>
      )}
    </div>
  );
}
