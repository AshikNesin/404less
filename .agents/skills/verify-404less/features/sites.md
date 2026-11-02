# Sites & onboarding

## Sub-features

- Add site (name + domain; `www.` stripped, port kept for localhost:port sites — the fixture relies on that).
- Per-team quota (`MAX_SITES_PER_TEAM`, default 5) → 402 with a message.
- Duplicate domain in a team → 409 naming the domain.
- Onboarding checklist on the overview (install snippet → first hit → optional crawl) that reacts to real events.
- Site settings: rename, exclusion patterns (`/wp-admin/*`), ignored status codes, digest window, delete (removes the whole graph).

## How to get to it (user POV)

First sign-in lands on "Add your first site"; afterwards "+ Add a site" in the sidebar or site switcher. Settings per site in the sidebar's "Site settings".

## Driving it with curl

`POST /api/v1/sites {"name","domain"}` → 201 with `site.id` + `site.site_key` (save both). Duplicate → 409. `teamId` of a team you don't belong to → 403 "not a team member". With a bearer key, every path is confined to the key's team.

## Driving it in the browser

`/app/sites/new`: `getByLabel("Domain")`, `getByLabel("Name")`, button `Add site`; expect navigation to `/app/sites/$id` and the checklist region. See tests/e2e/sites.spec.ts.

## Gotchas

- Domain validation is host-only: paths are silently dropped; `localhost` and `127.0.0.1:port` are accepted (crawler uses plain http for them via `siteOrigin`).
- Deleting a site row directly in SQL breaks FKs (events, links, checks, sources); use `DELETE /api/v1/sites/:id`.
