// Public, no-signup tools on the marketing site. No database writes.
import { Hono } from "hono";
import { buildRules } from "../../../shared/redirect-rules";
import type { AppBindings } from "../../types";
import { chainSummary, followHops } from "./chain";
import { busy, enforceToolLimit, release, TOOL_LIMITS, tryAcquire } from "./limit";
import { scanChunk } from "./scan";
import { checkSoft404 } from "./soft404";
import { FetchBudgetSpent, ToolInputError, UnsafeUrlError, withFetchBudget } from "./ssrf";

export const tools = new Hono<AppBindings>();

tools.post("/redirects", async (c) => {
  const limited = await enforceToolLimit(c, "redirects", TOOL_LIMITS.redirects);
  if (limited) return limited;
  try {
    const body = await readBody(c, 100_000);
    const input = typeof body.input === "string" ? body.input : "";
    return c.json(buildRules(input), 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return toolError(c, error);
  }
});

tools.post("/redirect-chain", async (c) => {
  const limited = await enforceToolLimit(c, "chain", TOOL_LIMITS.chain);
  if (limited) return limited;
  if (!tryAcquire()) return c.json(busy(), 429);
  try {
    const body = await readBody(c, 8_000);
    if (typeof body.url !== "string" || !body.url.trim()) {
      throw new ToolInputError("Enter a URL to check.");
    }
    const url = body.url.trim();
    const followed = await withFetchBudget(24, () => followHops(url));
    return c.json(
      {
        hops: followed.hops,
        finalUrl: followed.finalUrl,
        status: followed.status,
        flags: followed.flags,
        error: followed.error,
        summary: followed.error ?? chainSummary(followed.hops, followed.flags),
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (error) {
    return toolError(c, error);
  } finally {
    release();
  }
});

tools.post("/soft-404", async (c) => {
  const limited = await enforceToolLimit(c, "soft404", TOOL_LIMITS.soft404);
  if (limited) return limited;
  if (!tryAcquire()) return c.json(busy(), 429);
  try {
    const body = await readBody(c, 8_000);
    if (typeof body.url !== "string" || !body.url.trim()) {
      throw new ToolInputError("Enter a URL to check.");
    }
    const url = body.url.trim();
    const missing = typeof body.missingPath === "string" ? body.missingPath : undefined;
    const report = await withFetchBudget(28, () => checkSoft404(url, missing));
    return c.json(report, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return toolError(c, error);
  } finally {
    release();
  }
});

tools.post("/scan", async (c) => {
  const limited = await enforceToolLimit(c, "scan", TOOL_LIMITS.scan);
  if (limited) return limited;
  if (!tryAcquire()) return c.json(busy(), 429);
  try {
    const body = await readBody(c, 80_000);
    const result = await withFetchBudget(36, () => scanChunk(body));
    return c.json(result, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    return toolError(c, error);
  } finally {
    release();
  }
});

async function readBody(
  c: { req: { text: () => Promise<string> } },
  max: number,
): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (text.length > max) throw new ToolInputError("That request is too large.");
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ToolInputError("Send a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ToolInputError) throw error;
    throw new ToolInputError("Send JSON.");
  }
}

function toolError(
  c: { json: (body: unknown, status: 400 | 429 | 502) => Response },
  error: unknown,
): Response {
  if (error instanceof ToolInputError || error instanceof UnsafeUrlError) {
    return c.json({ error: error.message }, 400);
  }
  if (error instanceof FetchBudgetSpent) {
    return c.json({ error: "This check did too much work in one go. Try a smaller site." }, 429);
  }
  return c.json({ error: "The check could not finish." }, 502);
}
