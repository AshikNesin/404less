// The marketing site's illustrations: small React islands built with the
// Stageshow kit (site/demos/kit, MIT, from benjitaylor/skills). site/build.mjs
// bundles this file with esbuild into /demos.{js,css}; each page marks a
// slot with data-demo="<name>" and keeps a static fallback inside it for
// no-JS readers, which the demo replaces.
import { createRoot } from "react-dom/client";
import type { ComponentType } from "react";
import { HeroDemo } from "./hero/HeroDemo";
import { WidgetDemo } from "./widget/WidgetDemo";
import "./look.css";

const DEMOS: Record<string, ComponentType> = {
  hero: HeroDemo,
  widget: WidgetDemo,
};

for (const slot of document.querySelectorAll<HTMLElement>("[data-demo]")) {
  const Demo = DEMOS[slot.dataset.demo ?? ""];
  if (!Demo) continue;
  slot.replaceChildren();
  slot.dataset.ready = "";
  createRoot(slot).render(<Demo />);
}
