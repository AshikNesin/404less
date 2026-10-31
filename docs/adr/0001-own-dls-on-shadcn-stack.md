# ADR 0001: Own the DLS on the shadcn stack, with Kumo as reference

- Status: **accepted** (superseded by [0002](0002-adopt-kumo-directly.md),
  reinstated by [0003](0003-revert-kumo-adoption.md))
- Date: 2026-09-21

## Context

The UI felt inconsistent. An audit showed the primitive layer (shadcn-style
components in `@groot/ui` on Radix + cva + Tailwind v4) was disciplined —
the token gate was green, zero hand-rolled buttons — but the _conventions_
layer had drifted: per-page heading scales, `tracking-tight` on headings,
mixed hover transitions, local copies of the meta-label idiom. Kumo
(Cloudflare's design system, MIT, open-sourced Feb 2026) had just shipped a
15-rule "design skill" that codified exactly the missing conventions layer.

The owner wanted UI consistency, wanted to keep the existing stack, and at
that point was willing to own the system.

## Decision

Build our own DLS **on the existing stack** (Tailwind v4 + Radix/shadcn +
cva), adapting Kumo's rules as a _reference, not a dependency_:

1. Closed type scale — `@groot/ui/typography` (`Text`, `titleClass`,
   `h1Class`, `statClass`, `displayClass`, `monoClass`, `metaLabelClass`).
2. Gate enforcement — 4 new rules in `scripts/check-design-tokens.ts`
   (tracking, font-bold, transition-colors on hover, inline mono at 0.9em).
3. Composition components — `DataField`/`DataFields`, `StatTile`,
   `listRowClass`, built only where recurrence was demonstrated
   (pull, don't push).
4. Written spec (`docs/features/dls.md`) + agent skill
   (`.agents/skills/groot-dls/SKILL.md`).

Rejected alternatives at the time:

- **Adopt `@cloudflare/kumo` as a dependency** — Radix→Base UI swap, icon
  change (lucide→Phosphor), token remap, z-index/portal caveats, and
  Cloudflare-flavored breadth for components we'd rarely use.
- **Kumo token names** — churn with no user-visible gain.
- **Hybrid (Kumo for charts + shadcn core)** — two systems coexisting is the
  exact drift the DLS exists to kill.

## Consequences

- Landed as `feat/dls` (e95a091, 960a9c1): type scale, 9 gate rules,
  composition components, docs, skill. Reconciled 511 violations across
  nesins-finance-api via the sync.
- Ownership cost was real but bounded, and the gate made drift mechanical
  to fix rather than archaeological.

## Why superseded

One day later the owner reconsidered the _ownership_ trade-off: maintaining
in-house components (the 26 in `@groot/ui`, plus every future chart /
date-picker / combobox built "when demand appears") is ongoing work the
owner no longer wants. See ADR 0002. Notably, the pieces of 0001 that were
about _conventions and enforcement_ (the gate, the drift reconciliation)
remain valuable under 0002 — only the "own the implementations" half was
reversed.
