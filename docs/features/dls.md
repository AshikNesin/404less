# The Groot DLS (Design Language System)

This document is the source of truth for how groot UI looks and behaves. The
stack is **Tailwind v4 (CSS-first) + shadcn-style primitives (Radix) + cva**
in [`@groot/ui`](../../packages/ui), with rules adapted from
[Cloudflare Kumo](https://kumo-ui.com)'s design skill (MIT). We build our own
system; Kumo is the reference, not a dependency. Why, and the alternatives
that were rejected: [ADR 0001](../adr/0001-own-dls-on-shadcn-stack.md),
reinstated by [ADR 0003](../adr/0003-revert-kumo-adoption.md) after the Kumo
adoption in [ADR 0002](../adr/0002-adopt-kumo-directly.md) was reverted.

The rules are enforced by `pnpm check:tokens` (see
[enforcement](#enforcement)). Agents load the same rules through the
`groot-dls` skill (`.agents/skills/groot-dls/SKILL.md`).

## Principles

1. **The type scale is closed.** The sanctioned text treatments are defined in
   `@groot/ui/typography` and nowhere else. Pages never pick `text-*` sizes ad
   hoc; use `Text` (or the exported classes) instead.
2. **One definition per idiom.** `metaLabelClass` is the only uppercase
   `tracking-wider` label; `tableColumnHeaderClass` equals it by design;
   `monoClass` is the only inline-mono treatment.
3. **Semantic tokens only.** Colors come from token classes (`bg-primary`,
   `text-foreground`, `text-destructive`, `text-success`, `text-warning`,
   `text-info`, `text-muted-foreground`, `bg-muted`, `border-border`, …). Raw
   palette classes (`gray-*`, `red-*`, …) are allowed only in
   `packages/shell/src/index.css`, which defines the tokens.
4. **Primitives own motion.** Hover color changes are instant (no
   `transition-colors`); transforms may transition. Entrance/exit
   choreography lives in `@groot/ui` primitives, never in pages.
5. **Semantic markup, locked styling.** `Text` locks size/weight/tone; whether
   it renders as an `h2` or a `span` is the caller's structural decision.

## The type scale

| Class / component                         | Treatment                                                                | Use for                                     |
| ----------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| `Text variant="title"`                    | `font-heading text-base leading-snug font-medium`                        | Card and dialog titles, standalone headings |
| `Text variant="body"`                     | `text-sm` (14px)                                                         | Body, labels, buttons, data — the default   |
| `Text variant="meta"`                     | `text-xs text-muted-foreground`                                          | Timestamps, counts, helper copy             |
| `Text variant="code"` / `monoClass`       | `font-mono text-[0.9em]`                                                 | Inline ids, cron expressions, tokens        |
| `Text variant="stat"` / `statClass`       | `text-xl font-semibold tabular-nums`                                     | Standalone metric values (not headings)     |
| `PageLayout` h1 / `h1Class`               | `text-xl font-semibold sm:text-2xl`                                      | Routed-page title — the only `<h1>`         |
| `Text variant="display"` / `displayClass` | `text-3xl font-semibold leading-tight`                                   | Marketing/display moments (auth panels)     |
| `metaLabelClass`                          | `text-[11px] font-medium uppercase tracking-wider text-muted-foreground` | Column headers, dl labels, stat captions    |

Content text is 14px (`text-sm`) — 16px+ is reserved for titles and display.
`CardTitle` uses the `title` classes; `DialogTitle` differs only in
`leading-none`. `Section` renders its title at body size
(`text-sm font-medium`). `Text` also takes a `tone` (`default`, `muted`,
`primary`, `destructive`, `success`, `warning`, `info`, `inverted`); tones
map to tokens.

`metaLabelClass` uppercases through CSS, so write the source text in sentence
case.

## Theme and shape

The theme is warm monochrome: off-white and near-black surfaces with a faint
warm cast, hairline borders drawn from the foreground, and an achromatic
`--primary` (near-black in light mode, near-white in dark). Tokens live in
`packages/shell/src/index.css` as oklch variables surfaced through
`@theme inline`; dark mode is the `.dark` class on `<html>` and is the
default theme. The font is Inter Variable (`font-sans`; `font-heading` is the
same face).

Shape and height follow one scale so neighbours line up and nested corners
stay concentric. The radius steps derive from `--radius: 0.75rem`: `lg` is
`--radius`, `xl` 1.4×, `2xl` 1.8×, `3xl` 2.2×, `4xl` 2.6×, `md` 0.8×,
`sm` 0.6×.

**Control heights.** Controls in the same row use the same size. `Button`
has every size below; `SelectTrigger` takes `size="sm"` (`h-7`); `Input`,
`InputGroup` and `TabsList` are fixed at `h-9`.

| Size      | Height | Use for                                                   |
| --------- | ------ | --------------------------------------------------------- |
| `xs`      | `h-6`  | Dense inline actions                                      |
| `sm`      | `h-7`  | Section toolbars, table-row and card-row actions          |
| (default) | `h-9`  | Page-header actions, filter toolbars, forms, inline forms |
| `lg`      | `h-10` | Display moments (auth forms)                              |

Icon buttons follow the same steps (`icon-xs` size-6, `icon-sm` size-7,
`icon` size-9, `icon-lg` size-10). A page-header refresh is
`variant="outline" size="icon"`.

**Radius** by role, never by whim:

| Role                                                                  | Radius               |
| --------------------------------------------------------------------- | -------------------- |
| Controls (button, input, select trigger, textarea, input group, tabs) | `rounded-xl`         |
| Items inside a control or menu (tab trigger, menu / select item)      | `rounded-lg`         |
| Page surfaces (`Card`, panels, table frames)                          | `rounded-2xl`        |
| Modal surfaces (`Dialog`, `AlertDialog`, command palette)             | `rounded-3xl`        |
| Floating surfaces (dropdown, select menu, toast)                      | `rounded-xl`         |
| Inset blocks (code / JSON / log blocks, notices, `Alert`), icon tiles | `rounded-xl`         |
| Small inline (kbd, inline code), tooltip                              | `rounded-md` / `-lg` |
| Pills: `Badge`                                                        | `rounded-4xl`        |
| Pills: avatars, status dots                                           | `rounded-full`       |

A hand-rolled frame matches the primitive it stands in for: a table frame is
`rounded-2xl bg-card ring-1 ring-foreground/10` (as `Card`); a field-like
wrapper (a code editor in a form) is `rounded-xl border border-input` (as
`Input`); a trigger that opens a custom menu looks like a `SelectTrigger`.

**Fills**: hover and selected rows use `bg-muted` / `bg-accent` (both sit
above `--card` in dark mode so they show on cards), with no ring. Outline
buttons are transparent in light mode, so they take the surface they sit on;
in dark mode they add a faint `bg-input/30`.

## Which primitive to use

The primitives below are the _only_ way to render these things. Hand-rolling a
replacement is what makes the UI drift, so `pnpm check:tokens` fails the build
on the common cases.

| Need                       | Use                                                                                                                                                                      | Don't                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bordered surface         | `Card` (+ `CardHeader`/`CardContent`/`CardFooter`)                                                                                                                       | `rounded-xl border bg-card` on a `div`                                                                                                               |
| Page title / chrome        | `PageLayout` (`@groot/shell/components/layout/PageLayout`)                                                                                                               | a hand-written `<h1>` or `max-w-* mx-auto`                                                                                                           |
| In-page section heading    | `Section` (`title`, `meta`, `description`, `actions`)                                                                                                                    | a `text-sm font-medium` span + a count span                                                                                                          |
| Empty list / nothing found | `EmptyState`                                                                                                                                                             | an ad-hoc icon + heading + copy stack                                                                                                                |
| Failed load                | `ErrorState` (+ a retry `action`)                                                                                                                                        | ditto, tinted red                                                                                                                                    |
| Loading a whole surface    | `SkeletonTable` / `SkeletonList` / `SkeletonCard` from `@groot/ui` (compose with `Skeleton` for one-off bits); `LoadingState` only for unknown shapes or app-level gates | a per-page custom skeleton component, a bare "Loading…" string, an inline spinner div, or a big centered spinner inside a list whose layout is known |
| Tabular data               | `Table`; `tableColumnHeaderClass` for grid-based tables                                                                                                                  | a raw `<table>`/`<thead>`                                                                                                                            |
| Status / state pill        | `StatusBadge` (token-driven); `Badge` for neutral tags                                                                                                                   | a local status→color map                                                                                                                             |
| Destructive confirmation   | `const confirm = useConfirm()` (`@groot/ui/primitives`), then `await confirm({ title, destructive: true })`                                                              | a bespoke `Dialog`: it closes on an outside click, while a confirm closes only by its buttons or Escape                                              |
| A dialog holding a draft   | `<DialogContent dismissOnOutsideClick={false}>`                                                                                                                          | letting a stray outside click discard input that is expensive to re-enter                                                                            |
| Scrolling dialog content   | `DialogBody` between `DialogHeader` and `DialogFooter` (header and footer stay pinned)                                                                                   | a hand-rolled `overflow-y-auto` wrapper                                                                                                              |
| Icon sizing                | `size-4` / `size-3.5`                                                                                                                                                    | `h-4 w-4`                                                                                                                                            |
| Icon spacing in a button   | nothing — `Button` already sets `gap`                                                                                                                                    | `mr-2` on the icon                                                                                                                                   |
| Any text treatment         | `Text` / `metaLabelClass` / `monoClass` from `@groot/ui`                                                                                                                 | ad-hoc `text-*` sizes, `tracking-*`, `font-bold`, inline `font-mono` at full size                                                                    |
| Hover state                | instant color change                                                                                                                                                     | `transition-colors` / `transition-all` on hover                                                                                                      |
| Key-value data (read-only) | `DataField` + `DataFields` (the display counterpart of the form `Field`)                                                                                                 | hand-rolled `<dl>`/`<dt>`/`<dd>` with ad-hoc label classes                                                                                           |
| A standalone metric/stat   | `StatTile` (pass `onClick` and `active` for a filter tile)                                                                                                               | icon + label + `text-xl font-semibold tabular-nums` stacks written per page                                                                          |
| Interactive list rows      | `listRowClass` / `listRowGridClass` (class constants; rows stay semantic `<li>`/`<button>`)                                                                              | per-page `hover:bg-muted/40 px-4 py-3 …` strings                                                                                                     |

`useConfirm` and toasts need `GrootUIProvider` (`@groot/ui/provider`)
mounted once near the root.

**Pull, don't push:** components are added when a pattern recurs (each of
`DataField`, `StatTile` and the list-row classes replaced at least three
hand-rolled copies), not preemptively. Charts, date pickers, comboboxes, tag
inputs, meters and toolbars are deliberately absent; build them against our
tokens when a feature needs one.

## Rules (adapted from Kumo, re-derived for Radix)

| #   | Rule                                                                                   | Enforced                     |
| --- | -------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | Content text is 14px; 16px+ only for titles/display                                    | partial (type-scale classes) |
| 2   | Sentence case for headings and titles                                                  | no                           |
| 3   | Never modify letter tracking (`tracking-*`)                                            | yes                          |
| 3a  | …except `metaLabelClass`, the single sanctioned uppercase `tracking-wider` label       | via allow-list               |
| 4   | Never `font-bold`; `font-semibold` is the max weight                                   | yes                          |
| 5   | Related text groups closer together than their parent group                            | no                           |
| 6   | Optical spacing around text (vertical < horizontal)                                    | no                           |
| 7   | No color transitions on hover — instant color change                                   | yes (outside `@groot/ui`)    |
| 8   | Borders and shadows don't combine; prefer `ring-1 ring-foreground/10`                  | no                           |
| 9   | Concentric border radii (outer = inner + padding)                                      | no                           |
| 10  | Icons optically sized to and aligned with the first line of text (`size-4`/`size-3.5`) | icon-sizing rule             |
| 11  | Inline mono at `text-[0.9em]` (`monoClass`); smaller mono (`text-xs`) is fine          | yes                          |
| 12  | Sticky elements separated from content with `border`, not shadow                       | no                           |
| 13  | Collapsing content keeps its size during animation                                     | no                           |
| 14  | Never stack layer cards on top of one another                                          | no                           |
| 15  | Never conditionally render dialogs — control with `open` prop                          | no                           |

Rules marked _no_ are conventions enforced by review and the `groot-dls`
skill, not mechanical patterns.

## Enforcement

`scripts/check-design-tokens.ts` (`pnpm check:tokens`) runs ripgrep over
`*.ts`, `*.tsx` and `*.css` in every client dir (`packages/*/src` and
`apps/*/src/client`, so a new package or app is covered without an edit). It
runs on every commit through the `vp staged` pre-commit hook
(`vite.config.ts`) and in CI as a step of `.github/workflows/test.yml`, which
catches `--no-verify` commits.

| Rule                      | Catches                                                | Exempt                                                |
| ------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| `raw-palette-color`       | `text-gray-500`, `bg-red-100`, …                       | `packages/shell/src/index.css`                        |
| `hand-rolled-card`        | a line with `rounded-*`, `border` and `bg-card`        | `card.tsx`                                            |
| `raw-table-element`       | `<table>`, `<thead>`, `<tbody>`                        | `table.tsx`                                           |
| `redundant-icon-margin`   | `mr-*`/`ml-*` on an icon inside a gap-spaced component | —                                                     |
| `legacy-icon-sizing`      | square `h-N w-N`                                       | —                                                     |
| `tracking-modified`       | `tracking-tight` … `tracking-widest`                   | `typography.tsx` (`metaLabelClass`)                   |
| `font-bold`               | `font-bold`                                            | —                                                     |
| `transition-colors-hover` | `transition-colors`, `transition-all`                  | all of `packages/ui/src/` (primitives own motion)     |
| `inline-mono-full-step`   | `font-mono text-sm` (or `base`, `lg`, `xl`)            | `typography.tsx`, `command.tsx`, `CommandPalette.tsx` |

An exemption goes in the rule's `allow` list in the script, with a comment
saying why.
