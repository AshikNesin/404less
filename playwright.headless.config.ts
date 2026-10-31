/**
 * Container-friendly override of playwright.config.ts:
 * - forces headless (base config runs headed for macOS devs)
 * - list reporter so results stream to the terminal
 * Everything else (webServer reuse, global setup, projects) is inherited.
 */
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  reporter: "list",
  use: { ...base.use, headless: true },
});
