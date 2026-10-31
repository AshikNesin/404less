---
name: groot-dls
description: Groot's Design Language System rules for building and reviewing UI in this repo. Covers the closed type scale, semantic tokens, instant-color-hover motion language, mono/meta idioms, and composition primitives. Triggers on "dls", "design system", "ui consistency", "type scale", "check:tokens", "design tokens", "styling rules", "page layout", "typography".
metadata:
  tags: dls, design-system, ui, typography, tailwind, tokens, consistency
---

# Groot DLS

**Source of truth:** [`docs/features/dls.md`](../../../docs/features/dls.md)
**Enforcement:** `pnpm check:tokens` (9 rules, runs in pre-commit + CI)
**Primitives:** `@groot/ui` (Radix + cva + Tailwind v4), composition in
`@groot/shell/components/layout/`

Rules adapted from Cloudflare Kumo's design skill (MIT) — re-derived for our
Radix/shadcn stack, not copied. Kumo is the reference, not a dependency.

## When to use this skill

Building or reviewing any client UI: new pages, new components, styling
changes, design review. **Load the full rules** from
`docs/features/dls.md` before writing classNames — that document defines the
sanctioned type scale and the rationale for each rule.

## The non-negotiables

1. **Closed type scale.** `Text` / `h1Class` / `statClass` / `displayClass` /
   `monoClass` / `metaLabelClass` from `@groot/ui` are the only
   text treatments. Never write a new `text-*` size in page code.
2. **Semantic tokens only.** `text-foreground`, `bg-muted`, `border-border`,
   `text-destructive`, `text-success`, … Raw palette classes live only in
   `packages/shell/src/index.css`.
3. **Never modify tracking.** No `tracking-*` classes anywhere except
   `metaLabelClass` (uppercase meta labels, `tracking-wider`, defined once in
   `@groot/ui/typography`).
4. **Never `font-bold`.** `font-semibold` is the heaviest weight.
5. **Instant color hover.** No `transition-colors`/`transition-all` in pages —
   color changes are immediate. Transform transitions are fine. Entrance/exit
   choreography lives in `@groot/ui` primitives only.
6. **Inline mono at 0.9em.** `font-mono text-[0.9em]` (or `monoClass`) — mono
   glyphs are optically larger, so they sit even with surrounding prose at
   90% size. `text-xs`/`text-[11px]` mono (smaller than prose) is also fine.
7. **Icons: `size-4` / `size-3.5`.** Square `h-N w-N` is legacy. Inside
   Button/DropdownMenuItem/Badge, drop `mr-2` — they already set `gap`.
8. **Composition over hand-rolling.** Page titles → `PageLayout`;
   sections → `Section`; surfaces → `Card`; empty/failed states →
   `EmptyState`/`ErrorState`; loading → `Skeleton*`; tables → `Table` +
   `tableColumnHeaderClass`; status → `StatusBadge`.
9. **Sentence case headings.** "Recent requests", not "Recent Requests".
10. **Dialogs via `open` prop.** Never conditionally render (`{open && <Dialog>}`)
    — it kills exit animations. Use `<Dialog open={open} onOpenChange={setOpen}>`.
11. **No stacked layer cards.** One card layer per surface — don't nest cards
    visually on top of each other; separate with `border` or spacing.
12. **Sticky separation with `border`.** Not shadows.
13. **Concentric radii.** When surfaces are ≤8px apart, outer radius = inner
    radius + padding.
14. **Related text closer together.** Spacing within a text group is smaller
    than the spacing around it.
15. **Review against `check:tokens`.** After UI changes run `pnpm check:tokens`;
    it must pass before commit. If a rule needs an exemption, add it to the
    rule's `allow` list in `scripts/check-design-tokens.ts` with a comment
    explaining why.

## Quick reference

```tsx
import { Text, metaLabelClass, monoClass } from "@groot/ui";

<PageLayout title="API tokens" description="Manage access">
  <Section title="Recent requests" meta="12 of 40">
    <Text variant="title">Standalone title</Text>
    <Text variant="meta">Updated 2 minutes ago</Text>
    <Text variant="code" tone="muted">
      {job.id}
    </Text>
    <span className={metaLabelClass}>Column header</span>
  </Section>
</PageLayout>;
```

(`metaLabelClass` uppercases via CSS — always write the source text in
sentence case and let the class transform it.)

## Rule ↔ gate mapping

| DLS rule               | Gate rule                 | Layer exempt               |
| ---------------------- | ------------------------- | -------------------------- |
| never modify tracking  | `tracking-modified`       | typography.tsx             |
| never font-bold        | `font-bold`               | —                          |
| instant color hover    | `transition-colors-hover` | `packages/ui/src/`         |
| mono at `text-[0.9em]` | `inline-mono-full-step`   | typography/command/palette |
