// Minimal zero-build dashboard (vanilla JS, dark theme). Replaced by the React
// SPA in a later milestone; kept build-free so a single wrangler deploy suffices.
export const dashboardHtml = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>404less</title>
<style>
  :root{--bg:#f6f7f9;--card:#ffffff;--line:#e3e6eb;--fg:#1b1e27;--mut:#6b7280;--acc:#2563eb}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,sans-serif}
  .wrap{max-width:880px;margin:0 auto;padding:32px 20px}
  h1{font-size:22px} h1 span{color:var(--acc)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin:14px 0}
  input,button{font:inherit;border-radius:8px;border:1px solid var(--line);background:#ffffff;color:var(--fg);padding:8px 12px}
  button{cursor:pointer;background:#2563eb;border-color:#1d4ed8;color:#fff} button:hover{background:#1d4ed8}
  .muted{color:var(--mut)}
  code{background:#f1f3f6;color:#24292f;padding:2px 6px;border-radius:6px;font-size:13px;word-break:break-all;display:inline-block}
  table{width:100%;border-collapse:collapse;font-size:14px}
  td,th{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
</style>
</head>
<body><div class="wrap">
<h1>404<span>less</span></h1>
<div id="app" class="card"><span class="muted">loading…</span></div>
</div>
<script>
const $ = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; };
const app = document.getElementById("app");
const api = async (path, opts) => (await fetch(path, {headers:{"Content-Type":"application/json"},...opts})).json();

async function main() {
  const t = await api("/api/teams");
  if (t && t.error === "unauthorized") return loginView();
  if (t && Array.isArray(t.teams)) return dashboardView(t.teams);
  loginView();
}

function loginView(msg) {
  app.innerHTML = "";
  app.append($(
    "<div>" +
    "  <p class=muted>Enter your email — we will send a sign-in link.</p>" +
    '  <div class="row"><input id="email" type="email" placeholder="you@example.com" style="flex:1"><button id="go">Send link</button></div>' +
    '  <p id="msg" class="muted">' + (msg || "") + "</p>" +
    "</div>"));
  app.querySelector("#go").onclick = async () => {
    const email = app.querySelector("#email").value;
    const r = await api("/auth/magic", {method: "POST", body: JSON.stringify({email})});
    if (r.devLink) app.querySelector("#msg").innerHTML = "Dev mode (no RESEND_API_KEY). <a href=" + r.devLink + " style=color:var(--acc)>Click to sign in</a>";
    else if (r.ok) app.querySelector("#msg").textContent = "Check your inbox — link expires in 15 min.";
    else app.querySelector("#msg").textContent = r.error || "failed";
  };
}

async function dashboardView(teams) {
  const {sites} = await api("/api/sites");
  app.innerHTML = "";
  const list = document.createElement("div");
  const form = $(
    '<div class="row">' +
    '  <input id="name" placeholder="Site name" style="flex:1">' +
    '  <input id="domain" placeholder="example.com" style="flex:1">' +
    "  <button id=add>Add site</button>" +
    '  <button id="out" style="background:#fff;border-color:#f3c7c7;color:#b91c1c">Sign out</button>' +
    "</div>");
  app.append(form, list);
  form.querySelector("#out").onclick = async () => { await api("/auth/logout",{method:"POST"}); location.reload(); };
  form.querySelector("#add").onclick = async () => {
    const name = form.querySelector("#name").value, domain = form.querySelector("#domain").value;
    let teamId = teams[0] && teams[0].id;
    if (!teamId) { const r = await api("/api/teams",{method:"POST",body:JSON.stringify({name:"Default"})}); teamId = r.team.id; teams=[r.team]; }
    const r = await api("/api/sites",{method:"POST",body:JSON.stringify({teamId,name,domain})});
    if (r.error) { alert(r.error); return; }
    const s2 = await api("/api/sites"); render(s2.sites);
  };
  function render(sites) {
    list.innerHTML = "";
    if (!sites.length) { list.append($("<p class=muted>No sites yet. Add one above.</p>")); return; }
    for (const s of sites) {
      const card = $(
        '<div class="card">' +
        '  <div class="row" style="justify-content:space-between">' +
        "    <b>" + s.name + "</b><span class=muted>" + s.domain + "</span>" +
        "  </div>" +
        "  <p class=muted>Embed:</p>" +
        '  <code>&lt;script src="' + location.origin + '/embed.js" data-site="' + s.site_key + '" defer&gt;&lt;/script&gt;</code>' +
        '  <div class="row" style="margin-top:8px">' +
        '    <input class="excl" placeholder="exclude pattern e.g. /wp-admin/*" style="flex:1">' +
        "    <button class=addex>Add exclusion</button>" +
        "    <button class=imp>Import sitemap</button>" +
        "  </div>" +
        '  <p class="exlst muted" style="margin:6px 0"></p>' +
        '  <p class="muted" style="margin-bottom:4px">Recent 404s</p>' +
        '  <div class="ev"></div>' +
        "</div>");
      const exlst = card.querySelector(".exlst");
      const excls = s.exclude_patterns || [];
      function drawExcls() {
        exlst.innerHTML = "";
        if (!excls.length) { exlst.textContent = "No exclusions."; return; }
        for (const e of excls) {
          const chip = $("<span></span>");
          chip.style.cssText = "display:inline-block;background:#f1f3f6;border:1px solid var(--line);border-radius:99px;padding:2px 10px;margin:2px 4px 2px 0";
          chip.textContent = e + " ×";
          chip.style.cursor = "pointer";
          chip.title = "click to remove";
          chip.onclick = async () => {
            const next = excls.filter((x) => x !== e);
            await api("/api/sites/" + s.id, {method:"PATCH", body: JSON.stringify({exclude_patterns: next})});
            excls.length = 0; excls.push(...next); drawExcls();
          };
          exlst.append(chip);
        }
      }
      drawExcls();
      card.querySelector(".addex").onclick = async () => {
        const v = card.querySelector(".excl").value.trim();
        if (!v) return;
        const next = excls.concat([v]);
        const r = await api("/api/sites/" + s.id, {method:"PATCH", body: JSON.stringify({exclude_patterns: next})});
        if (r.error) { alert(r.error); return; }
        excls.length = 0; excls.push(...next); card.querySelector(".excl").value = ""; drawExcls();
      };
      card.querySelector(".imp").onclick = async () => {
        card.querySelector(".imp").textContent = "Importing…";
        const r = await api("/api/sites/" + s.id + "/import-sitemap", {method:"POST", body: "{}"});
        card.querySelector(".imp").textContent = "Import sitemap";
        alert(r.error ? r.error : "Imported " + r.imported + " URLs from sitemap");
      };
      const ev = card.querySelector(".ev");
      api("/api/sites/" + s.id + "/events?limit=10").then(function(res){
        const events = res.events;
        if (!events || !events.length) { ev.append($("<span class=muted>none yet</span>")); return; }
        const tb = $('<table><tr><th>URL</th><th>Referrer</th><th>When</th></tr></table>');
        for (const e of events) {
          const tr = $("<tr><td></td><td></td><td></td></tr>");
          const tds = tr.querySelectorAll("td");
          tds[0].textContent = e.url;
          tds[1].textContent = e.referrer || "—";
          tds[2].textContent = new Date(e.ts).toISOString().slice(0,19);
          tb.append(tr);
        }
        ev.append(tb);
      });
      list.append(card);
    }
  }
  render(sites);
}
main();
</script></body></html>`;
