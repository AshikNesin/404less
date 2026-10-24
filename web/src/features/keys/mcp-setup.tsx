// How to point an agent at the MCP server, with the right URL filled in.
import { useState } from 'react';
import { CodeBlock } from '../../components/copy-button';
import { SegmentedTabs } from '../../components/ui/tabs';

type Client = 'claude-code' | 'json' | 'curl';

export function McpSetup({ keyPlaceholder = '404l_…' }: { keyPlaceholder?: string }) {
  const [client, setClient] = useState<Client>('claude-code');
  const url = `${window.location.origin}/mcp`;
  const code = client === 'claude-code'
    ? `claude mcp add --transport http 404less ${url} \\\n  --header "Authorization: Bearer ${keyPlaceholder}"`
    : client === 'json'
      ? JSON.stringify({ mcpServers: { '404less': { type: 'http', url, headers: { Authorization: `Bearer ${keyPlaceholder}` } } } }, null, 2)
      : `curl -s ${window.location.origin}/mcp \\\n  -H "Authorization: Bearer ${keyPlaceholder}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_broken_links","arguments":{"site":"example.com"}}}'`;
  return (
    <div className="space-y-3">
      <SegmentedTabs
        value={client}
        onChange={setClient}
        items={[
          { value: 'claude-code', label: 'Claude Code' },
          { value: 'json', label: 'Cursor / Claude Desktop' },
          { value: 'curl', label: 'REST (curl)' },
        ]}
      />
      <CodeBlock code={code} label="Copy setup" />
      <p className="text-meta">
        Read-only tools: <code className="text-code">list_sites</code>, <code className="text-code">list_broken_links</code>,{' '}
        <code className="text-code">get_link_details</code>, <code className="text-code">get_suggestions</code>. Your agent can open the
        fix PR; 404less never writes to your repo.
      </p>
    </div>
  );
}
