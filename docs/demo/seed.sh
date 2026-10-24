#!/usr/bin/env bash
# Seed a local wrangler dev instance (npm run dev) with a realistic demo site for
# the product video. Prints the env vars capture.mjs needs and writes them to .demo.env.
set -euo pipefail
BASE=${BASE:-http://127.0.0.1:8787}
OUT=$(mktemp -d)
cd "$(dirname "$0")/../.." 

# 1. sign in (dev mode returns devLink)
LINK=$(curl -s -X POST "$BASE/auth/magic" -H 'Content-Type: application/json' -d '{"email":"demo@404less.com"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["devLink"])')
LINK=$(python3 - "$LINK" "$BASE" <<'EOF'
import sys
from urllib.parse import urlparse, urlunparse
link, base = sys.argv[1], sys.argv[2]
u = urlparse(link); b = urlparse(base)
print(urlunparse(u._replace(scheme=b.scheme, netloc=b.netloc)))
EOF
)
curl -s -o /dev/null -c "$OUT/cookies.txt" "$LINK"
COOKIE=$(grep f404_session "$OUT/cookies.txt" | awk '{print "f404_session="$7}')
echo "$COOKIE" > "$OUT/cookie.txt"
H=(-H "Content-Type: application/json" -H "Cookie: $COOKIE")

# 2. sites
SITE=$(curl -s -X POST "$BASE/api/sites" "${H[@]}" -d '{"name":"Acme Docs","domain":"docs.acme.dev"}')
SITE_ID=$(echo "$SITE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["site"]["id"])')
SITE_KEY=$(echo "$SITE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["site"]["site_key"])')
curl -s -X POST "$BASE/api/sites" "${H[@]}" -d '{"name":"Marketing site","domain":"acme.dev"}' > /dev/null
echo "$SITE_ID" > "$OUT/site_id.txt"; echo "$SITE_KEY" > "$OUT/site_key.txt"
echo "site=$SITE_ID key=$SITE_KEY"

# 3. known pages (what a sitemap import would produce)
SQL="$OUT/seed.sql"
: > "$SQL"
for p in "/docs/getting-started|Getting started" "/docs/installation|Installation" "/docs/configuration|Configuration" "/docs/api/authentication|API · Authentication" "/docs/api/webhooks|API · Webhooks" "/docs/guides/deploy-cloudflare|Deploy to Cloudflare" "/docs/guides/deploy-vercel|Deploy to Vercel" "/blog/launch|Introducing Acme 2.0" "/blog/pricing-update|Pricing update" "/pricing|Pricing" "/changelog|Changelog" "/docs/cli|CLI reference" "/docs/sdk/javascript|JavaScript SDK" "/docs/sdk/python|Python SDK"; do
  url="https://docs.acme.dev${p%%|*}"; title="${p##*|}"
  echo "INSERT OR IGNORE INTO known_urls (id, website_id, url, title, source, added_at) VALUES (lower(hex(randomblob(16))), '$SITE_ID', '$url', '$title', 'sitemap', $(( $(date +%s%3N) - 86400000*3 )));" >> "$SQL"
done
npx wrangler d1 execute DB --local --file "$SQL" > /dev/null

# 4. visitor hits over the last 30 days (direct inserts for history + live tracks for today)
NOW=$(date +%s%3N)
python3 - "$SITE_ID" "$NOW" "$SQL" <<'EOF'
import sys, random, uuid
site, now, path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
random.seed(7)
urls = [
  ("https://docs.acme.dev/docs/getting-startd", 38, "https://www.google.com/"),
  ("https://docs.acme.dev/docs/instalation", 22, "https://docs.acme.dev/docs/getting-started"),
  ("https://docs.acme.dev/blog/launch-post", 14, "https://news.ycombinator.com/"),
  ("https://docs.acme.dev/docs/api/auth", 9, "https://github.com/acme/acme"),
  ("https://docs.acme.dev/pricing.html", 6, None),
  ("https://docs.acme.dev/docs/guides/deploy-cloudflare-pages", 5, "https://t.co/x1"),
  ("https://docs.acme.dev/old/cli", 4, "https://docs.acme.dev/docs/configuration"),
  ("https://docs.acme.dev/docs/sdk/js", 3, None),
  ("https://docs.acme.dev/wp-login.php", 2, None),
]
day = 86400000
with open(path, 'w') as f:
    for url, n, ref in urls:
        for i in range(n):
            ts = now - int(random.random() ** 1.6 * 29 * day) - random.randint(0, day)
            r = ref if (ref and random.random() < 0.7) else "NULL"
            rv = "NULL" if r == "NULL" else f"'{r}'"
            ua = "'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'"
            f.write(f"INSERT INTO not_found_events (id, website_id, url, referrer, user_agent, ts) VALUES ('{uuid.uuid4()}', '{site}', '{url}', {rv}, {ua}, {ts});\n")
EOF
npx wrangler d1 execute DB --local --file "$SQL" > /dev/null

# live tracks today (go through ingest → creates broken_links rows + suggestions)
for u in "/docs/getting-startd" "/docs/getting-startd" "/docs/instalation" "/blog/launch-post" "/docs/api/auth" "/pricing.html" "/docs/guides/deploy-cloudflare-pages" "/old/cli" "/docs/sdk/js" "/wp-login.php"; do
  curl -s -o /dev/null -X POST "$BASE/api/track" -H 'Content-Type: text/plain' -d "{\"siteKey\":\"$SITE_KEY\",\"url\":\"https://docs.acme.dev$u\",\"referrer\":\"https://www.google.com/\"}"
done
# sync hit counts with the seeded history
npx wrangler d1 execute DB --local --command "UPDATE broken_links SET hits = (SELECT COUNT(*) FROM not_found_events e WHERE e.website_id = broken_links.website_id AND e.url = broken_links.url), first_seen = (SELECT MIN(ts) FROM not_found_events e WHERE e.website_id = broken_links.website_id AND e.url = broken_links.url) WHERE website_id = '$SITE_ID';" > /dev/null

# 5. crawler findings (as if a run just finished)
T=$(( NOW - 1800000 ))
npx wrangler d1 execute DB --local --command "UPDATE websites SET crawl_enabled = 1, last_crawl_at = $T WHERE id = '$SITE_ID';" > /dev/null
: > "$SQL"
i=0
for p in "/docs/getting-started|200" "/docs/installation|200" "/docs/configuration|200" "/pricing|200" "/changelog|200" "/docs/api/webhooks|200" "/assets/hero-old.png|404" "/docs/api/v1/keys|404" "/legacy/download|410" "/docs/sdk/ruby|404"; do
  url="https://docs.acme.dev${p%%|*}"; st="${p##*|}"; ok=1; [ "$st" != "200" ] && ok=0
  echo "INSERT INTO link_checks (id, website_id, url, status, ok, redirect_chain, checked_at) VALUES (lower(hex(randomblob(16))), '$SITE_ID', '$url', $st, $ok, NULL, $(( T + 60000 + i*9000 )));" >> "$SQL"
  echo "INSERT OR IGNORE INTO crawl_sources (website_id, source_url, target_url, anchor) VALUES ('$SITE_ID', 'https://docs.acme.dev/docs/getting-started', '$url', 'link');" >> "$SQL"
  if [ "$ok" = 0 ]; then
    echo "INSERT OR IGNORE INTO broken_links (id, website_id, url, status, source, hits, http_status, first_seen, last_seen) VALUES (lower(hex(randomblob(16))), '$SITE_ID', '$url', 'open', 'crawler', 0, $st, $(( T + 60000 + i*9000 )), $(( T + 60000 + i*9000 )));" >> "$SQL"
    echo "INSERT OR IGNORE INTO crawl_sources (website_id, source_url, target_url, anchor) VALUES ('$SITE_ID', 'https://docs.acme.dev/changelog', '$url', 'Download');" >> "$SQL"
  fi
  i=$((i+1))
done
# a redirect chain example
echo "INSERT INTO link_checks (id, website_id, url, status, ok, redirect_chain, checked_at) VALUES (lower(hex(randomblob(16))), '$SITE_ID', 'https://acme.dev/signup', 200, 1, '[{\"url\":\"https://acme.dev/signup\",\"status\":301},{\"url\":\"https://app.acme.dev/signup\",\"status\":302},{\"url\":\"https://app.acme.dev/register\",\"status\":200}]', $(( T + 200000 )));" >> "$SQL"
# one resolved + one ignored
echo "UPDATE broken_links SET status='resolved', resolved_at=$(( NOW - 3600000*5 )) WHERE website_id='$SITE_ID' AND url='https://docs.acme.dev/docs/sdk/js';" >> "$SQL"
echo "UPDATE broken_links SET status='ignored' WHERE website_id='$SITE_ID' AND url='https://docs.acme.dev/wp-login.php';" >> "$SQL"
npx wrangler d1 execute DB --local --file "$SQL" > /dev/null

# 6. a channel + an API key
TEAM=$(curl -s "$BASE/api/me" -H "Cookie: $COOKIE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["teams"][0]["id"])')
curl -s -o /dev/null -X POST "$BASE/api/teams/$TEAM/channels" "${H[@]}" -d '{"type":"slack","name":"#ops-alerts","config":{"url":"https://hooks.slack.com/services/T000/B000/xxxx"}}'
curl -s -o /dev/null -X POST "$BASE/api/teams/$TEAM/channels" "${H[@]}" -d '{"type":"email","name":"On-call inbox","config":{"to":"oncall@acme.dev"}}'
curl -s -o /dev/null -X POST "$BASE/api/teams/$TEAM/keys" "${H[@]}" -d '{}'
echo "seeded team=$TEAM"
printf 'COOKIE=%s\nSITE_ID=%s\nSITE_KEY=%s\nBASE=%s\n' "$COOKIE" "$SITE_ID" "$SITE_KEY" "$BASE" | tee docs/demo/.demo.env
echo "next: set -a; . docs/demo/.demo.env; set +a; node docs/demo/capture.mjs"
