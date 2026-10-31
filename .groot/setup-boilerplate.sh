#!/bin/bash
# Boilerplate Setup Script
#
# Run after cloning groot to customize it for your project:
#   1. Verify / install the portless CLI (`pnpm dev` runs through it)
#   2. Ask for an app name and propagate it to package.json,
#      apps/web/src/server/config.ts, wrangler.jsonc and .env.example
#   3. Install dependencies (also installs the Vite+ git hooks)
#
# Usage:  pnpm groot:setup
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info()    { echo -e "${BLUE}ℹ ${NC}$1"; }
print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error()   { echo -e "${RED}✗${NC} $1"; }

# "My Cool App" -> "my-cool-app"
to_slug() {
    echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-'
}

sed_inplace() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

check_git_repo() {
    if ! git rev-parse --is-inside-work-tree &> /dev/null; then
        print_error "Not a git repository. Run this script from the project root."
        exit 1
    fi
}

setup_portless() {
    print_info "Checking portless (required by pnpm dev; serves https://<app>.localhost)..."
    if command -v portless &> /dev/null; then
        print_success "portless is installed"
        return
    fi
    read -rp "Install portless globally via npm? (Y/n): " -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        npm install -g portless || { print_warning "Failed — run 'npm install -g portless' manually."; return; }
        command -v portless &> /dev/null && print_success "portless installed" || print_warning "Installation may have failed"
    else
        print_warning "Skipped. pnpm dev needs it: npm install -g portless"
    fi
}

update_app_name() {
    print_info "Configure your application name..."
    local current_name
    current_name=$(grep -oE 'name: "[^"]*"' apps/web/src/server/config.ts | head -1 | sed 's/name: "//;s/"$//')
    print_info "Current app name: ${current_name:-Groot}"
    read -rp "Enter your app name (e.g., 'My Cool App'): " app_name
    if [ -z "$app_name" ]; then
        print_warning "No app name provided, keeping '${current_name:-Groot}'"
        return 0
    fi
    local slug_name
    slug_name=$(to_slug "$app_name")
    if [[ ! "$slug_name" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
        print_error "'$app_name' gives no usable package/Worker name (needs ASCII letters or digits). Nothing changed."
        return 1
    fi
    echo

    # Every edit in one structured pass: the name travels as data (env vars),
    # never inside a sed program, so |, &, \ or quotes cannot corrupt a file.
    APP_NAME="$app_name" SLUG_NAME="$slug_name" node -e '
const fs = require("fs");
const name = process.env.APP_NAME;
const slug = process.env.SLUG_NAME;
const edit = (file, fn) => fs.writeFileSync(file, fn(fs.readFileSync(file, "utf8")));

// Human-readable name: shown in logs and passkey prompts.
edit("apps/web/src/server/config.ts", (s) => s.replace(/name: "[^"]*"/, () => `name: ${JSON.stringify(name)}`));
edit(".env.example", (s) => s.replace(/^RP_NAME=.*$/m, () => `RP_NAME=${name}`));

// Slug: package name and the Cloudflare Worker name.
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.name = slug;
if (pkg.repository?.url) pkg.repository.url = pkg.repository.url.replace(/\/[a-z0-9_-]+\.git$/, `/${slug}.git`);
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

// wrangler.jsonc: the top-level Worker name (whatever it currently is) and RP_NAME.
edit("wrangler.jsonc", (s) =>
  s
    .replace(/^  "name": "[^"]*"/m, () => `  "name": ${JSON.stringify(slug)}`)
    .replace(/"RP_NAME": "[^"]*"/, () => `"RP_NAME": ${JSON.stringify(name)}`),
);
'
    print_success "apps/web/src/server/config.ts: app.name → '$app_name'"
    print_success ".env.example: RP_NAME → '$app_name'"
    print_success "package.json: name → '$slug_name'"
    print_success "wrangler.jsonc: name → '$slug_name'"
}

install_dependencies() {
    print_info "Installing dependencies..."
    pnpm install
    print_success "Dependencies installed"
    # `pnpm install` runs the `prepare` script (`vp config`), which installs the
    # git hooks (lint-staged + gitleaks). Verify rather than assume.
    if git config core.hooksPath &> /dev/null; then
        print_success "Git hooks installed via Vite+ (lint-staged + gitleaks)"
    else
        print_warning "Git hooks not detected. Run 'pnpm prepare' manually."
    fi
}

final_steps() {
    echo ""
    print_info "Next steps:"
    echo "  1. pnpm dev                      # SQLite + Vite, zero config"
    echo "  2. Sign in with demo@example.com / demo@example.com"
    echo "  3. Deploy: docs/guides/deploy.md (Node) or docs/guides/deploy-cloudflare.md (Workers)"
    echo ""
    print_success "Setup complete!"
}

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║          🚀 Groot Setup                                    ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    check_git_repo
    setup_portless
    update_app_name
    install_dependencies
    final_steps
}

main
