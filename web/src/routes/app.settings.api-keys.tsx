// API keys: list prefixes (create/remove). Backend endpoints land with MCP (M3.5).
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/app/settings/api-keys')({
  component: () => (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">API keys</h1>
      <p className="text-sm text-slate-500">
        API keys (for the REST API and the MCP server) ship in the next milestone. The screen is here so the
        settings structure matches the design doc.
      </p>
    </div>
  ),
});
