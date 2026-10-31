/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vite-plus/test";
import { getTheme, initTheme, setDefaultTheme, setTheme } from "@groot/shell/lib/theme";

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  setDefaultTheme("dark");
});

describe("theme", () => {
  it("uses the configurable default before a user chooses a theme", () => {
    setDefaultTheme("light");

    expect(initTheme()).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("persists a user choice and applies the dark class", () => {
    initTheme();
    setTheme("light");

    expect(getTheme()).toBe("light");
    expect(localStorage.getItem("groot.theme")).toBe("light");
    expect(document.documentElement).not.toHaveClass("dark");

    setTheme("dark");

    expect(getTheme()).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("supports the system preference when matchMedia is unavailable", () => {
    setTheme("system");

    expect(getTheme()).toBe("system");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
