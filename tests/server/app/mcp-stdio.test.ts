// The Docker/Glama entrypoint speaks newline-delimited JSON-RPC on stdio.
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { expect, test } from "vitest";

test("stdio mcp lists the four read-only tools and does not call without a host", async () => {
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", "apps/web/src/server/mcp-stdio.ts"],
    { cwd: path.resolve(), stdio: ["pipe", "pipe", "pipe"] },
  );
  let buf = "";
  const lines: string[] = [];
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      lines.push(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
    }
  });
  const next = async () => {
    const deadline = Date.now() + 5000;
    while (!lines.length) {
      if (Date.now() > deadline) throw new Error(`stdio timed out; stderr=${child.stderr.read()}`);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    return JSON.parse(lines.shift() ?? "") as {
      result?: { serverInfo?: { name?: string }; tools?: { name: string }[]; isError?: boolean };
    };
  };
  const send = (message: object) => child.stdin.write(JSON.stringify(message) + "\n");

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    const init = await next();
    expect(init.result?.serverInfo?.name).toBe("404less");

    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const listed = await next();
    expect(listed.result?.tools?.map((tool) => tool.name).sort()).toEqual([
      "get_link_details",
      "get_suggestions",
      "list_broken_links",
      "list_sites",
    ]);

    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list_sites", arguments: {} },
    });
    const call = await next();
    expect(call.result?.isError).toBe(true);
  } finally {
    child.kill();
    await once(child, "exit").catch(() => undefined);
  }
});
