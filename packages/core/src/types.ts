import type { Context, MiddlewareHandler } from "hono";
import type { Logger } from "./logger";

export interface AuthUser {
  userId: number;
  email: string;
}

/**
 * Hono environment shared by every router in the app. `Bindings` is the
 * Workers `env` object (empty on Node); `Variables` are set per request.
 */
export type AppEnv = {
  Bindings: Record<string, unknown>;
  Variables: {
    user?: AuthUser;
    logger: Logger;
    requestId: string;
  };
};

export type AppContext = Context<AppEnv>;
export type Middleware = MiddlewareHandler<AppEnv>;
