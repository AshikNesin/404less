import { ArrowUpRight, Search } from "lucide-react";
import type { Act } from "../kit/act";
import { Stage } from "../kit/stage";
import { Bar, Window } from "../kit/window";
import { Collapse } from "../kit/motion/Collapse";
import { Roll } from "../kit/motion/Roll";
import "./widget.css";

// "Your visitors see this instead of a dead end." A visitor lands on a typo
// on someone's docs site; the 404less snippet drops its card of the closest
// pages into the site's own 404 page, and one click takes them where they
// meant to go. Going Back (its keys shown) loads the 404 again and the card
// drops in once more, which is the loop.

type S = { page: "404" | "doc"; card: boolean };

const initial: S = { page: "404", card: true };

const SUGGESTIONS = [
  { title: "Getting started", path: "/docs/getting-started" },
  { title: "Installation", path: "/docs/installation" },
];

async function script(a: Act<S>) {
  await a.wait(1600);

  // The visitor takes the first one
  await a.move({ at: "s-0", x: 0.9, y: 0.62 });
  await a.wait(450);
  await a.click();
  await a.set({ page: "doc" });
  await a.move("rest");
  await a.wait(2600);

  // Back to the 404, which loads again: the snippet reports the hit and asks
  // for the closest pages, and the card drops in
  await a.key("cmd+[");
  await a.set({ page: "404", card: false });
  await a.wait(450);
  await a.set({ card: true });
  await a.wait(900);
}

export function WidgetDemo() {
  return (
    <Stage
      width={508}
      height={416}
      compact={{ below: 440, width: 342, height: 330 }}
      initial={initial}
      hover={["s-0"]}
      script={script}
      cursor={{ at: "rest" }}
      keys="bottom-left"
      className="l4-look l4-widget"
    >
      {(s) => (
        <>
          <Window
            nav
            urlShape="pill"
            url={
              <span className="l4-widget__url">
                docs.acme.dev/docs/getting-
                <Roll>{s.page === "404" ? "startd" : "started"}</Roll>
              </span>
            }
            className="l4-widget__window"
          >
            <div className="l4-widget__site">
              <div className="l4-widget__header">
                <span className="l4-widget__brand">Acme Docs</span>
                <span className="l4-widget__nav">
                  <Bar w={34} h={6} tone={3} />
                  <Bar w={42} h={6} tone={3} />
                  <Bar w={28} h={6} tone={3} />
                </span>
              </div>

              <div className="l4-widget__pages">
                <div className="l4-widget__page" data-on={s.page === "404" || undefined}>
                  <div className="l4-widget__big">404</div>
                  <div className="l4-widget__h">Page not found</div>
                  <Collapse open={s.card} reveal="drop">
                    <div className="l4-widget__card">
                      <div className="l4-widget__head">
                        <span className="l4-widget__tile">
                          <Search size={16} strokeWidth={2} />
                        </span>
                        <span className="l4-widget__headtext">
                          <span className="l4-widget__title">Looking for something?</span>
                          <span className="l4-widget__sub">
                            One of these might be what you wanted.
                          </span>
                        </span>
                      </div>
                      {SUGGESTIONS.map((x, i) => (
                        <div
                          key={x.path}
                          className="l4-widget__row"
                          data-target={`s-${i}`}
                          data-cursor="pointer"
                        >
                          <span className="l4-widget__n" data-first={i === 0 || undefined}>
                            {i + 1}
                          </span>
                          <span className="l4-widget__rowtext">
                            <span className="l4-widget__rowtitle">{x.title}</span>
                            <span className="l4-widget__path">{x.path}</span>
                          </span>
                          <ArrowUpRight size={16} strokeWidth={2} className="l4-widget__arrow" />
                        </div>
                      ))}
                      <div className="l4-widget__row">
                        <span className="l4-widget__n">3</span>
                        <span className="l4-widget__rowtext">
                          <Bar w={92} h={7} tone={3} />
                          <Bar w={128} h={6} tone={2} />
                        </span>
                      </div>
                    </div>
                  </Collapse>
                </div>

                <div className="l4-widget__page" data-on={s.page === "doc" || undefined}>
                  <span className="l4-widget__crumb">
                    <Bar w={40} h={6} tone={2} />
                    <Bar w={6} h={6} r={3} tone={2} />
                    <Bar w={56} h={6} tone={2} />
                  </span>
                  <div className="l4-widget__doctitle">Getting started</div>
                  <div className="l4-widget__para">
                    <Bar w="100%" h={7} tone={2} />
                    <Bar w="94%" h={7} tone={2} />
                    <Bar w="62%" h={7} tone={2} />
                  </div>
                  <div className="l4-widget__codebars">
                    <Bar w={180} h={7} tone={4} />
                    <Bar w={132} h={7} tone={3} />
                  </div>
                  <div className="l4-widget__para">
                    <Bar w="88%" h={7} tone={2} />
                    <Bar w="96%" h={7} tone={2} />
                    <Bar w="40%" h={7} tone={2} />
                  </div>
                </div>
              </div>
            </div>
          </Window>
          <span data-target="rest" className="l4-widget__rest" />
        </>
      )}
    </Stage>
  );
}
