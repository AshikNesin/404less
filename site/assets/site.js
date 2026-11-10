// Marketing-site behaviour: analytics events, snippet copy, waitlist submit.
// Vendor scripts (Umami, PostHog) are injected by the Worker only when a var
// is set. track() is a no-op until then.
(function () {
  var f404 = (window.f404 = window.f404 || {});
  f404.track = function (name, props) {
    try {
      if (window.umami && typeof window.umami.track === "function")
        window.umami.track(name, props || {});
    } catch {
      /* vendor failed; the click still happened */
    }
    try {
      if (window.posthog && typeof window.posthog.capture === "function")
        window.posthog.capture(name, props || {});
    } catch {
      /* same */
    }
  };

  document.addEventListener("click", function (event) {
    var node = event.target;
    var anchor = null;
    while (node && node !== document) {
      if (node.tagName === "A") {
        anchor = node;
        break;
      }
      node = node.parentNode;
    }
    if (!anchor) return;
    var href = anchor.getAttribute("href") || "";
    var name = anchor.getAttribute("data-track");
    if (!name) {
      if (href.indexOf("deploy.workers.cloudflare.com") !== -1 || href === "/self-host")
        name = "self_host_click";
      else if (href.indexOf("github.com/AshikNesin/404less") !== -1) name = "github_click";
    }
    if (name) f404.track(name, { href: href });
  });

  document.querySelectorAll("pre.code").forEach(function (pre) {
    if (pre.closest(".vis, .trace")) return;
    var wrap = document.createElement("div");
    wrap.className = "copy-block";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    var button = document.createElement("button");
    button.type = "button";
    button.className = "copy-btn";
    button.textContent = "Copy";
    button.addEventListener("click", function () {
      var text = pre.innerText.replace(/\n$/, "");
      copyText(text).then(
        function () {
          button.textContent = "Copied";
          var section = pre.closest("section");
          f404.track("copy_snippet", {
            label: pre.getAttribute("data-snippet") || (section && section.id) || "snippet",
          });
          setTimeout(function () {
            button.textContent = "Copy";
          }, 1500);
        },
        function () {
          button.textContent = "Copy failed";
        },
      );
    });
    wrap.appendChild(button);
  });

  document.querySelectorAll("[data-waitlist]").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (form.dataset.busy === "1") return;
      form.dataset.busy = "1";
      var note = form.querySelector(".waitlist-note");
      var button = form.querySelector("button[type=submit]");
      if (note) {
        note.textContent = "";
        note.classList.remove("is-bad");
      }
      if (button) button.disabled = true;
      var data = new FormData(form);
      fetch(form.action, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          source: data.get("source"),
          company: data.get("company") || "",
        }),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        })
        .then(function (res) {
          if (res.ok && res.body && res.body.ok) {
            if (note)
              note.textContent = "You’re on the list. We’ll email you if a hosted version happens.";
            f404.track("waitlist_signup", { source: String(data.get("source") || "") });
            form.reset();
            return;
          }
          if (note) {
            note.textContent =
              (res.body && res.body.error) || "Couldn’t add you just now. Try again.";
            note.classList.add("is-bad");
          }
        })
        .catch(function () {
          if (note) {
            note.textContent = "Couldn’t add you just now. Try again.";
            note.classList.add("is-bad");
          }
        })
        .then(function () {
          form.dataset.busy = "";
          if (button) button.disabled = false;
        });
    });
  });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        if (document.execCommand("copy")) resolve();
        else reject(new Error("copy"));
      } catch (error) {
        reject(error);
      }
      area.remove();
    });
  }
})();
