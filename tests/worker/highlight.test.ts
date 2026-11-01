// Unit tests for the dashboard's snippet highlighter (pure functions, no
// worker needed, but they run inside workerd anyway via the same pool).
import { describe, expect, test } from "vitest";
import { highlight, type Language, type TokenType } from "../../apps/web/src/client/lib/highlight";

/** The non-plain, non-punctuation tokens, as `type:text`. */
function marks(code: string, language: Language): string[] {
  return highlight(code, language)
    .filter((t) => t.type !== "plain" && t.type !== "punct")
    .map((t) => `${t.type}:${t.text.trim()}`);
}

function typeOf(code: string, language: Language, text: string): TokenType | undefined {
  return highlight(code, language).find((t) => t.text.trim() === text)?.type;
}

const nextSnippet = [
  "// app/not-found.js (App Router)",
  "import Script from 'next/script'",
  "",
  "export default function NotFound() {",
  "  return (",
  "    <>",
  "      <h1>404</h1>",
  '      <Script src="https://x/embed.js" data-site="k" data-404="true" strategy="afterInteractive" />',
  "    </>",
  "  )",
  "}",
].join("\n");

describe("highlight", () => {
  test("joining the tokens gives back the code, for every language", () => {
    const samples: [Language, string][] = [
      ["html", '<script src="https://x/embed.js" data-site="k" defer></script>'],
      ["jsx", nextSnippet],
      ["json", JSON.stringify({ mcpServers: { "404less": { url: "https://x/mcp" } } }, null, 2)],
      ["shell", 'claude mcp add --transport http 404less https://x/mcp \\\n  --header "A: b"'],
      ["conf", "location = /a {\n  return 301 /b;\n}"],
      ["header", "Authorization: Bearer 404l_x"],
      ["text", "Fix this broken link.\n<not a tag>"],
      ["html", "<div unclosed='x"],
      ["jsx", "<Foo bar={{ a: 1 }"],
    ];
    for (const [language, code] of samples) {
      expect(
        highlight(code, language)
          .map((t) => t.text)
          .join(""),
      ).toBe(code);
    }
  });

  test("html: tag, attributes and values", () => {
    expect(marks('<script src="/embed.js" data-site="k" defer></script>', "html")).toEqual([
      "tag:script",
      "attr:src",
      'string:"/embed.js"',
      "attr:data-site",
      'string:"k"',
      "attr:defer",
      "tag:script",
    ]);
  });

  test("jsx: code around the tags, children stay text", () => {
    expect(typeOf(nextSnippet, "jsx", "// app/not-found.js (App Router)")).toBe("comment");
    expect(typeOf(nextSnippet, "jsx", "import")).toBe("keyword");
    expect(typeOf(nextSnippet, "jsx", "'next/script'")).toBe("string");
    expect(typeOf(nextSnippet, "jsx", "Script")).toBe("plain"); // the imported name
    expect(marks(nextSnippet, "jsx")).toContain("tag:Script"); // the element
    expect(typeOf(nextSnippet, "jsx", "strategy")).toBe("attr");
    expect(typeOf(nextSnippet, "jsx", "404")).toBe("plain"); // <h1>404</h1> is text
    expect(marks(nextSnippet, "jsx").filter((m) => m === "tag:h1")).toHaveLength(2);
  });

  test("jsx: a less-than comparison is not a tag", () => {
    expect(marks("const ok = a <b", "jsx")).toEqual(["keyword:const"]);
  });

  test("json: keys apart from string values", () => {
    expect(marks('{ "permanent": true, "source": "/a", "n": 2 }', "json")).toEqual([
      'attr:"permanent"',
      "keyword:true",
      'attr:"source"',
      'string:"/a"',
      'attr:"n"',
      "number:2",
    ]);
  });

  test("shell: the program, flags and quoted values", () => {
    expect(
      marks("codex mcp add 404less --url https://x/mcp && echo '#ok' # done", "shell"),
    ).toEqual(["keyword:codex", "attr:--url", "keyword:echo", "string:'#ok'", "comment:# done"]);
  });

  test("conf: directives, status codes and comments; paths stay plain", () => {
    expect(marks("# _redirects\n/docs/a  /docs/b  301", "conf")).toEqual([
      "comment:# _redirects",
      "number:301",
    ]);
    expect(marks("Redirect 301 /a /b", "conf")).toEqual(["keyword:Redirect", "number:301"]);
  });

  test("text is one plain token", () => {
    expect(highlight("<script> // not code", "text")).toEqual([
      { type: "plain", text: "<script> // not code" },
    ]);
  });
});
