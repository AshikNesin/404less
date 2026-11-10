// Stdio MCP entry for directory listings (Glama builds the root Dockerfile and
// speaks JSON-RPC to this process). Same tool catalog as POST /mcp.
// tools/call forwards to a self-hosted HTTP endpoint only when F404_MCP_URL
// and F404_API_KEY are set. Nothing is written to stdout except JSON-RPC.
import { createInterface } from "node:readline";
import { MCP_PROTOCOL_VERSION, MCP_TOOLS } from "./api/mcp/catalog.ts";

type Rpc = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

const NEEDS_HOST =
  "404less tools read a self-hosted instance. Set F404_MCP_URL to your https://…/mcp endpoint and F404_API_KEY to a 404l_… key, then call again. This process lists the tools; it does not ship a database.";

function send(message: object): void {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function result(id: Rpc["id"], value: unknown): void {
  send({ jsonrpc: "2.0", id: id ?? null, result: value });
}

function error(id: Rpc["id"], code: number, message: string): void {
  send({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

async function callTool(name: string, args: unknown): Promise<unknown> {
  const url = process.env.F404_MCP_URL;
  const key = process.env.F404_API_KEY;
  if (!url || !key) {
    return { content: [{ type: "text", text: NEEDS_HOST }], isError: true };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args ?? {} },
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    result?: unknown;
    error?: { message?: string };
  } | null;
  if (body?.result) return body.result;
  return {
    content: [{ type: "text", text: body?.error?.message ?? `upstream HTTP ${res.status}` }],
    isError: true,
  };
}

async function handle(line: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg: Rpc;
  try {
    msg = JSON.parse(trimmed) as Rpc;
  } catch {
    error(null, -32700, "parse error");
    return;
  }
  if (msg.jsonrpc !== "2.0" || !msg.method) {
    error(msg.id, -32600, "invalid request");
    return;
  }
  if (msg.method === "initialize") {
    result(msg.id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "404less", version: "0.1.0" },
    });
    return;
  }
  if (msg.method.startsWith("notifications/")) return;
  if (msg.method === "ping") {
    result(msg.id, {});
    return;
  }
  if (msg.method === "tools/list") {
    result(msg.id, { tools: MCP_TOOLS });
    return;
  }
  if (msg.method === "resources/list" || msg.method === "resources/templates/list") {
    result(msg.id, { resources: [] });
    return;
  }
  if (msg.method === "prompts/list") {
    result(msg.id, { prompts: [] });
    return;
  }
  if (msg.method === "tools/call") {
    const name = typeof msg.params?.name === "string" ? msg.params.name : "";
    if (!name || !MCP_TOOLS.some((tool) => tool.name === name)) {
      error(msg.id, -32602, `unknown tool: ${name || "(missing)"}`);
      return;
    }
    try {
      result(msg.id, await callTool(name, msg.params?.arguments));
    } catch (err) {
      result(msg.id, {
        content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      });
    }
    return;
  }
  error(msg.id, -32601, `method not found: ${msg.method}`);
}

const lines = createInterface({ input: process.stdin });
let chain = Promise.resolve();
lines.on("line", (line) => {
  chain = chain
    .then(() => handle(line))
    .catch((err: unknown) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    });
});
lines.on("close", () => {
  void chain.then(() => process.exit(0));
});
