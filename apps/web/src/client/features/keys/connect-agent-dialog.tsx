// "Connect an agent": pick a client, get its exact setup with the key filled
// in. One-click install where the client has a link (Cursor, VS Code),
// copyable commands and config everywhere else. Also the paste-ready prompt
// and the raw URL + header for anything not listed.
// Design referenced from Executor's MCP connect modal (executor.sh); see CREDITS.md.
import { useState, type ReactNode } from "react";
import { ArrowUpRight, KeyRound } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@groot/ui/tabs";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@groot/ui/dialog";
import { Button } from "../../components/ui/button";
import { CodeBlock } from "../../components/copy-button";
import { cn } from "../../lib/utils";
import { agentSetupPrompt, mcpUrl } from "./mcp-setup";
import claudeCodeIcon from "./agent-icons/claudecode-color.svg";
import cursorIcon from "./agent-icons/cursor.svg";
import copilotIcon from "./agent-icons/githubcopilot.svg";
import codexIcon from "./agent-icons/codex-color.svg";
import opencodeIcon from "./agent-icons/opencode.svg";
import claudeIcon from "./agent-icons/claude-color.svg";
import mcpIcon from "./agent-icons/mcp.svg";

export type AgentKey =
  | "claude-code"
  | "cursor"
  | "vscode"
  | "codex"
  | "opencode"
  | "claude-desktop"
  | "other";

export const AGENTS: { key: AgentKey; label: string; icon: string }[] = [
  { key: "claude-code", label: "Claude Code", icon: claudeCodeIcon },
  { key: "cursor", label: "Cursor", icon: cursorIcon },
  { key: "vscode", label: "VS Code", icon: copilotIcon },
  { key: "codex", label: "Codex", icon: codexIcon },
  { key: "opencode", label: "OpenCode", icon: opencodeIcon },
  { key: "claude-desktop", label: "Claude Desktop", icon: claudeIcon },
  { key: "other", label: "Other", icon: mcpIcon },
];

const PLACEHOLDER_KEY = "404l_your_key";
/** The environment variable Codex reads the key from (a name, not a secret). */
const KEY_ENV = "FOUR04LESS_API_KEY"; // gitleaks:allow
const LAST_AGENT = "404less.connect-agent";

/** Per-client setup: what it is, an optional one-click install, and the steps. */
function setupFor(agent: AgentKey, key: string) {
  const url = mcpUrl();
  const auth = { Authorization: `Bearer ${key}` };
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  const ask = (
    <>
      Ask: <q>List my open broken links on 404less and fix the top one.</q> Tools are read-only;
      fixes land in your repo, never in 404less.
    </>
  );
  switch (agent) {
    case "claude-code":
      return {
        kind: "Terminal agent",
        steps: [
          <>In your project, run:</>,
          <>
            Start <b>claude</b> and run <b>/mcp</b>: 404less is listed as connected.
          </>,
          ask,
        ],
        code: {
          0: `claude mcp add --transport http 404less ${url} \\\n  --header "Authorization: Bearer ${key}"`,
        },
      };
    case "cursor": {
      const config = { url, headers: auth };
      return {
        kind: "Editor",
        action: {
          label: "Add to Cursor",
          href: `cursor://anysphere.cursor-deeplink/mcp/install?name=404less&config=${btoa(JSON.stringify(config))}`,
        },
        steps: [
          <>
            Click <b>Add to Cursor</b> and confirm the install. Or add this to{" "}
            <b>~/.cursor/mcp.json</b>:
          </>,
          <>
            In <b>Settings › MCP</b>, 404less shows a green dot.
          </>,
          ask,
        ],
        code: { 0: json({ mcpServers: { "404less": config } }) },
      };
    }
    case "vscode": {
      const config = { name: "404less", type: "http", url, headers: auth };
      return {
        kind: "Editor · GitHub Copilot agent mode",
        action: {
          label: "Add to VS Code",
          href: `vscode:mcp/install?${encodeURIComponent(JSON.stringify(config))}`,
        },
        steps: [
          <>
            Click <b>Add to VS Code</b> and choose <b>Install</b>. Or run:
          </>,
          <>
            Open Copilot Chat in <b>Agent</b> mode: the 404less tools are in the tools picker.
          </>,
          ask,
        ],
        code: { 0: `code --add-mcp '${JSON.stringify(config)}'` },
      };
    }
    case "codex":
      return {
        kind: "Terminal agent",
        steps: [
          <>
            Put the key in your environment (and in your shell profile, so it survives a restart):
          </>,
          <>Register the server:</>,
          <>
            Start <b>codex</b> and run <b>/mcp</b>: 404less is listed. {ask}
          </>,
        ],
        code: {
          0: `export ${KEY_ENV}=${key}`,
          1: `codex mcp add 404less --url ${url} --bearer-token-env-var ${KEY_ENV}`,
        },
      };
    case "opencode":
      return {
        kind: "Terminal agent",
        steps: [
          <>
            Add this to <b>opencode.json</b> (project) or <b>~/.config/opencode/opencode.json</b>:
          </>,
          <>Restart OpenCode: the 404less tools are available to the agent.</>,
          ask,
        ],
        code: {
          0: json({
            $schema: "https://opencode.ai/config.json",
            mcp: { "404less": { type: "remote", url, oauth: false, headers: auth } },
          }),
        },
      };
    case "claude-desktop":
      return {
        kind: "Desktop app · via mcp-remote (needs Node.js)",
        steps: [
          <>
            Open <b>Settings › Developer › Edit Config</b> and add this to{" "}
            <b>claude_desktop_config.json</b>:
          </>,
          <>Restart Claude Desktop: 404less appears in the tools menu.</>,
          ask,
        ],
        code: {
          0: json({
            mcpServers: {
              "404less": {
                command: "npx",
                args: ["-y", "mcp-remote", url, "--header", "Authorization:${AUTH_HEADER}"],
                env: { AUTH_HEADER: `Bearer ${key}` },
              },
            },
          }),
        },
      };
    case "other":
      return {
        kind: "Any client with Streamable HTTP and custom headers",
        steps: [
          <>Server URL (Streamable HTTP):</>,
          <>Send the key as a header on every request:</>,
          <>
            Tools: <b>list_sites</b>, <b>list_broken_links</b>, <b>get_link_details</b>,{" "}
            <b>get_suggestions</b>.
          </>,
        ],
        code: { 0: url, 1: `Authorization: Bearer ${key}` },
      };
  }
}

export function ConnectAgentDialog({
  open,
  onOpenChange,
  agent,
  onAgentChange,
  apiKey,
  onCreateKey,
  creatingKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentKey;
  onAgentChange: (agent: AgentKey) => void;
  /** The full key, when one was just created; otherwise a placeholder is shown. */
  apiKey: string;
  onCreateKey: () => void;
  creatingKey?: boolean;
}) {
  const key = apiKey || PLACEHOLDER_KEY;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-section-title">Connect an agent</DialogTitle>
          <DialogDescription>
            Read-only access to every site on your team. Your agent lists broken links, reads the
            suggested fixes and opens the PR.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="assistant" className="min-h-0 flex-1 gap-4">
          <TabsList variant="line" className="w-full justify-start gap-3 border-b border-border">
            <TabsTrigger value="assistant" className="flex-none">
              Assistant
            </TabsTrigger>
            <TabsTrigger value="prompt" className="flex-none">
              Prompt
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-none">
              MCP URL
            </TabsTrigger>
          </TabsList>

          <DialogBody className="space-y-4">
            <KeyBar apiKey={apiKey} onCreateKey={onCreateKey} creatingKey={creatingKey} />

            <TabsContent value="assistant" className="space-y-4">
              <AgentGrid value={agent} onChange={onAgentChange} />
              <AgentSetup agent={agent} apiKey={key} />
            </TabsContent>

            <TabsContent value="prompt" className="space-y-2">
              <p className="text-caption">
                Paste this into any coding agent. It carries the key, the URL and the first step;
                the agent sets itself up.
              </p>
              <CodeBlock code={agentSetupPrompt(key)} label="Copy prompt" />
            </TabsContent>

            <TabsContent value="url" className="space-y-3">
              <Field label="Server URL" hint="Streamable HTTP. POST JSON-RPC.">
                <CodeBlock code={mcpUrl()} label="Copy URL" />
              </Field>
              <Field label="Header" hint="The API key as a bearer token, on every request.">
                <CodeBlock code={`Authorization: Bearer ${key}`} label="Copy header" />
              </Field>
            </TabsContent>
          </DialogBody>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** The last agent picked, so the dialog reopens where you left it. */
export function useLastAgent(): [AgentKey, (agent: AgentKey) => void] {
  const [agent, setAgent] = useState<AgentKey>(() => {
    const saved = localStorage.getItem(LAST_AGENT);
    return AGENTS.some((a) => a.key === saved) ? (saved as AgentKey) : "claude-code";
  });
  return [
    agent,
    (next) => {
      setAgent(next);
      localStorage.setItem(LAST_AGENT, next);
    },
  ];
}

function KeyBar({
  apiKey,
  onCreateKey,
  creatingKey,
}: {
  apiKey: string;
  onCreateKey: () => void;
  creatingKey?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-foreground/[0.04] px-3 py-2">
      <KeyRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {apiKey ? (
        <p className="min-w-0 flex-1 text-[0.8125rem]">
          Using the key you just created. It's filled in below and won't be shown again.
        </p>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-[0.8125rem]">
            Keys are shown once. Create one for this agent and it's filled into every step.
          </p>
          <Button size="sm" pending={creatingKey} onClick={onCreateKey}>
            Create key
          </Button>
        </>
      )}
    </div>
  );
}

export function AgentGrid({
  value,
  onChange,
}: {
  value: AgentKey;
  onChange: (k: AgentKey) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Agent" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {AGENTS.map((a) => (
        <button
          key={a.key}
          type="button"
          role="radio"
          aria-checked={value === a.key}
          onClick={() => onChange(a.key)}
          className={cn(
            "pressable flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5",
            value === a.key
              ? "border-foreground/70 bg-foreground/[0.04]"
              : "border-transparent hover:bg-foreground/[0.03]",
          )}
        >
          <AgentIcon src={a.icon} />
          <span className="text-center text-xs leading-tight">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

export function AgentIcon({ src, size = "md" }: { src: string; size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-border bg-background",
        size === "lg" ? "size-9" : "size-8",
      )}
    >
      <img src={src} alt="" className="size-4.5" />
    </span>
  );
}

function AgentSetup({ agent, apiKey }: { agent: AgentKey; apiKey: string }) {
  const meta = AGENTS.find((a) => a.key === agent)!;
  const setup = setupFor(agent, apiKey);
  const action = "action" in setup ? setup.action : undefined;
  return (
    <section
      aria-label={`Add 404less to ${meta.label}`}
      className="overflow-hidden rounded-xl border border-border"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-foreground/[0.02] px-4 py-3">
        <AgentIcon src={meta.icon} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[0.8125rem] font-medium">Add 404less to {meta.label}</div>
          <div className="text-meta">{setup.kind}</div>
        </div>
        {action && apiKey !== PLACEHOLDER_KEY && (
          <Button asChild variant="outline" size="sm">
            <a href={action.href}>
              {action.label} <ArrowUpRight />
            </a>
          </Button>
        )}
      </header>
      <ol className="space-y-3 px-4 py-4">
        {setup.steps.map((step, i) => {
          const code = (setup.code as Record<number, string>)[i];
          return (
            <li key={i} className="flex gap-3">
              <span className="num grid size-5 shrink-0 place-items-center rounded-full border border-border text-[0.6875rem] text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2 pt-px text-[0.8125rem] [&_b]:font-medium">
                <div>{step}</div>
                {code && <CodeBlock code={code} label={`Copy step ${i + 1}`} />}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div>
        <div className="text-[0.8125rem] font-medium">{label}</div>
        <div className="text-meta">{hint}</div>
      </div>
      {children}
    </div>
  );
}
