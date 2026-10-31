import { type ZodType, z } from "zod";
import { Boom, ErrorCode } from "../errors";
import type { AppContext, AuthUser } from "../types";

/**
 * Request parsing helpers. Each validates with a Zod schema and throws a
 * structured 400 on failure, so handlers read like: parse, call service, return.
 */

function parseInput<S extends ZodType>(input: unknown, schema: S): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || "global";
      details[field] = [...(details[field] ?? []), issue.message];
    }
    throw Boom.badRequest("Validation failed", details, ErrorCode.VALIDATION_ERROR.code);
  }
  return result.data;
}

/** Validate the JSON body. An unparseable body is a 400, not a 500. */
export async function parseBody<S extends ZodType>(c: AppContext, schema: S): Promise<z.output<S>> {
  let body: unknown = {};
  const raw = await c.req.text();
  if (raw.trim() !== "") {
    try {
      body = JSON.parse(raw);
    } catch {
      throw Boom.badRequest("Invalid JSON body", undefined, ErrorCode.VALIDATION_ERROR.code);
    }
  }
  return parseInput(body, schema);
}

/** Validate a multipart or urlencoded form; repeated fields arrive as arrays. */
export async function parseForm<S extends ZodType>(c: AppContext, schema: S): Promise<z.output<S>> {
  let body: Awaited<ReturnType<typeof c.req.parseBody>>;
  try {
    body = await c.req.parseBody({ all: true });
  } catch {
    throw Boom.badRequest("Invalid form body", undefined, ErrorCode.VALIDATION_ERROR.code);
  }
  return parseInput(body, schema);
}

/** Validate the query string (first value wins for repeated keys). */
export function parseQuery<S extends ZodType>(c: AppContext, schema: S): z.output<S> {
  return parseInput(c.req.query(), schema);
}

/** Validate route params. */
export function parseParams<S extends ZodType>(c: AppContext, schema: S): z.output<S> {
  return parseInput(c.req.param(), schema);
}

/** A positive integer route parameter such as `/:id`. */
export function parseId(value: string | undefined, paramName = "id"): number {
  if (value === undefined) throw Boom.badRequest(`Missing ${paramName} parameter`);
  if (!/^\d+$/.test(value)) throw Boom.badRequest(`Invalid ${paramName} format`);
  const id = Number.parseInt(value, 10);
  if (id < 1) throw Boom.badRequest(`Invalid ${paramName} format`);
  return id;
}

/** A required string route parameter. */
export function parseStringParam(value: string | undefined, paramName = "param"): string {
  if (value === undefined || value === "") throw Boom.badRequest(`Missing ${paramName} parameter`);
  return value;
}

/** The authenticated user set by `jwtAuthMiddleware`. Throws 401 if absent. */
export function requireUser(c: AppContext): AuthUser {
  const user = c.get("user");
  if (!user) throw Boom.unauthorized("Authentication required");
  return user;
}

/** Client IP: Cloudflare header, then proxy header, then unknown. */
export function clientIp(c: AppContext): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}
