# Stdio MCP process for directory listings (Glama builds this image and
# introspects initialize + tools/list). The file has no npm dependencies.
# The product itself, including the authenticated HTTP MCP endpoint, runs as
# a Cloudflare Worker. See README, "MCP over stdio".
FROM node:24-bookworm-slim

WORKDIR /app

COPY apps/web/src/server/mcp-stdio.ts apps/web/src/server/mcp-stdio.ts
COPY apps/web/src/server/api/mcp/catalog.ts apps/web/src/server/api/mcp/catalog.ts

USER node

# Node 24 strips types natively. The flag remains for older Node 22 images.
CMD ["node", "--experimental-strip-types", "apps/web/src/server/mcp-stdio.ts"]
