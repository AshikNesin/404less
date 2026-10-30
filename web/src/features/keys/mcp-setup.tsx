// How to point an agent at the MCP server: per-client commands, a paste-ready
// agent prompt, and the context file an agent needs to fix links well.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { CodeBlock } from '../../components/copy-button';
import { SegmentedTabs } from '../../components/ui/tabs';
import { cn } from '../../lib/utils';

type Client = 'agent' | 'claude-code' | 'cursor' | 'vscode' | 'curl';

export function mcpUrl(): string {
  return `${window.location.origin}/mcp`;
}

/** A prompt that hands the whole setup to the agent — key, URL, what to do. */
export function agentSetupPrompt(key: string, domain?: string): string {
  return [
    `Connect 404less (broken-link monitoring${domain ? ` for ${domain}` : ''}) as an MCP server and start using it.`,
    '',
    'Run this in your shell:',
    `claude mcp add --transport http 404less ${mcpUrl()} \\`,
    `  --header "Authorization: Bearer ${key}"`,
    '',
    'Or add it to .mcp.json / mcp.json (Cursor, VS Code, Claude Desktop):',
    JSON.stringify({ mcpServers: { '404less': { type: 'http', url: mcpUrl(), headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    '',
    `Then run list_sites${domain ? ' and confirm the site is there' : ' to see the sites on this key'}. The tools are read-only; you fix links in the repo, not in 404less.`,
  ].join('\n');
}

export function McpSetup({ apiKey, domain }: { apiKey: string; domain?: string }) {
  const [client, setClient] = useState<Client>('agent');
  const url = mcpUrl();
  const key = apiKey || '404l_your_key';
  const codes: Record<Client, string> = {
    agent: agentSetupPrompt(key, domain),
    'claude-code': `claude mcp add --transport http 404less ${url} \\\n  --header "Authorization: Bearer ${key}"`,
    cursor: JSON.stringify({ mcpServers: { '404less': { type: 'http', url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    vscode: JSON.stringify({ servers: { '404less': { type: 'http', url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    curl: `curl -s ${url} \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_broken_links","arguments":{"site":"example.com"}}}'`,
  };
  return (
    <div className="space-y-3">
      <SegmentedTabs
        value={client}
        onChange={setClient}
        items={[
          { value: 'agent', label: 'Ask your agent' },
          { value: 'claude-code', label: 'Claude Code' },
          { value: 'cursor', label: 'Cursor' },
          { value: 'vscode', label: 'VS Code' },
          { value: 'curl', label: 'REST' },
        ]}
      />
      {client === 'agent' && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2 text-[0.8125rem]">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-foreground" aria-hidden />
          <span>Paste this into Claude Code, Cursor or any agent. It carries the key, the URL and the first step; the agent takes it from there.</span>
        </div>
      )}
      <CodeBlock code={codes[client]} label={client === 'agent' ? 'Copy prompt' : 'Copy setup'} />
      <p className="text-meta">
        Read-only tools: <code className="text-code">list_sites</code>, <code className="text-code">list_broken_links</code>,{' '}
        <code className="text-code">get_link_details</code>, <code className="text-code">get_suggestions</code>. Your agent can open the
        fix PR; 404less never writes to your repo.
      </p>
    </div>
  );
}

/** A compact one-liner for inline "connect an agent" nudges. */
export function McpInlineHint({ className }: { className?: string }) {
  return (
    <span className={cn('text-meta', className)}>
      Or hand the whole setup to your agent from <span className="font-medium">API &amp; MCP</span>.
    </span>
  );
}
