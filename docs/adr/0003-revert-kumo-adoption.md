# ADR 0003: Revert Kumo adoption; reinstate own DLS on shadcn stack

- Status: **accepted**
- Date: 2026-09-23
- Reverts: [0002](0002-adopt-kumo-directly.md)
- Reinstates: [0001](0001-own-dls-on-shadcn-stack.md)

## Context

A migration spike (branches `feat/kumo-migration` and `spike/kumo-adoption`,
now deleted) was run to validate ADR 0002's adoption of `@cloudflare/kumo`
directly. The spike did not produce a positive result, invalidating 0002's
core bet. Kumo never landed on `main` — no Kumo dependency or code exists
here — so the revert is purely a decision-record correction, not a code
revert.

## Decision

- Revert ADR 0002 (adopt Kumo directly).
- Reinstate ADR 0001: own the DLS on the existing stack (Tailwind v4 +
  Radix/shadcn + cva), with Kumo's conventions as a reference only.
- Delete the Kumo migration branches so the spike cannot be mistaken for
  in-flight work.

## Consequences

- The conventions layer (`@groot/ui` typography, gate rules, composition
  components from ADR 0001) remains the system of record.
- Maintenance burden of the component layer returns to this repo — the
  constraint that drove 0002 ("owner does not want to maintain UI
  components") is consciously overruled by the failed spike.
