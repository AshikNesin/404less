// Routing helpers over React Router. Pages name destinations by their full
// public path ("/app/sites/$siteId/links") with `params` and `search`, as they
// did under TanStack Router; these resolve them against the router's
// basename (/app) so links, active state and navigation stay in one place.
import { forwardRef, useCallback } from "react";
import { Link as RouterLink, useLocation, useMatch, useNavigate } from "react-router-dom";

/** The SPA's mount point; the marketing site owns everything else. */
export const BASENAME = "/app";

type Params = Record<string, string>;
type Search = Record<string, string | number | boolean | undefined | null>;

export type To = { to: string; params?: Params; search?: Search; hash?: string };

/** A router path (relative to the basename) for a public "/app/…" path with `$param`s filled in. */
export function resolvePath(to: string, params?: Params): string {
  const filled = to.replace(/\$([A-Za-z]+)/g, (_, key: string) =>
    encodeURIComponent(params?.[key] ?? ""),
  );
  const stripped =
    filled === BASENAME
      ? "/"
      : filled.startsWith(`${BASENAME}/`)
        ? filled.slice(BASENAME.length)
        : filled;
  return stripped || "/";
}

export function searchString(search?: Search): string {
  if (!search) return "";
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null && value !== "") p.set(key, String(value));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function href({ to, params, search, hash }: To): string {
  return `${resolvePath(to, params)}${searchString(search)}${hash ? `#${hash}` : ""}`;
}

type LinkProps = To &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    /** Active state: `exact` matches only this path; otherwise descendants count too. */
    activeOptions?: { exact?: boolean; includeSearch?: boolean };
  };

/**
 * A router link. Like TanStack Router's, it sets `data-status="active"` and
 * `aria-current="page"` when the current URL is at (or, without `exact`,
 * under) the destination.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, params, search, hash, activeOptions, ...props },
  ref,
) {
  const path = resolvePath(to, params);
  const active = useMatch({ path, end: activeOptions?.exact ?? false }) !== null;
  return (
    <RouterLink
      ref={ref}
      to={href({ to, params, search, hash })}
      data-status={active ? "active" : undefined}
      aria-current={active ? "page" : undefined}
      {...props}
    />
  );
});

/** Navigate to a public "/app/…" path: `navigate({ to, params, search, replace })`. */
export function useAppNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (dest: To & { replace?: boolean }) => navigate(href(dest), { replace: dest.replace }),
    [navigate],
  );
}

/** The current path as the public URL shows it (with the /app prefix). */
export function usePublicPathname(): string {
  const { pathname } = useLocation();
  return pathname === "/" ? BASENAME : `${BASENAME}${pathname}`;
}
