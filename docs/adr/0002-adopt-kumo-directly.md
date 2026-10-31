# ADR 0002: Adopt @cloudflare/kumo directly (no facade)

- Status: **reverted by [0003](0003-revert-kumo-adoption.md)**
- Date: 2026-09-22
- Supersedes: [0001](0001-own-dls-on-shadcn-stack.md)

## Context

After ADR 0001 landed, the owner stated a new constraint: they do **not**
want to maintain UI components at all. This reverses the load-bearing
assumption of 0001 ("willing to own the system") and makes 0001's main
rejection reason (migration cost of adopting Kumo) worth paying.

Research findings (2026-09-22):

- Kumo: 55 releases, 12 in the last 90 days, 3.9k stars, MIT, actively
  developed (latest 2.14.0).
- Its primitive layer, Base UI, hit 1.0 stable in Dec 2025 (now 1.8.0,
  MUI-org maintained) — the pre-1.0 risk from 0001's analysis has expired.
- Kumo's toolchain is Vite+/Oxlint/Oxfmt — same as groot's.
- Tree-shaking is good (~44 KB gzipped for a single-button app).
- Caveat: Kumo _patch_ releases sometimes change visuals (borderless table
  rows, trigger colors shipped in patches) and components get deprecated
  with compat shims (MenuBar → Tabs).

A facade option was considered: keep `@groot/ui` as a chokepoint of
re-exports over Kumo, preserving import paths for the 64+ importing files
in child projects and insuring against Kumo dying.

## Decision

**Adopt `@cloudflare/kumo` directly in app code.** No facade, no re-export
layer, no prop adapters. When Kumo is the choice, use it as Kumo.

- `@groot/ui` shrinks to what Kumo genuinely does not ship: form wiring
  (react-hook-form + zod over Kumo inputs) and project-specific composites
  (`StatusBadge`, `EmptyState`-style) — each must justify its existence
  against "just use Kumo's".
- Icons: Phosphor (`@phosphor-icons/react`, Kumo's peer dep) replaces
  lucide-react.
- Tokens: Kumo's semantic tokens (`--color-kumo-*`) with `data-mode`
  theming; `packages/shell/src/index.css` is reworked around Kumo's
  required import order (Kumo styles **before** `tailwindcss`, `@source`
  directive for node_modules).
- The design gate (`scripts/check-design-tokens.ts`) survives, reworked for
  Kumo's token names; the conventions it enforces (no tracking changes, no
  font-bold, instant color hover, mono at 0.9em) came _from Kumo's design
  skill_ and still apply to app-authored code.
- Version policy: pin exact; upgrades are visual reviews, not chore bumps.

### Why not the facade

The facade's only real asset is swap-insurance on an ~11-month-old OSS
dependency, plus fleet-wide pin coherence. The owner judged both worth less
than the honesty and simplicity of direct usage: no layer to keep in sync
with Kumo's API drift (their deprecation shims would become our adapter
work), no temptation to grow prop adapters later, and the bet is made
plainly rather than hedged. Five child projects sync `packages/**` from
groot; if the fleet ever must leave Kumo, that migration is accepted as a
deliberate future cost, recorded here.

## Consequences

- One-time migration across groot and (via sync) child projects: Radix →
  Base UI under the hood, cmdk → Kumo Command Palette, sonner → Kumo Toast,
  lucide → Phosphor (visible everywhere).
- Visual identity becomes Cloudflare-derived (themable via Kumo's token
  generator, but their bones).
- Child apps may import `@cloudflare/kumo` directly in app code; groot's
  `packages/**` remains the sync surface for shared composites.
- The DLS artifacts from 0001 that encode conventions (gate rules, docs,
  skill) are adapted, not discarded; the owned primitives
  (`typography.tsx`, `stat-tile.tsx`, `display.tsx`, `list-row.tsx`, the 26
  shadcn-style components) are deleted as Kumo replaces them.
- Rollback: if Kumo proves untenable, the path back is a coordinated
  migration (greatest cost of this decision, consciously accepted).

## Post-decision validation (spike)

A one-day spike preceded full adoption: install Kumo, migrate one
representative page, measure bundle delta / visual diff / per-component
friction (`@source`, portal z-index, token import order). The spike's
outcome is recorded in [0003](0003-revert-kumo-adoption.md): it did not
produce a positive result, and Kumo was never adopted.
