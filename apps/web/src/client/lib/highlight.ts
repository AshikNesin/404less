// A small syntax highlighter for the dashboard's snippets: install tags,
// redirect rules, MCP configs and shell commands. Covers exactly those
// languages, needs no dependency, and returns tokens (not HTML), so the
// caller renders plain React text and nothing is ever injected as markup.

export type Language = "html" | "jsx" | "json" | "shell" | "conf" | "header" | "text";

export type TokenType =
  | "comment"
  | "keyword"
  | "tag"
  | "attr"
  | "string"
  | "number"
  | "punct"
  | "plain";

export interface Token {
  type: TokenType;
  text: string;
}

const JS_KEYWORDS = new Set([
  "async",
  "await",
  "const",
  "default",
  "export",
  "false",
  "from",
  "function",
  "import",
  "let",
  "module",
  "new",
  "null",
  "return",
  "true",
  "undefined",
  "var",
]);

/** Splits `code` into tokens; joining their text gives back `code` exactly. */
export function highlight(code: string, language: Language): Token[] {
  const out: Token[] = [];
  const push = (type: TokenType, text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  switch (language) {
    case "html":
      html(code, push);
      break;
    case "jsx":
      scanJs(code, push, true);
      break;
    case "json":
      json(code, push);
      break;
    case "shell":
      shell(code, push);
      break;
    case "conf":
      conf(code, push);
      break;
    case "header":
      header(code, push);
      break;
    default:
      push("plain", code);
  }
  return out;
}

type Push = (type: TokenType, text: string) => void;

/** Runs sticky regexes at each position; the first match wins, else one plain char. */
function scan(
  code: string,
  rules: [RegExp, (m: RegExpExecArray, at: number) => void][],
  push: Push,
) {
  let i = 0;
  outer: while (i < code.length) {
    for (const [re, emit] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length > 0) {
        emit(m, i);
        i += m[0].length;
        continue outer;
      }
    }
    push("plain", code[i]);
    i++;
  }
}

const sticky = (source: string) => new RegExp(source, "y");

/** Inside a tag, after its name: attributes, values, `{expressions}`, up to `>`. */
function tagBody(code: string, start: number, push: Push, jsx: boolean): number {
  let i = start;
  while (i < code.length) {
    const rest = code.slice(i);
    const close = rest.match(/^\/?>/);
    if (close) {
      push("punct", close[0]);
      return i + close[0].length;
    }
    if (jsx && rest[0] === "{") {
      const end = braceEnd(code, i);
      push("punct", "{");
      scanJs(code.slice(i + 1, end), push, true);
      if (end < code.length) push("punct", "}");
      i = end + 1;
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\s+/))) push("plain", m[0]);
    else if ((m = rest.match(/^("[^"]*"|'[^']*')/))) push("string", m[0]);
    else if ((m = rest.match(/^=/))) push("punct", m[0]);
    else if ((m = rest.match(/^[^\s=>/"'{]+/))) push("attr", m[0]);
    else {
      push("plain", rest[0]); // a stray `/` or unclosed quote
      i++;
      continue;
    }
    i += m[0].length;
  }
  return i;
}

function braceEnd(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return i;
  }
  return code.length;
}

/** HTML and HTML-ish templates (PHP, Astro). */
function html(code: string, push: Push) {
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    const comment = rest.match(/^<!--[\s\S]*?(-->|$)/);
    const open = rest.match(/^<\/?[A-Za-z][\w.:-]*/);
    if (comment) {
      push("comment", comment[0]);
      i += comment[0].length;
    } else if (open) {
      const slash = open[0].startsWith("</") ? 2 : 1;
      push("punct", open[0].slice(0, slash));
      push("tag", open[0].slice(slash));
      i = tagBody(code, i + open[0].length, push, false);
    } else {
      const text = rest.match(/^[^<]+|^</)![0];
      push("plain", text);
      i += text.length;
    }
  }
}

/** JavaScript, with JSX tags when `jsx`. */
function scanJs(code: string, push: Push, jsx: boolean) {
  let i = 0;
  let depth = 0; // open JSX elements: inside one, text is children, not code
  // a `<` opens a tag only where an expression can start, not after a value
  const canStartTag = () => depth > 0 || !/[\w)\]"'`]$/.test(code.slice(0, i).trimEnd());
  while (i < code.length) {
    const rest = code.slice(i);
    let m: RegExpMatchArray | null;
    if (jsx && (m = rest.match(/^<\/[A-Za-z][\w.:-]*\s*>|^<\/>/)) && depth > 0) {
      const name = m[0].slice(2, -1).trim();
      push("punct", "</");
      push("tag", name);
      push("punct", m[0].slice(2 + name.length));
      depth--;
    } else if (jsx && (m = rest.match(/^<>/)) && canStartTag()) {
      push("punct", m[0]); // fragment
      depth++;
    } else if (jsx && (m = rest.match(/^<[A-Za-z][\w.:-]*/)) && canStartTag()) {
      push("punct", "<");
      push("tag", m[0].slice(1));
      i = tagBody(code, i + m[0].length, push, true);
      if (!code.slice(0, i).endsWith("/>")) depth++;
      continue;
    } else if (depth > 0 && rest[0] === "{") {
      const end = braceEnd(code, i);
      push("punct", "{");
      scanJs(code.slice(i + 1, end), push, true);
      if (end < code.length) push("punct", "}");
      i = end + 1;
      continue;
    } else if (depth > 0) {
      m = rest.match(/^[^<{]+|^[<{]/)!;
      push("plain", m[0]); // children text
    } else if ((m = rest.match(/^\/\/[^\n]*/)) || (m = rest.match(/^\/\*[\s\S]*?(\*\/|$)/))) {
      push("comment", m[0]);
    } else if ((m = rest.match(/^("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)/))) {
      push("string", m[0]);
    } else if ((m = rest.match(/^\d+(\.\d+)?\b/))) {
      push("number", m[0]);
    } else if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) {
      const word = m[0];
      const isKey = /^\s*:/.test(code.slice(i + word.length));
      push(JS_KEYWORDS.has(word) ? "keyword" : isKey ? "attr" : "plain", word);
    } else if ((m = rest.match(/^[{}()[\];,.:=<>+\-*/!?&|]/))) {
      push("punct", m[0]);
    } else {
      m = rest.match(/^\s+|^[\s\S]/)!;
      push("plain", m[0]);
    }
    i += m[0].length;
  }
}

function json(code: string, push: Push) {
  scan(
    code,
    [
      [
        sticky(String.raw`"(?:\\.|[^"\\])*"`),
        (m, at) => push(/^\s*:/.test(code.slice(at + m[0].length)) ? "attr" : "string", m[0]),
      ],
      [sticky(String.raw`-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`), (m) => push("number", m[0])],
      [sticky(String.raw`\b(?:true|false|null)\b`), (m) => push("keyword", m[0])],
      [sticky(String.raw`[{}[\],:]`), (m) => push("punct", m[0])],
    ],
    push,
  );
}

function shell(code: string, push: Push) {
  // the first word of each command (line start, or after && | ;) is the program
  let commandNext = true;
  scan(
    code,
    [
      [
        sticky(String.raw`#[^\n]*`),
        (m, at) => push(at === 0 || /\s/.test(code[at - 1]) ? "comment" : "plain", m[0]),
      ],
      [sticky(String.raw`\\\n`), (m) => push("punct", m[0])],
      [
        sticky(String.raw`\n`),
        (m) => {
          commandNext = true;
          push("plain", m[0]);
        },
      ],
      [sticky(String.raw`[ \t]+`), (m) => push("plain", m[0])],
      [
        sticky(String.raw`&&|\|\||[|;]`),
        (m) => {
          commandNext = true;
          push("punct", m[0]);
        },
      ],
      [
        sticky(String.raw`"(?:\\.|[^"\\])*"|'[^']*'`),
        (m) => {
          commandNext = false;
          push("string", m[0]);
        },
      ],
      [sticky(String.raw`\$\{[^}]*\}|\$[A-Za-z_]\w*`), (m) => push("attr", m[0])],
      [
        sticky(String.raw`--?[A-Za-z][\w-]*`),
        (m) => {
          commandNext = false;
          push("attr", m[0]);
        },
      ],
      [
        sticky(String.raw`[^\s"'|;&\\]+`),
        (m) => {
          push(commandNext ? "keyword" : "plain", m[0]);
          commandNext = false;
        },
      ],
    ],
    push,
  );
}

/** Line-based config: nginx, .htaccess, _redirects. */
function conf(code: string, push: Push) {
  let lineStart = true;
  scan(
    code,
    [
      [
        sticky(String.raw`#[^\n]*`),
        (m, at) => push(at === 0 || /\s/.test(code[at - 1]) ? "comment" : "plain", m[0]),
      ],
      [
        sticky(String.raw`\n`),
        (m) => {
          lineStart = true;
          push("plain", m[0]);
        },
      ],
      [sticky(String.raw`[ \t]+`), (m) => push("plain", m[0])],
      [
        sticky(String.raw`"(?:\\.|[^"\\])*"|'[^']*'`),
        (m) => {
          lineStart = false;
          push("string", m[0]);
        },
      ],
      [
        sticky(String.raw`\d+(?=[\s;]|$)`),
        (m) => {
          lineStart = false;
          push("number", m[0]);
        },
      ],
      [
        sticky(String.raw`[{};=]`),
        (m) => {
          lineStart = m[0] !== "=";
          push("punct", m[0]);
        },
      ],
      [
        sticky(String.raw`[^\s{};="']+`),
        (m) => {
          // the directive (`location`, `return`, `Redirect`); a path (`/docs`) is not one
          push(lineStart && /^[A-Za-z]/.test(m[0]) ? "keyword" : "plain", m[0]);
          lineStart = false;
        },
      ],
    ],
    push,
  );
}

/** `Name: value` HTTP header lines. */
function header(code: string, push: Push) {
  for (const line of code.split(/(\n)/)) {
    const m = line.match(/^([\w-]+)(:)([\s\S]*)$/);
    if (m) {
      push("attr", m[1]);
      push("punct", m[2]);
      push("plain", m[3]);
    } else push("plain", line);
  }
}
