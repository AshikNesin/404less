import { CircleCheck, CircleDashed, Copy, Check, Undo2 } from "lucide-react";
import type { Act } from "../kit/act";
import { Stage } from "../kit/stage";
import { Bar, Window } from "../kit/window";
import { Count } from "../kit/motion/Count";
import { Roll } from "../kit/motion/Roll";
import { States } from "../kit/motion/States";
import { Swap } from "../kit/motion/Swap";
import { Segmented } from "../kit/controls/Segmented";
import "./hero.css";

// The home page hero: one broken link in the 404less dashboard, from caught
// to fixed. A visitor hit lands on it, the redirect rule is switched to the
// site's platform and copied, then the link is resolved. It plays once when
// it comes into view and holds the fixed link.

type Platform = "redirects" | "nginx";
type S = {
  hits: number;
  seen: string;
  platform: Platform;
  copied: boolean;
  status: "open" | "resolved";
};

const initial: S = {
  hits: 39,
  seen: "2m ago",
  platform: "redirects",
  copied: false,
  status: "open",
};
// The frame most people see (a thumbnail, reduced motion): the link fixed,
// with the rule that fixed it still on screen
const POSTER: S = {
  hits: 40,
  seen: "just now",
  platform: "nginx",
  copied: false,
  status: "resolved",
};

const FROM = "/docs/getting-startd";
const TO = "/docs/getting-started";

// The rules exactly as the dashboard writes them
// (apps/web/src/client/features/links/redirect-snippet.tsx)
const RULES: Record<Platform, { text: string; kind?: "comment" }[]> = {
  redirects: [
    { text: "# _redirects (Cloudflare Pages / Netlify)", kind: "comment" },
    { text: `${FROM}  ${TO}  301` },
  ],
  nginx: [{ text: `location = ${FROM} {` }, { text: `  return 301 ${TO};` }, { text: "}" }],
};
const TABS = ["_redirects", "Vercel", "Next.js", "Nginx"];
const TAB_OF: Record<Platform, number> = { redirects: 0, nginx: 3 };

async function script(a: Act<S>) {
  await a.wait(900);
  // 1. A visitor lands on the typo: the hit is counted and the row is fresh
  await a.set({ hits: 40, seen: "just now" });
  await a.wait(1400);

  // 2. The site runs on Nginx: switch the rule to it
  await a.move({ at: "tab-nginx", x: 0.86, y: 0.72 });
  await a.wait(150);
  await a.click();
  await a.set({ platform: "nginx" });
  await a.wait(1300);

  // 3. Copy it
  await a.move({ at: "copy", x: 0.72, y: 0.74 });
  await a.wait(120);
  await a.click();
  await a.set({ copied: true });
  await a.wait(1100);

  // 4. Shipped: resolve the link
  await a.move({ at: "resolve", x: 0.9, y: 0.72 });
  await a.wait(150);
  await a.click();
  await a.set({ status: "resolved" });
  await a.wait(500);
  await a.move("rest");
  // The copy button settles back on its own, as the dashboard's does
  await a.set({ copied: false });
  await a.wait(2000);
}

export function HeroDemo() {
  return (
    <Stage
      width={520}
      height={512}
      compact={{ below: 440, width: 342, height: 340 }}
      initial={initial}
      poster={POSTER}
      script={script}
      play="once"
      cursor={{ at: "rest" }}
      className="l4-look l4-hero"
    >
      {(s, _rect, layout) => (
        <>
          <Window url="404less.acme.dev" urlShape="pill" className="l4-hero__window">
            <div className="l4-hero__page">
              <div className="l4-hero__titlerow">
                <span className="l4-hero__title">{FROM}</span>
                <StatusBadge status={s.status} />
              </div>
              <div className="l4-hero__meta">
                <span className="l4-hero__hits">
                  <Count value={s.hits} className="l4-hero__num" /> visitor hits ·{" "}
                  <Roll>{s.seen}</Roll>
                </span>
                <span
                  className="l4-hero__btn"
                  data-target="resolve"
                  data-open={s.status === "resolved" || undefined}
                >
                  <States
                    value={s.status}
                    align="start"
                    states={{
                      open: (
                        <span className="l4-hero__btnface">
                          <CircleCheck size={14} strokeWidth={2} /> Resolve
                        </span>
                      ),
                      resolved: (
                        <span className="l4-hero__btnface">
                          <Undo2 size={14} strokeWidth={2} /> Reopen
                        </span>
                      ),
                    }}
                  />
                </span>
              </div>

              {layout === "wide" && (
                <div className="l4-hero__card">
                  <div className="l4-hero__cardtitle">Suggested fixes</div>
                  <Fix selected title="Getting started" path={TO} score={73} best />
                  <Fix title="Installation" path="/docs/installation" score={33} />
                </div>
              )}

              <div className="l4-hero__card">
                <div className="l4-hero__cardhead">
                  <div className="l4-hero__cardtitle">Redirect rule</div>
                  {layout === "compact" && <CopyButton copied={s.copied} />}
                </div>
                <Segmented
                  className="l4-hero__tabs"
                  items={layout === "compact" ? TABS.filter((t) => t !== "Next.js") : TABS}
                  value={
                    layout === "compact" ? Math.min(TAB_OF[s.platform], 2) : TAB_OF[s.platform]
                  }
                  targets={
                    layout === "compact"
                      ? ["tab-redirects", "tab-vercel", "tab-nginx"]
                      : ["tab-redirects", "tab-vercel", "tab-next", "tab-nginx"]
                  }
                />
                <div className="l4-hero__code">
                  <Swap id={s.platform} style={{ display: "block", width: "100%" }}>
                    <pre>
                      {RULES[s.platform].map((l, i) => (
                        <span key={i} className="l4-hero__line" data-kind={l.kind}>
                          {/* a narrow box wraps the rule between paths, never inside one */}
                          {l.text.split(/(\s+)/).map((t, k) =>
                            /\s/.test(t) || !t ? (
                              t
                            ) : (
                              <span key={k} className="l4-hero__tok">
                                {t}
                              </span>
                            ),
                          )}
                        </span>
                      ))}
                    </pre>
                  </Swap>
                  {layout === "wide" && <CopyButton copied={s.copied} />}
                </div>
              </div>

              {/* the next card down, cut by the crop: filler only */}
              <div className="l4-hero__card l4-hero__card--filler">
                <Bar w={150} h={7} tone={3} />
                <Bar w={210} h={5} tone={2} />
              </div>
            </div>
          </Window>
          <span data-target="rest" className="l4-hero__rest" />
        </>
      )}
    </Stage>
  );
}

function CopyButton({ copied }: { copied: boolean }) {
  return (
    <span className="l4-hero__copy" data-target="copy" data-on={copied || undefined}>
      <States
        value={copied ? "check" : "copy"}
        states={{
          copy: <Copy size={14} strokeWidth={2} />,
          check: <Check size={14} strokeWidth={2.2} />,
        }}
      />
    </span>
  );
}

function StatusBadge({ status }: { status: S["status"] }) {
  return (
    <span className="l4-hero__badge" data-status={status}>
      <Swap id={status} duration={350}>
        <span className="l4-hero__badgeface">
          {status === "open" ? (
            <CircleDashed size={12} strokeWidth={2.2} />
          ) : (
            <CircleCheck size={12} strokeWidth={2.2} />
          )}
          {status === "open" ? "Open" : "Resolved"}
        </span>
      </Swap>
    </span>
  );
}

function Fix({
  title,
  path,
  score,
  best,
  selected,
}: {
  title: string;
  path: string;
  score: number;
  best?: boolean;
  selected?: boolean;
}) {
  return (
    <div className="l4-hero__fix" data-selected={selected || undefined}>
      <span className="l4-hero__dot" />
      <span className="l4-hero__fixtext">
        <span className="l4-hero__fixtitle">{title}</span>
        <span className="l4-hero__fixpath">{path}</span>
      </span>
      <Meter score={score} />
      <span className="l4-hero__score">{score}%</span>
      {best ? (
        <span className="l4-hero__best">Best</span>
      ) : (
        <span className="l4-hero__best" data-empty />
      )}
    </div>
  );
}

function Meter({ score }: { score: number }) {
  return (
    <span className="l4-hero__meter">
      <span style={{ width: `${score}%` }} />
    </span>
  );
}
