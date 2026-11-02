#!/usr/bin/env bash
# Build and serve the customer-site fixture the skill drives: a tiny site with
# real pages, a sitemap, a deliberately broken link, and a 404 page that loads
# the real /embed.js inline (data-404). Usage:
#   bash .agents/skills/verify-404less/fixtures.sh customer <site_key> [app_port] [fixture_port]
set -euo pipefail
KEY=${2:?site key required}
APP_PORT=${3:-3777}
PORT=${4:-8799}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
DIR="$ROOT/.verify/customer"
rm -rf "$DIR"; mkdir -p "$DIR/docs"

cat > "$DIR/index.html" <<EOF
<!doctype html><html><head><title>Verify home</title></head><body><h1>home</h1>
<a href="/docs/getting-started">Getting started</a> <a href="/docs/missng-page">Typo link</a></body></html>
EOF
printf '<!doctype html><html><head><title>Getting started</title></head><body>docs</body></html>' > "$DIR/docs/getting-started"
cat > "$DIR/sitemap.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>http://127.0.0.1:$PORT/</loc></url>
  <url><loc>http://127.0.0.1:$PORT/docs/getting-started</loc></url>
</urlset>
EOF
# the 404 page lives at the typo URL: suggestions for /docs/getting-startd
# rank /docs/getting-started at ~0.73, so the widget has something to show
mkdir -p "$DIR/docs"
cat > "$DIR/docs/getting-startd" <<EOF
<!doctype html><html data-404><head><meta charset="utf-8"><title>404: Page not found</title>
<script src="http://127.0.0.1:$APP_PORT/embed.js" data-site="$KEY" data-404 data-mode="inline" data-target="#suggest" defer></script></head>
<body><h1>Page not found</h1><div id="suggest"></div></body></html>
EOF

cd "$DIR" && exec busybox httpd -f -p "$PORT" -h .
