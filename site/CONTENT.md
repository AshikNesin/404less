# Marketing guides and comparisons

Draft articles live in `site/pages/guides/` and `site/pages/compare/`. The build
(`node site/build.mjs`, also run by `pnpm build:client`) turns each file into a
page under `dist/client/`. The Worker serves `/guides/some-slug` from
`guides/some-slug.html`.

## Publish a page

Every draft starts with a meta block. `"draft": true` does three things:

- adds `<meta name="robots" content="noindex">`
- leaves the URL out of `sitemap.xml`
- prints a yellow banner at the top of the page

The header still links to `/guides`, and the footer links to `/guides` and
`/compare`, so the drafts are reachable. `noindex` asks crawlers not to index
them. Take those links out if a deploy should happen before the copy is ready.

To publish one page:

1. Read it. Replace every `[ASHIK: …]` note with something you saw yourself
   (a screenshot, a count, a deploy you did). Delete the note.
2. Check the **Sources** list. If a vendor page moved, fix the sentence that
   cites it.
3. Remove `"draft": true` from that file’s meta block (or set it to `false`).
4. Optional: give the page its own Open Graph image. Drafts reuse `/og/og.png`.
   `pnpm build:og` renders the cards in `site/og/render.mjs`; point `"og"` at
   the new file.
5. `node site/check-content.mjs` then `pnpm build:site`. The check fails if a
   published page still contains `[ASHIK:`, and if a draft leaked into the
   sitemap.
6. Deploy as usual (`pnpm deploy`).

Publishing the whole section is the same, file by file. There is no second
flag. A page with no `draft` key is a normal page, same as `/embed`.

## Add a page

Copy an existing file. Keep the meta block first. Set `path` to a slash URL of
lowercase segments (`/guides/my-slug`). The filename should match, under
`site/pages/`. `{{cta}}` expands to `site/partials/cta.html` (self-host buttons
and the cloud waitlist link).

`node site/check-content.mjs` also checks that the redirect samples in the
guides still match `apps/web/src/client/features/links/redirect-snippet.tsx`,
and that `data-check="json"` / `data-check="js"` / `data-check="redirects"`
blocks parse.

## Tool links

Guides link to `/tools/…` (redirect generator, chain checker, 404 page checker,
broken-link checker). Those pages are a separate piece of work and will 404
until that PR lands. The paths are the ones in the SEO plan.
