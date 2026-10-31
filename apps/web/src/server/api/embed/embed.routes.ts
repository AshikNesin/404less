// Serve the 404less embed script. Its path, bytes and caching are a frozen
// public contract: customer 404 pages load /embed.js and cache it for a day.
// Source lives in embed-script.ts (plain browser JS, no build step).
import { Hono } from "hono";
import embedJs from "./embed-script";

export const embed = new Hono();

embed.get("/embed.js", (c) => {
  c.header("Content-Type", "application/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  return c.body(embedJs);
});
