// Remote MCP server: Streamable HTTP at /mcp, bearer API-key auth, read-only tools.
// Implements the 2025-03-26 streamable transport: POST for messages,
// GET (SSE, optional) for server-initiated messages; we decline with 405.
import { Hono } from "hono";
import { teamForToken } from "../keys/keys.service";
import { getLinkDetails, getSuggestions, listBrokenLinks, listSites } from "../mcp/mcp.service";
import type { Env } from "../../types";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
};

export const mcp = new Hono<{ Bindings: Env }>();

const TOOLS = [
  {
    name: "list_sites",
    description: "List the sites monitored for this team.",
    inputSchema: { type: "object" as const, properties: {}, additionalProperties: false },
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
  },
];

const PROTOCOL_VERSION = "2025-03-26";

mcp.on(["POST", "GET", "DELETE"], "/mcp", async (c) => {
  const auth = c.req.header("Authorization");
  const teamId = await teamForToken(c.env, auth?.startsWith("Bearer ") ? auth.slice(7) : null);
  if (!teamId) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "unauthorized: provide a valid API key as bearer token" },
        id: null,
      },
      401,
    );
  }
  if (c.req.method !== "POST") {
    return c.text(
      "streamable http: POST only for JSON-RPC messages; SSE stream not supported",
      405,
    );
  }

  const rpc = await c.req.json<JsonRpcRequest>().catch(() => null);
  if (!rpc || rpc.jsonrpc !== "2.0") {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "invalid request" }, id: null },
      400,
    );
  }

  const ok = (result: unknown, id: JsonRpcRequest["id"]) =>
    c.json({ jsonrpc: "2.0", result, id }, 200, {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    });

  if (rpc.method === "initialize") {
    return ok(
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "404less", version: "0.1.0" },
      },
      rpc.id,
    );
  }
  if (rpc.method === "notifications/initialized" || rpc.method?.startsWith("notifications/")) {
    return c.body(null, 202);
  }
  if (rpc.method === "tools/list") {
    return ok({ tools: TOOLS }, rpc.id);
  }
  if (rpc.method === "ping") return ok({}, rpc.id);
  if (rpc.method === "tools/call") {
    const name = rpc.params?.name as string;
    const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>;
    try {
      let result: unknown;
      if (name === "list_sites") result = await listSites(c.env, teamId);
      else if (name === "list_broken_links")
        result = await listBrokenLinks(c.env, teamId, args as never);
      else if (name === "get_suggestions")
        result = await getSuggestions(c.env, teamId, args as never);
      else if (name === "get_link_details")
        result = await getLinkDetails(c.env, teamId, args as never);
      else
        return c.json(
          { jsonrpc: "2.0", error: { code: -32602, message: `unknown tool: ${name}` }, id: rpc.id },
          200,
        );
      // services answer { error } for bad input (unknown site): a tool error the agent can see
      const isError = !!result && typeof result === "object" && "error" in result;
      return ok(
        {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          ...(isError ? { isError } : {}),
        },
        rpc.id,
      );
    } catch (err) {
      return ok(
        {
          content: [
            { type: "text", text: `error: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        },
        rpc.id,
      );
    }
  }
  return c.json(
    {
      jsonrpc: "2.0",
      error: { code: -32601, message: `method not found: ${rpc.method}` },
      id: rpc.id,
    },
    200,
  );
});
