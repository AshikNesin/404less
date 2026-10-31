# Portless & HTTPS Setup

How local dev gets a stable `https://groot.localhost` URL instead of a random port, and how to fix trust/HMR issues when it doesn't.

This project uses [portless](https://github.com/vercel-labs/portless) to replace port numbers with stable, named `.localhost` URLs during local development. HTTPS with HTTP/2 is enabled by default.

`pnpm dev` runs:

```bash
NODE_ENV=development PORTLESS_PORT=8888 portless run --name $npm_package_name tsx scripts/dev.ts
```

The name comes from `package.json` → `name` (`groot`). Which URL you get
depends on the portless proxy:

- **A proxy is already running** (for example one you started on 443 with
  `portless proxy start`): portless reuses it and the app is at
  `https://groot.localhost`.
- **No proxy is running**: `PORTLESS_PORT=8888` makes portless start one on
  port 8888, which needs no `sudo`, and the app is at
  `https://groot.localhost:8888`.

Portless prints the final URL when the app starts. In a git worktree it adds
the worktree name as a prefix (`https://<worktree>.groot.localhost`).

---

## 1. Install Portless (One-Time)

Portless must be installed **globally**. Do not add it as a project dependency.
`pnpm groot:setup` offers to install it; otherwise:

```bash
npm install -g portless
portless --version
```

---

## 2. Trust the Certificate (First Run)

On the first HTTPS proxy start, portless generates a local Certificate
Authority and adds it to the system trust store, which may prompt for your
password. Starting the proxy on 443 or 80 also asks for `sudo` to bind the
port. After trusting, browsers show no warnings on `https://*.localhost`.

If you dismissed the prompt or it failed, trust the CA manually:

```bash
portless trust
```

---

## 3. How It Works with This Project

Portless:

1. Starts the proxy daemon if none is running (see above for the port)
2. Assigns a random port (4000–4999) to the app via the `PORT` env var, which
   the Node entry listens on
3. Registers the app name with the proxy and routes
   `https://groot.localhost[:port]` → `localhost:<app-port>`
4. Injects `PORTLESS_URL`, the public URL of the app

### Vite HMR Integration

The Node entry (`apps/web/src/server/entry.node.ts`) and `vite.config.ts` read
`PORTLESS_URL` to point the HMR WebSocket at the portless URL: `wss://` for
HTTPS, the `.localhost` host, and the URL's port (443 when it has none). No
manual HMR configuration is needed. `VITE_HMR_URL` (a tunnel hostname) takes
precedence when set and forces `wss://` on port 443.

### Passkey (WebAuthn) Integration

If you use passkey authentication, set the relying party in `.env` to match
the portless URL exactly, including any port (the defaults are `localhost` /
`http://localhost:3000`):

```bash
RP_ID=groot.localhost
ORIGIN=https://groot.localhost        # or https://groot.localhost:8888
```

---

## 4. Troubleshooting

### Browser shows certificate warning

The local CA isn't trusted. Run `portless trust`, then restart your browser
(some browsers cache certificate state).

### "Address already in use" on port 443

Another process is using port 443. Check what's running:

```bash
sudo lsof -i :443
```

Stop the conflicting process, or stop the existing portless proxy with
`portless proxy stop`.

### Safari can't find your `.localhost` URL

Safari sometimes doesn't resolve `.localhost` subdomains. `portless hosts sync`
adds entries to `/etc/hosts`; `portless hosts clean` removes them later.

### Disable portless temporarily

```bash
PORTLESS=0 pnpm dev
# → http://localhost:3000 (plain HTTP, no portless needed)
```

`pnpm test:e2e` sets `PORTLESS=0` itself.

### Check active routes or stop the proxy

```bash
portless list
portless proxy stop
```

---

## 5. Using Custom Certs (Optional)

If you already have certificates from `mkcert` or another tool, start the proxy
yourself before `pnpm dev`:

```bash
portless proxy start --cert ./cert.pem --key ./key.pem
```

### Disable HTTPS Entirely

```bash
portless proxy start --no-tls
# App will be available at http://groot.localhost (port 80)
```

Or let `pnpm dev` start a plain-HTTP proxy on 8888
(`http://groot.localhost:8888`):

```bash
PORTLESS_HTTPS=0 pnpm dev
```
