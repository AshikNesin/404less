# Git hooks & secret detection

Every commit runs secret detection (gitleaks) and staged lint/format (Vite+).
This keeps secrets out of the repo and code style consistent — automatically.

## What Gets Checked

`.vite-hooks/pre-commit` runs, in order (`set -e`, so the first failure blocks
the commit):

| Step             | Command                                                                | Purpose                                                               |
| ---------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Gitleaks**     | `gitleaks protect --staged --verbose --redact --config .gitleaks.toml` | Scans the staged changes for hardcoded secrets; findings are redacted |
| **Vite+ staged** | `vp staged`                                                            | Runs the `staged` commands from `vite.config.ts` on the staged files  |

The `staged` block in `vite.config.ts`:

```typescript
staged: {
  "*": "vp check --fix",                     // lint + format (Oxlint + Oxfmt)
  "*.{ts,tsx,css}": "pnpm check:tokens",     // design-token rules
},
```

CI does not run gitleaks, so this hook is the only secret scan. Keep
`--staged`: without it `gitleaks protect` reads `git diff` (working tree
against the index) and skips exactly the content the commit will contain.

## Setup

```bash
# gitleaks is a separate binary; the hook fails with "gitleaks: not found" without it
brew install gitleaks  # macOS
# or: go install github.com/gitleaks/gitleaks/v8@latest  # Other platforms

pnpm install           # runs `prepare` (vp config), which installs the hooks
```

Rerun `pnpm prepare` if the hooks stop running (for example after changing
`core.hooksPath`).

## Running Manually

```bash
.vite-hooks/pre-commit                           # the whole hook
gitleaks protect --staged --config .gitleaks.toml  # gitleaks on the staged changes
pnpm exec vp staged                              # only the staged checks
```

## Gitleaks Configuration (`.gitleaks.toml`)

- `[extend] useDefault = true` keeps gitleaks' built-in rules (cloud keys,
  tokens, private keys, connection strings).
- Two custom rules catch generic assignments: `generic-password-assignment`
  (`password`/`passwd`/`pwd` followed by `=` or `:` and 4+ characters) and
  `generic-secret-assignment` (`secret`, `api_key`, `token`, ... with 8+
  characters).
- The global allowlist skips `.env.example`, everything under `docs/`, and
  `*.test.*` / `*.spec.*` files.

For a false positive elsewhere, add a path regex to `paths` under
`[allowlist]`, or end the line with a `gitleaks:allow` comment.

## Skipping Hooks

Only when necessary, for example a known test secret outside the allowlist:

```bash
git commit --no-verify -m "message"   # skip all hooks for one commit
VITE_GIT_HOOKS=0 git commit -m "..."  # same, via the hook wrapper
```

The release workflow sets `VITE_GIT_HOOKS=0` for its "chore: version packages"
commit because its runner has no gitleaks. If a secret was committed, rotate it;
removing it from a later commit does not remove it from history.

## Sensitive Files

`.gitignore` keeps these out of the repo:

```
.env                     # Environment files
.env.*                   # All env variants (except the committed .env.example)
.dev.vars                # wrangler dev secrets (copy from .dev.vars.example)
*.pem                    # Certificates
*.key                    # Private keys
*.crt                    # Certificates
secrets/                 # Secrets directory
credentials.json         # Credential files
service-account.json     # Service account keys
```
