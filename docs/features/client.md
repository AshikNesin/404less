# Client

A Vite + React 19 SPA that consumes the Hono API through a small `fetch`
client and React Query.

## Routing & layout

Routes are defined in `apps/web/src/client/App.tsx` (React Router 7):

| Route                   | Component            | From                                   | Auth      |
| ----------------------- | -------------------- | -------------------------------------- | --------- |
| `/login`                | `Login`              | `@groot/shell/pages/auth/Login`        | Public    |
| `/` → `/todos` (index)  | `Todos`              | `apps/web/src/client/pages/todo/Todos` | Protected |
| `/storage`              | `Storage`            | `@groot/shell/pages/storage/Storage`   | Protected |
| `/jobs`, `/jobs/:jobId` | `Jobs` / `JobDetail` | `@groot/jobs/client`                   | Protected |
| `/settings`             | `Settings`           | `@groot/shell/pages/settings/Settings` | Protected |

Any other path redirects to `/`. The router sits inside nuqs's `NuqsAdapter`
(URL state) and `GrootUIProvider` (`@groot/ui/provider`), which mounts the
toaster and the `ConfirmProvider` that `useConfirm()` needs.

`App` calls `checkAuth()` on mount. `ProtectedRoute` shows a spinner until it
settles, then redirects unauthenticated users to `/login`. `Layout` renders
the sidebar, the account menu, the ⌘K palette and an `<Outlet>` for nested
routes.

## Navigation (`ShellConfig`)

`<ShellProvider config={…}>` (`@groot/shell/lib/shell-config`) describes the
shell once:

| Field   | Drives                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `brand` | `{ label, icon?, to? }`: the sidebar, mobile bar and login logo; defaults to Groot, `LayoutDashboard`, `/`              |
| `nav`   | `{ label, icon?, to, primary? }[]`: `primary` entries are sidebar rows, the rest account-menu rows; all are ⌘K commands |
| `login` | `{ tagline?, description?, features? }`: the login brand panel                                                          |

The shell always adds the theme submenu and **Log out** (one action: end the
session, toast, go to `/login`) to the account menu, and Theme and Account
groups to ⌘K. `Layout` takes `commandGroups` for app-specific ⌘K groups
(listed between Navigation and Theme), `header` to replace the sidebar and
mobile bar with your own, and `padded`, `mainClassName`, `className`.

`App.tsx` keeps a `PAGES` list of `NavDestination & { element }`: it is both
`ShellConfig.nav` and the routes, so a page with a place in the navigation is
declared once. Routes without a nav entry (`jobs/:jobId`) are written out as
usual.

## Transport and session

`apiClient` (`@groot/shell/lib/api`) is pure transport on `fetch`: it prefixes
`/api/v1`, sends the cookie (`credentials: "include"`), JSON-encodes bodies
(`FormData` goes as multipart), unwraps the `{ success, data }` envelope and
throws an `ApiError` (`status`, `code`, `message`, `details`, `url`) for any
non-2xx response. `get`, `post`, `put` and `patch` also throw (code `NO_DATA`)
when a 2xx envelope has no `data`, so only `delete` suits an endpoint that
answers `204`. `postForm` uploads and `getBlob` downloads. It knows nothing
about sessions: `apiClient.onUnauthorized(handler)` reports each 401 with its
`path` and `sentAt` time.

The session is `useAuthStore` (`@groot/shell/store/auth`, Zustand). The server
keeps the JWT in an HttpOnly `token` cookie, so the store holds only the user:

| Member                                          | Does                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `user`, `isAuthenticated`, `hasCheckedAuth`     | The signed-in `SessionUser` (`{ id, email, name }`); whether `checkAuth()` settled           |
| `login(email, password)` / `loginWithPasskey()` | Sign in (`POST /auth/login`, or the WebAuthn ceremony); resolve with the user, or reject     |
| `logout()`                                      | `POST /auth/logout`, then ends the local session; never rejects                              |
| `checkAuth()`                                   | Resolves the session from the cookie on app load (`GET /auth/me`)                            |
| `generation`, `clearAuth()`                     | Bumped on every sign-in/out; end the local session without a server call                     |
| `loginErrorDescription(error, fallback)`        | The sign-in failure wording (401 → "Invalid email or password."; network and WebAuthn cases) |

The store installs the 401 hook: a 401 for a request sent during the current
session clears it, so `ProtectedRoute` redirects to `/login`. A 401 for a
request sent before the last sign-in or sign-out is ignored.

Response types come from the server, imported type-only (for example
`SessionUser` from `@groot/core/auth/auth.schema`), never hand-copied; see the
wire-type rule in [`AGENTS.md`](../../AGENTS.md).

## Data fetching

- The `QueryClient` is created in `apps/web/src/client/main.tsx`: queries stay
  fresh for 5 minutes, refetch on window focus and reconnect, and retry once.
  Mutations never retry, because a repeated POST can create a duplicate.
- Feature hooks (e.g. `useTodos`) wrap list + CRUD mutations and invalidate
  caches after each mutation.
- `useToastMutation(fn, { success, error, onSuccess })`
  (`@groot/shell/hooks/useToastMutation`) is `useMutation` with Sonner toasts.
  Its `onSuccess` is awaited, so returning an invalidation keeps `isPending`
  true until the refetch lands.

## UI system

Primitives live in [`@groot/ui`](../../packages/ui) (shadcn-style, on Radix
and cva); page chrome (`PageLayout`, `PageContainer`, `Section`) lives in
`@groot/shell/components/layout/`. Tailwind v4 is configured CSS-first in
`packages/shell/src/index.css`, which also defines the tokens. Which primitive
to use for what, the type scale, tokens and motion rules are in the
[DLS](./dls.md), enforced by `pnpm check:tokens`.

`main.tsx` calls `initTheme()` (`@groot/shell/lib/theme`) before the first
render, so the stored theme applies without a flash. The default is dark;
call `setDefaultTheme()` before `initTheme()` to change it.

## Layering (import rules)

| Layer                | Import path            | Purpose           | Synced? |
| -------------------- | ---------------------- | ----------------- | ------- |
| `@groot/ui`          | `@groot/ui/button`     | Design primitives | Yes     |
| `@groot/shell`       | `@groot/shell/lib/api` | Client infra      | Yes     |
| `@groot/jobs/client` | `@groot/jobs/client`   | Jobs dashboard    | Yes     |
| `apps/web/…/pages`   | `./pages/todo/Todos`   | Business features | No      |

`ui/` can't import `shell`/`pages`; `shell/` can't import `pages/`.

## Extending the client

1. Add the page to `PAGES` in `App.tsx` (route, sidebar or account-menu row
   and ⌘K entry in one line), or a plain `<Route>` if it has no nav entry.
2. Create a React Query hook in the feature's `hooks/` that calls `apiClient`
   (paths are relative to `/api/v1`).
3. Compose the UI in `pages/` with `PageLayout` and the `@groot/ui`
   primitives.
4. For global state, prefer Zustand slices or React Query caches over ad-hoc
   contexts.
