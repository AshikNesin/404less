# Site illustrations

The marketing site's animated product shots, built with the
[Stageshow](https://github.com/benjitaylor/skills/tree/main/stageshow) skill
(installed for agents at `.agents/skills/stageshow`; read its `SKILL.md`
before changing a demo).

- `kit/`: Stageshow's React kit, copied as-is (MIT, see `kit/LICENSE`).
  Lint and format skip it (`.eslintignore`, `.prettierignore`) so it can be
  refreshed from the skill without a diff. Import parts from their own files
  (`kit/stage`, `kit/motion/Count`), not `kit/index.ts`, so the bundle only
  carries what the demos use.
- `look.css`: the dashboard's tokens mapped onto the kit's (`.l4-look`).
- `hero/`: the home page hero, one broken link from caught to fixed.
- `widget/`: the visitor's 404 page with the suggestion card.
- `main.tsx`: mounts each demo into its `data-demo="<name>"` slot. The slot
  holds a static fallback for readers without JavaScript and keeps the
  stage's shape until the demo mounts (`site.css`, `.demo-slot`).

`site/build.mjs` bundles `main.tsx` with esbuild into `/demos.js` and
`/demos.css`, and links them only on pages with a `data-demo` slot.
`pnpm typecheck:site` typechecks this folder.

## Filming

Build with the kit's development warnings on, serve `dist/client`, and film
with the skill's tools (they need `playwright-core` beside them and
`CHROME_PATH=/opt/pw-browsers/chromium` in the cloud sandbox):

```bash
DEMOS_DEV=1 node site/build.mjs
```

```bash
node .agents/skills/stageshow/scripts/film.mjs http://localhost:4173/index.html --select .demo-hero --every 1000 --count 12 --gate
```

Film at `--width 390` too (both demos have a `compact` design for the phone
column) and with `--reduced` (the poster).

## Rehearsal notes

- **Hero.** Gold: `hero-demo` and `static-card` (the well, one gutter, the
  hero shadow). Corner bleed: the window runs off the right and bottom, its
  page laid out to the width in view. Beats: a hit lands (39 → 40), the rule
  switches to Nginx, Copy, Resolve; plays once and holds the resolved link,
  which is also the reduced-motion poster. Compact (342 × 340) drops the
  suggestions card and moves Copy into the card's header so the rule fits.
  Rules match `redirect-snippet.tsx` word for word.
- **Widget.** Gold: `hero-demo` framing, `loading`/`form-error` for the
  arriving card. The card is on screen from the first frame; a click on the
  first suggestion rolls the URL and crossfades the page; Back (keycaps
  shown) loads the 404 again and the card drops back in, which is the loop.
  Compact (342 × 330) drops the big "404" and the card's subtitle.
- **Film.** `--gate` passes at 1280 and 390. Lines left standing: `jump`
  and `settle snap` on `Count` (the kit homing its digit strips under
  `data-snap`), `touching` on the URL (one word split for the `Roll`),
  `near aligned` between the platform tabs and the code (the code's own
  inset, as in the dashboard), `vanishes with no exit` on `Swap` (it hands
  off to its own fading copy).
- **Not checked.** Safari and Firefox, a real touch device, the live
  Worker (served from `dist/client` locally).
