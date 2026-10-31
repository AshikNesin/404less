// The 404less embed script, served verbatim at /embed.js (see embed.routes.ts).
// Plain browser JS inside String.raw so it loads unchanged on Workers and Node.
// Keep it free of backticks and "${" (they would end or interpolate the template).
export default String.raw`/*! 404less embed · https://github.com/AshikNesin/404less
 *
 * <script src="https://404less.com/embed.js" data-site="SITE_KEY" defer></script>
 *
 * On a 404 page it (1) reports the hit to 404less and (2) asks for the closest
 * known pages and shows them to the visitor. Nothing happens on other pages.
 *
 * Detection (first match wins): data-404 on this script tag · window.__404less.is404
 * · data-404 on <html>/<body> · <meta name="404less"|"prerender-status-code"> ·
 * the document title ("404", "not found", "page doesn't exist").
 *
 * Options (data- attributes on the script tag):
 *   mode      toast | inline        floating card (default) or render into data-target
 *   target    CSS selector          container for inline mode (defaults to the script's parent)
 *   theme     auto | light | dark   auto follows prefers-color-scheme
 *   accent    #hex                  brand color for the icon + best match
 *   title     text                  heading (default "Looking for something?")
 *   text      text                  one-line intro under the heading
 *   position  right | left | center toast placement on desktop
 *   max       1..5                  suggestions to show (default 3)
 *   track     true | false          set false to only show suggestions
 *   branding  true | false          hide the "Powered by 404less" line
 *   url       absolute URL          report/suggest for this URL instead of location.href
 *
 * Styling: the widget lives in a shadow root; override colors from your CSS with
 *   .f404less { --f404-accent: #e11d48; --f404-bg: #fff; --f404-fg: #111; --f404-muted: #666; --f404-border: #ddd; --f404-radius: 12px }
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var siteKey = script.getAttribute('data-site');
  if (!siteKey) return;
  var apiBase;
  try { apiBase = new URL(script.src, location.href).origin; } catch (e) { return; }

  function attr(name, fallback) {
    var v = script.getAttribute('data-' + name);
    return v == null || v === '' ? fallback : v;
  }
  var cfg = {
    mode: attr('mode', 'toast') === 'inline' ? 'inline' : 'toast',
    target: attr('target', null),
    theme: attr('theme', 'auto'),
    accent: attr('accent', null),
    title: attr('title', 'Looking for something?'),
    text: attr('text', 'That page doesn’t exist, but one of these might be what you wanted.'),
    position: attr('position', 'right'),
    max: Math.max(1, Math.min(5, parseInt(attr('max', '3'), 10) || 3)),
    track: attr('track', 'true') !== 'false',
    branding: attr('branding', 'true') !== 'false',
    url: attr('url', null)
  };
  var force = script.getAttribute('data-404');
  var pageUrl = cfg.url || location.href;

  function is404() {
    if (force != null) return !(force === 'false' || force === '0');
    if (window.__404less && window.__404less.is404) return true;
    var root = document.documentElement, body = document.body;
    var a = root.getAttribute('data-404') || (body && body.getAttribute('data-404'));
    if (a === 'true' || a === '1' || a === '') return true;
    var metas = document.querySelectorAll('meta[name="404less"],meta[name="prerender-status-code"],meta[name="render:status_code"]');
    for (var i = 0; i < metas.length; i++) {
      if (/404|not found/i.test(metas[i].getAttribute('content') || '')) return true;
    }
    return /(^|\D)404(\D|$)|not\s+found|page\s+(doesn.?t|does\s+not|could\s+not\s+be|cannot\s+be)\s+(exist|be\s+found|found)/i.test(document.title || '');
  }

  function track() {
    var payload = JSON.stringify({ siteKey: siteKey, url: pageUrl, referrer: document.referrer || null, title: (document.title || '').slice(0, 300) || null });
    // text/plain keeps the request CORS-simple (no preflight); the API parses JSON regardless.
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(apiBase + '/api/track', new Blob([payload], { type: 'text/plain;charset=UTF-8' }))) return;
    } catch (e) { /* fall through */ }
    try {
      fetch(apiBase + '/api/track', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: payload, keepalive: true, mode: 'cors' }).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  function suggest() {
    var u = apiBase + '/api/suggestions?site=' + encodeURIComponent(siteKey) + '&url=' + encodeURIComponent(pageUrl) + '&limit=' + cfg.max;
    return fetch(u, { mode: 'cors' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // ---------- rendering ----------
  var CSS =
    ':host{all:initial;display:block}' +
    '.root{--bg:var(--f404-bg,#fff);--fg:var(--f404-fg,#111827);--muted:var(--f404-muted,#6b7280);--border:var(--f404-border,#e5e7eb);--hover:var(--f404-hover,#f3f4f6);--accent:var(--f404-accent,#1f1f23);--radius:var(--f404-radius,14px);--shadow:0 16px 40px rgba(15,23,42,.18),0 1px 2px rgba(15,23,42,.08);' +
      'font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--fg);-webkit-font-smoothing:antialiased;text-align:left;box-sizing:border-box}' +
    '.root *{box-sizing:border-box}' +
    '.root.dark{--bg:var(--f404-bg,#17181c);--fg:var(--f404-fg,#f3f4f6);--muted:var(--f404-muted,#9ca3af);--border:var(--f404-border,#2b2d33);--hover:var(--f404-hover,rgba(255,255,255,.06));--accent:var(--f404-accent,#e4e4e7);--shadow:0 16px 40px rgba(0,0,0,.55)}' +
    '.toast{position:fixed;z-index:2147483000;left:12px;right:12px;bottom:12px}' +
    '@media(min-width:640px){.toast{left:auto;right:20px;bottom:20px;width:380px}.toast.left{left:20px;right:auto}.toast.center{left:50%;right:auto;transform:translateX(-50%)}}' +
    '.card{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;animation:f404in .24s cubic-bezier(.2,.8,.2,1)}' +
    '.inline .card{box-shadow:none}' +
    '.head{display:flex;align-items:flex-start;gap:10px;padding:14px 14px 4px}' +
    '.icon{flex:none;width:32px;height:32px;border-radius:9px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);display:grid;place-items:center}' +
    '.icon svg{width:16px;height:16px}' +
    '.hd{min-width:0;flex:1}' +
    '.title{font-weight:600;font-size:14px;line-height:1.35;margin:4px 0 0}' +
    '.text{color:var(--muted);font-size:12.5px;line-height:1.4;margin:2px 0 0}' +
    '.close{all:unset;cursor:pointer;flex:none;color:var(--muted);padding:5px;margin:-2px -4px 0 0;border-radius:7px;line-height:0}' +
    '.close:hover,.close:focus-visible{background:var(--hover);color:var(--fg)}' +
    '.close svg{width:14px;height:14px}' +
    '.list{list-style:none;margin:0;padding:8px 8px 6px}' +
    '.item a{display:flex;align-items:center;gap:10px;padding:8px;border-radius:9px;text-decoration:none;color:inherit;min-width:0}' +
    '.item a:hover,.item a:focus-visible{background:var(--hover);outline:none}' +
    '.item a:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 45%,transparent)}' +
    '.n{flex:none;width:20px;height:20px;border-radius:6px;font-size:11px;font-weight:600;display:grid;place-items:center;background:var(--hover);color:var(--muted)}' +
    '.item.best .n{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}' +
    '.tx{min-width:0;flex:1;display:flex;flex-direction:column}' +
    '.t{display:block;font-weight:500;font-size:13.5px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.p{display:block;color:var(--muted);font-size:11.5px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}' +
    '.arrow{flex:none;color:var(--muted);opacity:.7;width:14px;height:14px;transition:transform .15s}' +
    '.item a:hover .arrow{transform:translate(1px,-1px);color:var(--accent);opacity:1}' +
    '.foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 14px 11px;font-size:11px;color:var(--muted)}' +
    '.foot a{color:inherit;text-decoration:none}.foot a:hover{text-decoration:underline}' +
    '.brand{display:inline-flex;align-items:center;gap:4px}.brand svg{width:13px;height:13px;opacity:.8}' +
    '.home{font-weight:500;color:var(--accent)!important}' +
    '.empty{padding:6px 14px 12px;font-size:13px;color:var(--muted)}' +
    '@keyframes f404in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '@media(prefers-reduced-motion:reduce){.card{animation:none}.arrow{transition:none}}';

  var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var ICON_BRAND = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 7.5v18"/><path d="M17.5 7.5 7.5 19.5h17"/><path d="m21.5 16 3.5 3.5-3.5 3.5"/></svg>';
  var ICON_ARROW = '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function labelFor(u) {
    try {
      var p = new URL(u);
      var path = decodeURIComponent(p.pathname.replace(/\/+$/, '') || '/');
      var last = path.split('/').filter(Boolean).pop() || p.hostname;
      var title = last.replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      return { title: title, path: path + (p.search || '') };
    } catch (e) {
      return { title: u, path: '' };
    }
  }

  function dismissKey() { return 'f404:dismissed:' + location.pathname; }
  function wasDismissed() { try { return sessionStorage.getItem(dismissKey()) === '1'; } catch (e) { return false; } }
  function remember() { try { sessionStorage.setItem(dismissKey(), '1'); } catch (e) { /* ignore */ } }

  function render(items, home) {
    items = (items || []).slice(0, cfg.max);
    var inline = cfg.mode === 'inline';
    if (!items.length && !inline) return;
    if (!inline && wasDismissed()) return;

    var mount = null;
    if (inline) {
      mount = cfg.target ? document.querySelector(cfg.target) : (script.parentNode && script.parentNode !== document.head ? script.parentNode : null);
      if (!mount) mount = document.body;
    }

    var host = el('div', 'f404less');
    host.setAttribute('data-404less', '');
    if (cfg.accent) host.style.setProperty('--f404-accent', cfg.accent);
    var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    var dark = cfg.theme === 'dark' || (cfg.theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root = el('div', 'root' + (dark ? ' dark' : '') + (inline ? ' inline' : ' toast ' + cfg.position));
    root.setAttribute('role', inline ? 'region' : 'dialog');
    root.setAttribute('aria-label', cfg.title);

    var card = el('div', 'card');
    var head = el('div', 'head');
    var icon = el('div', 'icon');
    icon.innerHTML = ICON_SEARCH;
    var hd = el('div', 'hd');
    hd.appendChild(el('p', 'title', cfg.title));
    if (cfg.text) hd.appendChild(el('p', 'text', items.length ? cfg.text : 'We couldn’t find a close match for this address.'));
    head.appendChild(icon);
    head.appendChild(hd);
    var close = null;
    if (!inline) {
      close = el('button', 'close');
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss');
      close.innerHTML = ICON_CLOSE;
      head.appendChild(close);
    }
    card.appendChild(head);

    if (items.length) {
      var list = el('ol', 'list');
      items.forEach(function (it, i) {
        var li = el('li', 'item' + (i === 0 ? ' best' : ''));
        var a = el('a');
        a.href = it.url;
        var lab = labelFor(it.url);
        a.appendChild(el('span', 'n', String(i + 1)));
        var tx = el('span', 'tx');
        tx.appendChild(el('span', 't', it.title || lab.title));
        tx.appendChild(el('span', 'p', lab.path));
        a.appendChild(tx);
        a.insertAdjacentHTML('beforeend', ICON_ARROW);
        li.appendChild(a);
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    var foot = el('div', 'foot');
    if (home) {
      var h = el('a', 'home', 'Go to the homepage →');
      h.href = home;
      foot.appendChild(h);
    } else {
      foot.appendChild(el('span'));
    }
    if (cfg.branding) {
      var b = el('a', 'brand');
      b.href = 'https://404less.com?ref=embed';
      b.target = '_blank';
      b.rel = 'noopener';
      b.innerHTML = ICON_BRAND;
      b.appendChild(document.createTextNode('Powered by 404less'));
      foot.appendChild(b);
    }
    card.appendChild(foot);
    root.appendChild(card);
    shadow.appendChild(root);

    function dismiss() {
      remember();
      var done = function () { if (host.parentNode) host.parentNode.removeChild(host); };
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || !card.animate) return done();
      card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }], { duration: 140, easing: 'ease-in' }).finished.then(done, done);
    }
    if (close) {
      close.addEventListener('click', dismiss);
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); dismiss(); }
      });
    }
    (mount || document.body).appendChild(host);
    return host;
  }

  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  // tiny public API for custom 404 pages (e.g. SPA routers): __404less.track(), __404less.suggest().then(render)
  var api = window.__404less = window.__404less || {};
  api.track = track;
  api.suggest = suggest;
  api.render = render;

  if (!is404()) return;
  if (cfg.track) track();
  suggest().then(function (d) {
    ready(function () { render(d && d.suggestions, d && d.home); });
  });
})();
`;
