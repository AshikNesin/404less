// What a brand-new site's overview shows instead of four zero stats, an empty
// chart and two empty lists: a dimmed preview of the layout with one note on
// what fills it. Replaced by the real overview after the first hit, broken
// link or crawl.
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

const STATS = [
  "Open broken links",
  "404 hits, last 7 days",
  "Visitor hits, last 30 days",
  "Last crawl",
];

/** Sample bar heights (percent): a quiet month with a couple of spikes. */
const BARS = [
  18, 26, 14, 32, 22, 12, 28, 40, 24, 16, 30, 20, 58, 34, 22, 18, 26, 14, 36, 24, 20, 30, 16, 42,
  72, 38, 26, 20, 30, 24,
];

export function OverviewPlaceholder() {
  return (
    <section className="relative" aria-labelledby="overview-placeholder-title">
      <div
        aria-hidden
        className="pointer-events-none space-y-4 opacity-70 select-none [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATS.map((label) => (
            <Card key={label} size="sm" className="gap-2 px-4 py-3.5">
              <div className="text-meta truncate">{label}</div>
              <div className="h-7 w-14 rounded-md bg-foreground/[0.06]" />
              <div className="h-3 w-24 rounded bg-foreground/[0.04]" />
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>404 hits per day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-36 items-end gap-0.5 border-b border-border">
              {BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-[3px] bg-foreground/[0.08]"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Card className="max-w-sm items-center px-5 text-center">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground/[0.06]">
            <BarChart3 className="size-4" aria-hidden />
          </span>
          <h2 id="overview-placeholder-title" className="text-section-title">
            Your numbers show up here
          </h2>
          <p className="text-caption -mt-2">
            Broken links, hits per day and where visitors came from fill in as soon as the snippet
            reports its first 404 or a crawl finishes. Finish the steps above to get there.
          </p>
        </Card>
      </div>
    </section>
  );
}
