// M3.5: API keys + MCP server (initialize / tools/list / tools/call over streamable HTTP).
import { SELF } from "cloudflare:test";
import { beforeAll, expect, test } from "vitest";

let cookie = "";
let teamId = "";
let siteId = "";
let siteKey = "";
let apiKey = "";

beforeAll(async () => {
  const r = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "mcp@example.com" }),
  });
  const { devLink } = await r.json();
  const v = await SELF.fetch(devLink, { redirect: "manual" });
  cookie = (v.headers.get("set-cookie") ?? "").split(";")[0];
  const h = { "Content-Type": "application/json", cookie };
  const team = (await (
    await SELF.fetch("http://localhost/api/v1/teams", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "MCP" }),
    })
  ).json()) as any;
  teamId = team.team.id;
  const site = (await (
    await SELF.fetch("http://localhost/api/v1/sites", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ teamId, name: "Docu", domain: "docu.test" }),
    })
  ).json()) as any;
  siteId = site.site.id;
  siteKey = site.site.site_key;
  await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteKey,
      url: "https://docu.test/guide/instal",
      referrer: "https://docu.test/",
    }),
  });
  await SELF.fetch("http://localhost/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteKey, url: "https://docu.test/guide/instal" }),
  });
  const key = (await (
    await SELF.fetch(`http://localhost/api/v1/teams/${teamId}/keys`, { method: "POST", headers: h })
  ).json()) as any;
  apiKey = key.secret;
});

function rpc(method: string, params?: unknown, id: number | string = 1) {
  return SELF.fetch("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
  });
}
const parse = (r: { json: () => Promise<any> }) => r.json();

test("api keys: create returns one-time secret, list shows prefix only, delete works", async () => {
  expect(apiKey).toMatch(/^404l_/);
  const h = { cookie };
  const list = (await (
    await SELF.fetch(`http://localhost/api/v1/teams/${teamId}/keys`, { headers: h })
  ).json()) as any;
  expect(list.keys).toHaveLength(1);
  expect(list.keys[0]).not.toHaveProperty("key_hash");
  expect(list.keys[0].prefix).toBe(apiKey.slice(0, 10));

  const keyId = list.keys[0].id;
  const del = await SELF.fetch(`http://localhost/api/v1/teams/${teamId}/keys/${keyId}`, {
    method: "DELETE",
    headers: h,
  });
  expect(del.status).toBe(200);
  // deleted key no longer authenticates
  const r = await rpc("ping");
  expect(r.status).toBe(401);
  // recreate for subsequent tests
  const again = (await (
    await SELF.fetch(`http://localhost/api/v1/teams/${teamId}/keys`, { method: "POST", headers: h })
  ).json()) as any;
  apiKey = again.secret;
});

test("mcp: auth required and bad token rejected", async () => {
  const no = await SELF.fetch("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
  });
  expect(no.status).toBe(401);
  const bad = await SELF.fetch("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer fl_notreal" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
  });
  expect(bad.status).toBe(401);
});

test("mcp: initialize -> capabilities + server info", async () => {
  const r = await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });
  expect(r.status).toBe(200);
  const body = await parse(r);
  expect(body.result.serverInfo.name).toBe("404less");
  expect(body.result.capabilities.tools).toBeDefined();
  expect(r.headers.get("mcp-protocol-version")).toBe("2025-03-26");
});

test("mcp: tools/list exposes the four read-only tools", async () => {
  const body = await parse(await rpc("tools/list"));
  const names = body.result.tools.map((t: any) => t.name).sort();
  expect(names).toEqual(["get_link_details", "get_suggestions", "list_broken_links", "list_sites"]);
});

test("mcp: list_sites returns team sites", async () => {
  const body = await parse(await rpc("tools/call", { name: "list_sites", arguments: {} }));
  const inner = JSON.parse(body.result.content[0].text);
  expect(inner.sites.map((s: any) => s.domain)).toContain("docu.test");
});

test("mcp: list_broken_links aggregates hits and filters by since", async () => {
  const body = await parse(
    await rpc("tools/call", {
      name: "list_broken_links",
      arguments: { site: "docu.test" },
    }),
  );
  const inner = JSON.parse(body.result.content[0].text);
  expect(inner.broken_links).toHaveLength(1);
  expect(inner.broken_links[0].url).toBe("https://docu.test/guide/instal");
  expect(inner.broken_links[0].hits).toBe(2);

  const sinceBody = await parse(
    await rpc("tools/call", {
      name: "list_broken_links",
      arguments: { site: "docu.test", since: new Date(Date.now() + 3600_000).toISOString() },
    }),
  );
  const sinceInner = JSON.parse(sinceBody.result.content[0].text);
  expect(sinceInner.broken_links).toHaveLength(0);
});

test("mcp: unknown site -> structured error, not a crash", async () => {
  const body = await parse(
    await rpc("tools/call", {
      name: "list_broken_links",
      arguments: { site: "nope.test" },
    }),
  );
  const inner = JSON.parse(body.result.content[0].text);
  expect(inner.error).toMatch(/unknown site/);
  expect(body.result.isError).toBe(true);
});

test("mcp: unknown tool and unknown method handled", async () => {
  const t = await parse(await rpc("tools/call", { name: "destroy_everything", arguments: {} }));
  expect(t.error.code).toBe(-32602);
  const m = await parse(await rpc("resources/list"));
  expect(m.error.code).toBe(-32601);
});

test("mcp: notifications get 202, invalid jsonrpc gets 400", async () => {
  const n = await rpc("notifications/initialized", undefined, undefined as never);
  expect(n.status).toBe(202);
  const bad = await SELF.fetch("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ jsonrpc: "1.0", method: "ping", id: 1 }),
  });
  expect(bad.status).toBe(400);
});

test("mcp: cross-team isolation (key from other team sees no docu.test)", async () => {
  // create second team+user
  const r2 = await SELF.fetch("http://localhost/api/v1/auth/magic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "other@example.com" }),
  });
  const { devLink } = await r2.json();
  const v2 = await SELF.fetch(devLink, { redirect: "manual" });
  const cookie2 = (v2.headers.get("set-cookie") ?? "").split(";")[0];
  const h2 = { "Content-Type": "application/json", cookie: cookie2 };
  const team2 = (await (
    await SELF.fetch("http://localhost/api/v1/teams", {
      method: "POST",
      headers: h2,
      body: JSON.stringify({ name: "Other" }),
    })
  ).json()) as any;
  const key2 = (await (
    await SELF.fetch(`http://localhost/api/v1/teams/${team2.team.id}/keys`, {
      method: "POST",
      headers: h2,
    })
  ).json()) as any;

  const r = await SELF.fetch("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key2.secret}` },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "list_sites", arguments: {} },
      id: 1,
    }),
  });
  const body = await r.json();
  const inner = JSON.parse(body.result.content[0].text);
  expect(inner.sites.map((s: any) => s.domain)).not.toContain("docu.test");
});
