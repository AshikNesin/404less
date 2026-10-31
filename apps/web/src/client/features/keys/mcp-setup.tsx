// The MCP server's URL and a paste-ready setup prompt; the per-client setups
// live in connect-agent-dialog.tsx.

export function mcpUrl(): string {
  return `${window.location.origin}/mcp`;
}

/** A prompt that hands the whole setup to the agent: key, URL, what to do. */
export function agentSetupPrompt(key: string, domain?: string): string {
  return [
    `Connect 404less (broken-link monitoring${domain ? ` for ${domain}` : ""}) as an MCP server and start using it.`,
    "",
    "Run this in your shell:",
    `claude mcp add --transport http 404less ${mcpUrl()} \\`,
    `  --header "Authorization: Bearer ${key}"`,
    "",
    "Or add it to .mcp.json / mcp.json (Cursor, VS Code, Claude Desktop):",
    JSON.stringify(
      {
        mcpServers: {
          "404less": { type: "http", url: mcpUrl(), headers: { Authorization: `Bearer ${key}` } },
        },
      },
      null,
      2,
    ),
    "",
    `Then run list_sites${domain ? " and confirm the site is there" : " to see the sites on this key"}. The tools are read-only; you fix links in the repo, not in 404less.`,
  ].join("\n");
}
