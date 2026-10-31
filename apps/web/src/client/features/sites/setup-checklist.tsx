// Three steps to a working site. The first unfinished one expands in place with
// everything it needs, so setup happens on the overview, not behind clicks.
import { Link } from "../../lib/router";
import { useEffect, useState } from "react";
import { Check, ChevronRight, Globe, Radio, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { InstallSnippet } from "./install-snippet";
import type { Overview, Site } from "../../lib/types";
import { cn } from "../../lib/utils";

export function setupSteps(site: Site, overview: Overview) {
  return [
    {
      key: "install",
      title: "Install the snippet on your 404 page",
      description: "One script tag. Visitor 404 hits start showing up here within seconds.",
      done: site.last_hit_at !== null,
      to: "/app/sites/$siteId/settings" as const,
      hash: "install",
    },
    {
      key: "index",
      title: "Import your sitemap or run a crawl",
      description:
        "Known pages power “did you mean” suggestions and give the crawler its starting points.",
      done: overview.knownUrls > 0,
      to: "/app/sites/$siteId/crawl" as const,
      hash: undefined,
    },
    {
      key: "alerts",
      title: "Add a notification channel",
      description:
        "Slack, Pushover or email. Hits are grouped into one digest per window, never one message per hit.",
      done: overview.channels > 0,
      to: "/app/settings/channels" as const,
      hash: undefined,
    },
  ];
}

export function SetupChecklist({ site, overview }: { site: Site; overview: Overview }) {
  const steps = setupSteps(site, overview);
  const remaining = steps.filter((s) => !s.done);
  const [open, setOpen] = useState<string | null>(remaining[0]?.key ?? null);
  // when the open step completes, the next one takes its place
  useEffect(() => {
    if (open && steps.find((s) => s.key === open)?.done) setOpen(remaining[0]?.key ?? null);
  }, [overview]); // eslint-disable-line react-hooks/exhaustive-deps
  if (remaining.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish setting up {site.name}</CardTitle>
        <CardDescription>
          {steps.length - remaining.length} of {steps.length} done
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {steps.map((s, i) => {
            const expanded = open === s.key && !s.done;
            return (
              <li key={s.key}>
                <div
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left",
                    s.done && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold num",
                      s.done
                        ? "bg-success text-primary-foreground"
                        : "bg-foreground/[0.06] text-foreground/70",
                    )}
                  >
                    {s.done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer text-left"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : s.key)}
                  >
                    <span
                      className={cn(
                        "block text-[0.8125rem] font-medium",
                        s.done && "line-through decoration-foreground/30",
                      )}
                    >
                      {s.title}
                    </span>
                    <span className="block text-meta">{s.description}</span>
                  </button>
                  {!s.done && (
                    <Link
                      to={s.to}
                      params={{ siteId: site.id }}
                      hash={s.hash}
                      className="shrink-0"
                      aria-label={`Open ${s.title}`}
                    >
                      <Button variant="ghost" size="icon-sm">
                        <ChevronRight className="size-4" />
                      </Button>
                    </Link>
                  )}
                </div>
                {expanded && <StepBody step={s.key} site={site} />}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function StepBody({ step, site }: { step: string; site: Site }) {
  if (step === "install") return <InstallStep site={site} />;
  if (step === "index") return <IndexStep site={site} />;
  return <AlertsStep />;
}

function InstallStep({ site }: { site: Site }) {
  return (
    <div className="space-y-3 border-t border-border bg-foreground/[0.015] px-3 py-3.5">
      <InstallSnippet siteKey={site.site_key} domain={site.domain} compact />
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`https://${site.domain}/404less-verify-${Date.now()}`}
          target="_blank"
          rel="noreferrer"
        >
          <Button variant="outline" size="sm">
            <Radio /> Open a test 404
          </Button>
        </a>
        <Link to="/app/sites/$siteId/settings" params={{ siteId: site.id }} hash="install">
          <Button variant="ghost" size="sm">
            Full instructions <ChevronRight />
          </Button>
        </Link>
      </div>
      <p className="text-meta">
        The overview updates itself the moment the first hit lands — no refresh needed.
      </p>
    </div>
  );
}

function IndexStep({ site }: { site: Site }) {
  return (
    <div className="space-y-2.5 border-t border-border bg-foreground/[0.015] px-3 py-3.5">
      <p className="text-[0.8125rem] text-foreground/80">
        Give the suggestion engine your pages once. Either works; both is best.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/app/sites/$siteId/crawl" params={{ siteId: site.id }}>
          <Button variant="outline" size="sm">
            <Search /> Import sitemap &amp; crawl
          </Button>
        </Link>
      </div>
      <p className="text-meta">
        The sitemap import also fetches each page’s real title in the background.
      </p>
    </div>
  );
}

function AlertsStep() {
  return (
    <div className="space-y-2.5 border-t border-border bg-foreground/[0.015] px-3 py-3.5">
      <p className="text-[0.8125rem] text-foreground/80">
        One digest per window per site — a bad deploy is one message, not hundreds.
      </p>
      <Link to="/app/settings/channels">
        <Button variant="outline" size="sm">
          <Globe /> Add a channel
        </Button>
      </Link>
    </div>
  );
}
