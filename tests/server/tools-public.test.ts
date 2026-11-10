import { describe, expect, it } from "vite-plus/test";
import { classifySoft404, type PageSnapshot } from "../../apps/web/src/server/api/tools/soft404";
import {
  isPrivateIp,
  parsePublicUrl,
  UnsafeUrlError,
} from "../../apps/web/src/server/api/tools/ssrf";

const page = (over: Partial<PageSnapshot>): PageSnapshot => ({
  requestedUrl: "https://public.test/docs",
  finalUrl: "https://public.test/docs",
  status: 200,
  title: "Docs",
  noindex: false,
  text: "the installation guide for the product",
  bytes: 800,
  error: null,
  hops: [{ url: "https://public.test/docs", status: 200 }],
  ...over,
});

describe("public url checks", () => {
  it("blocks private, loopback, link-local and obfuscated addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.1.1",
      "192.168.0.4",
      "172.16.5.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);

    for (const raw of [
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://2130706433/",
      "http://0177.0.0.1/",
      "http://metadata.google.internal/",
      "http://printer.local/",
      "https://user:pass@example.com/",
      "file:///etc/passwd",
      "http://example.com:22/",
      "http://127.1/",
    ]) {
      expect(() => parsePublicUrl(raw), raw).toThrow(UnsafeUrlError);
    }
    expect(parsePublicUrl("https://example.com/docs").href).toBe("https://example.com/docs");
  });
});

describe("soft 404 classification", () => {
  it("calls a 200-for-everything host a soft 404, and a real 404 a real 404", () => {
    const soft = classifySoft404(
      page({ text: "welcome home", title: "Home", bytes: 500 }),
      page({
        requestedUrl: "https://public.test/404less-probe-1",
        finalUrl: "https://public.test/404less-probe-1",
        text: "welcome home",
        title: "Home",
        bytes: 500,
        hops: [{ url: "https://public.test/404less-probe-1", status: 200 }],
      }),
    );
    expect(soft.verdict).toBe("soft-404");

    const real = classifySoft404(
      page({
        status: 404,
        title: "Not found",
        text: "not found",
        hops: [{ url: "https://public.test/docs", status: 404 }],
      }),
      page({
        requestedUrl: "https://public.test/404less-probe-1",
        status: 404,
        title: "Not found",
        text: "not found",
        hops: [{ url: "https://public.test/404less-probe-1", status: 404 }],
      }),
    );
    expect(real.verdict).toBe("real-404");

    const ok = classifySoft404(
      page({}),
      page({
        requestedUrl: "https://public.test/404less-probe-1",
        finalUrl: "https://public.test/404less-probe-1",
        status: 404,
        title: "Not found",
        text: "page not found",
        hops: [{ url: "https://public.test/404less-probe-1", status: 404 }],
      }),
    );
    expect(ok.verdict).toBe("ok");
  });
});
