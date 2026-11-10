// The public MCP tool list. Shared by the HTTP endpoint (api/mcp/mcp.routes.ts)
// and the dependency-free stdio process (mcp-stdio.ts) so directory listings
// and the self-hosted server advertise the same tools.

export const MCP_PROTOCOL_VERSION = "2025-03-26";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const MCP_TOOLS = [
  {
    name: "list_sites",
    description: "List the sites monitored for this team.",
    inputSchema: { type: "object" as const, properties: {}, additionalProperties: false },
    annotations: readOnly,
  },
  {
    name: "list_broken_links",
    description:
      "Broken URLs for a site (open by default), most-hit first, optionally since an ISO timestamp.",
    inputSchema: {
      type: "object" as const,
      properties: {
        site: { type: "string", description: "Site id, domain, or name" },
        status: {
          type: "string",
          enum: ["open", "resolved", "ignored", "all"],
          description: "Triage status (default open)",
        },
        since: { type: "string", description: "ISO 8601 timestamp lower bound" },
        limit: { type: "number", description: "Max URLs to return (default 50, max 200)" },
      },
      required: ["site"],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "get_suggestions",
    description: "Suggested replacement URLs for a broken link.",
    inputSchema: {
      type: "object" as const,
      properties: {
        site: { type: "string", description: "Site id, domain, or name" },
        url: { type: "string", description: "The broken URL" },
      },
      required: ["site", "url"],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "get_link_details",
    description:
      "Full details for one broken URL: hits, first/last seen, top referrers, suggested fixes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        site: { type: "string", description: "Site id, domain, or name" },
        url: { type: "string", description: "The broken URL" },
      },
      required: ["site", "url"],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
];
