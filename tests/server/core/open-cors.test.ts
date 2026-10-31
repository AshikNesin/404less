import { describe, expect, it } from "vite-plus/test";
import { createApp } from "@groot/core/app";
import { setConfig } from "@groot/core/config";

function buildApp() {
  return createApp({
    openCorsPaths: ["/api/track", "/widget/*"],
    routes(app) {
      app.post("/api/track", (c) => c.json({ ok: true }));
      app.get("/widget/a.js", (c) => c.text("js"));
      app.get("/api/v1/private", (c) => c.json({ ok: true }));
    },
  });
}

const preflight = (path: string, origin: string) =>
  new Request(`http://localhost${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });

describe("createApp openCorsPaths", () => {
  it("answers any origin without credentials on open paths, even with an allow-list", async () => {
    setConfig({ cors: { origins: ["https://app.example.com"] } });
    try {
      const app = buildApp();
      for (const path of ["/api/track", "/widget/a.js"]) {
        const res = await app.fetch(preflight(path, "https://customer.example"));
        expect(res.headers.get("access-control-allow-origin")).toBe("*");
        expect(res.headers.get("access-control-allow-credentials")).toBeNull();
      }
      const post = await app.fetch(
        new Request("http://localhost/api/track", {
          method: "POST",
          headers: { Origin: "https://customer.example", "Content-Type": "application/json" },
          body: "{}",
        }),
      );
      expect(post.status).toBe(200);
      expect(post.headers.get("access-control-allow-origin")).toBe("*");
    } finally {
      setConfig();
    }
  });

  it("keeps the credentialed allow-list everywhere else", async () => {
    setConfig({ cors: { origins: ["https://app.example.com"] } });
    try {
      const app = buildApp();
      const blocked = await app.fetch(preflight("/api/v1/private", "https://customer.example"));
      expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
      const allowed = await app.fetch(preflight("/api/v1/private", "https://app.example.com"));
      expect(allowed.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
      expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
      // a prefix only matches with the trailing *
      const track = await app.fetch(preflight("/api/trackx", "https://customer.example"));
      expect(track.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      setConfig();
    }
  });
});
