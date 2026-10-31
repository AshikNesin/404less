# Architecture Decision Records

ADRs record _why_ a decision was made — not what the code does. They are
written once, never edited (except status changes), and superseded rather
than deleted, so future sessions (human or AI) can reconstruct the reasoning
that the code alone cannot show.

## Conventions

- File naming: `NNNN-short-slug.md` (sequential, zero-padded).
- Structure: Status / Context / Decision / Consequences (+ Alternatives
  considered, links to related ADRs).
- Status is one of: `proposed`, `accepted`, `superseded by NNNN`, `reverted`.
- New ADRs are appended by number; supersedence is recorded in _both_ records.

## Index

| #    | Title                                                                                            | Status                        |
| ---- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| 0001 | [Own the DLS on the shadcn stack, Kumo as reference](0001-own-dls-on-shadcn-stack.md)            | accepted (reinstated by 0003) |
| 0002 | [Adopt @cloudflare/kumo directly](0002-adopt-kumo-directly.md)                                   | reverted by 0003              |
| 0003 | [Revert Kumo adoption; reinstate own DLS](0003-revert-kumo-adoption.md)                          | accepted                      |
| 0004 | [Hono + Drizzle on SQLite, for Node and Cloudflare Workers](0004-hono-drizzle-sqlite-workers.md) | accepted                      |
