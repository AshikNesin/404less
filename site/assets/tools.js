// Marketing-site tools. The pages are static; this posts to /api/tools and draws the result.
(() => {
  const form = document.querySelector("[data-tool]");
  if (!form) return;
  const kind = form.getAttribute("data-tool");
  const msg = form.querySelector("[data-msg]");
  const out = form.querySelector("[data-out]");

  const examples = {
    pairs:
      "/docs/v1/install /docs/install 301\n/docs/v1/config /docs/config 301\n/blog/* /news/:splat 301\n",
    shadow:
      "# This is why a Netlify redirect seems to do nothing: the splat is first.\n/* /index.html 200\n/docs/old /docs/new 301\n/blog/* /news/:splat 301\n",
    vercel: JSON.stringify(
      {
        redirects: [
          { source: "/old", destination: "/new", permanent: true },
          { source: "/blog/:path*", destination: "/news/:path*", statusCode: 301 },
        ],
      },
      null,
      2,
    ),
    csv: "source,destination,status\n/pricing,/pricing/2026,301\n/blog/old-name,/blog/new-name,301\n",
  };

  form.addEventListener("click", (event) => {
    const button = event.target.closest("[data-example]");
    if (!button) return;
    const area = form.querySelector("textarea");
    if (area && examples[button.getAttribute("data-example")]) {
      area.value = examples[button.getAttribute("data-example")];
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    setMessage("");
    button.disabled = true;
    try {
      if (kind === "redirects") await runRedirects();
      else if (kind === "chain") await runChain();
      else if (kind === "soft404") await runSoft();
      else if (kind === "scan") await runScan();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      button.disabled = false;
    }
  });

  function setMessage(text) {
    if (!msg) return;
    msg.hidden = !text;
    msg.textContent = text;
  }

  async function post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The check failed (${res.status}).`);
    return data;
  }

  async function runRedirects() {
    const input = form.querySelector("textarea").value;
    const data = await post("/api/tools/redirects", { input });
    out.hidden = false;
    const rules = data.rules || {};
    const tabs = [
      ["redirects", "_redirects"],
      ["vercel", "vercel.json"],
      ["nextjs", "Next.js"],
      ["nginx", "Nginx"],
      ["apache", ".htaccess"],
    ];
    const tabList = out.querySelector("[data-tabs]");
    const code = out.querySelector("[data-code]");
    tabList.replaceChildren();
    let current = "redirects";
    const show = (key) => {
      current = key;
      code.textContent = rules[key] || "";
      for (const button of tabList.querySelectorAll("button")) {
        button.setAttribute("aria-selected", button.dataset.key === key ? "true" : "false");
      }
    };
    for (const [key, label] of tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.key = key;
      button.textContent = label;
      button.addEventListener("click", () => show(key));
      tabList.append(button);
    }
    show("redirects");
    const copy = out.querySelector("[data-copy]");
    copy.onclick = () => copyText(rules[current] || "", copy);

    const issues = out.querySelector("[data-issues]");
    issues.replaceChildren();
    for (const issue of data.issues || []) {
      const li = document.createElement("li");
      li.className = issue.severity === "error" ? "error" : "";
      li.textContent = (issue.line ? `Line ${issue.line}: ` : "") + issue.message;
      issues.append(li);
    }
    const notes = out.querySelector("[data-notes]");
    notes.replaceChildren();
    for (const note of data.notes || []) {
      const p = document.createElement("p");
      p.className = "tool-note";
      p.textContent = note;
      notes.append(p);
    }
    const detected = out.querySelector("[data-detected]");
    const names = {
      pairs: "URL pairs",
      csv: "CSV",
      netlify: "Netlify / Cloudflare Pages _redirects",
      vercel: "vercel.json",
    };
    detected.textContent = data.pairs?.length
      ? `Read as ${names[data.detected] || data.detected}. ${data.pairs.length} rule${data.pairs.length === 1 ? "" : "s"}.`
      : "Nothing to convert.";
  }

  async function runChain() {
    const url = form.querySelector("input[name=url]").value.trim();
    const data = await post("/api/tools/redirect-chain", { url });
    drawHops(data);
  }

  async function runSoft() {
    const url = form.querySelector("input[name=url]").value.trim();
    const missingPath = form.querySelector("input[name=missingPath]").value.trim();
    const data = await post("/api/tools/soft-404", { url, missingPath: missingPath || undefined });
    out.hidden = false;
    const verdict = out.querySelector("[data-verdict]");
    verdict.className = `flag ${data.verdict === "ok" || data.verdict === "real-404" ? "ok" : data.verdict === "error" ? "bad" : "warn"}`;
    const labels = {
      "real-404": "Real 404",
      "soft-404": "Soft 404",
      ok: "Looks fine",
      redirect: "Redirect",
      error: "Could not check",
    };
    verdict.textContent = labels[data.verdict] || data.verdict;
    out.querySelector("[data-summary]").textContent = data.summary || "";
    const rows = out.querySelector("[data-rows]");
    rows.replaceChildren();
    for (const [label, page] of [
      ["URL you entered", data.target],
      ["Path that should not exist", data.probe],
    ]) {
      if (!page) continue;
      const tr = document.createElement("tr");
      tr.append(
        cell(label),
        cell(String(page.status || "—")),
        cell(page.finalUrl || page.requestedUrl || ""),
        cell(page.title || ""),
        cell(page.noindex ? "noindex" : ""),
      );
      rows.append(tr);
    }
  }

  async function runScan() {
    const url = form.querySelector("input[name=url]").value.trim();
    out.hidden = false;
    const brokenBody = out.querySelector("[data-broken]");
    const chainBody = out.querySelector("[data-chains]");
    const progress = out.querySelector("[data-progress]");
    brokenBody.replaceChildren();
    chainBody.replaceChildren();
    const broken = new Map();
    const chains = new Map();
    const notes = new Set();
    let state = null;
    let guard = 0;
    let done = false;
    while (!done && guard < 20) {
      guard += 1;
      progress.textContent = state ? `Checked ${state.pages} pages…` : "Starting…";
      const data = await post("/api/tools/scan", { url, maxPages: 60, state });
      state = data.state;
      for (const row of data.broken || []) {
        broken.set(`${row.url} ${row.foundOn || ""}`, row);
      }
      for (const row of data.chains || []) chains.set(row.url, row);
      for (const note of data.notes || []) notes.add(note);
      progress.textContent = `Checked ${data.pagesFetched} of up to ${data.pageCap} pages.`;
      paintScan(brokenBody, chainBody, broken, chains, [...notes]);
      done = data.done;
      if (!data.done && state && state.queue && state.queue.length === 0 && data.pagesFetched === 0)
        break;
    }
    progress.textContent = done ? `Finished. ${state?.pages || 0} pages.` : progress.textContent;
  }

  function paintScan(brokenBody, chainBody, broken, chains, notes) {
    brokenBody.replaceChildren();
    if (!broken.size) {
      const tr = document.createElement("tr");
      const td = cell("No broken links in the pages checked so far.");
      td.colSpan = 3;
      tr.append(td);
      brokenBody.append(tr);
    }
    for (const row of broken.values()) {
      const tr = document.createElement("tr");
      tr.append(cell(row.url), cell(String(row.status || "—")), cell(row.foundOn || ""));
      brokenBody.append(tr);
    }
    chainBody.replaceChildren();
    if (!chains.size) {
      const tr = document.createElement("tr");
      const td = cell("No redirect chains.");
      td.colSpan = 3;
      tr.append(td);
      chainBody.append(tr);
    }
    for (const row of chains.values()) {
      const tr = document.createElement("tr");
      tr.append(cell(row.url), cell((row.flags || []).join(", ")), cell(row.foundOn || ""));
      chainBody.append(tr);
    }
    const noteList = out.querySelector("[data-notes]");
    noteList.replaceChildren();
    for (const note of notes) {
      const p = document.createElement("p");
      p.className = "tool-note";
      p.textContent = note;
      noteList.append(p);
    }
  }

  function drawHops(data) {
    out.hidden = false;
    out.querySelector("[data-summary]").textContent = data.summary || "";
    const flags = out.querySelector("[data-flags]");
    flags.replaceChildren();
    const labels = {
      chain: ["Chain", "warn"],
      loop: ["Loop", "bad"],
      "mixed-scheme": ["http ↔ https", "warn"],
      "too-long": ["Too long", "bad"],
      blocked: ["Blocked", "bad"],
    };
    if (!(data.flags || []).length) {
      const span = document.createElement("span");
      span.className = "flag ok";
      span.textContent = data.hops?.length > 1 ? "Single redirect" : "No redirect";
      flags.append(span);
    }
    for (const flag of data.flags || []) {
      const span = document.createElement("span");
      const [label, tone] = labels[flag] || [flag, ""];
      span.className = `flag ${tone}`;
      span.textContent = label;
      flags.append(span);
    }
    const list = out.querySelector("[data-hops]");
    list.replaceChildren();
    (data.hops || []).forEach((hop, index) => {
      const li = document.createElement("li");
      const status = document.createElement("strong");
      status.textContent = hop.status ? String(hop.status) : "—";
      const url = document.createElement("span");
      url.className = "url";
      url.textContent = `${index + 1}. ${hop.url}`;
      li.append(status, url);
      list.append(li);
    });
  }

  function cell(text) {
    const td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      const previous = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = previous;
      }, 1200);
    } catch {
      setMessage("Could not copy. Select the rule and copy it yourself.");
    }
  }
})();
