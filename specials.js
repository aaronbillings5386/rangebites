/**
 * RangeBites restaurant specials inbox.
 * Public insert only. Owner-only read. Never render submissions as live coupons.
 * Same-origin fetch only. Do not load Amplitude, maps.mail.ru, or public Overpass.
 */
(function () {
  "use strict";

  var INBOX_URL = "./.herenow/data/specials_inbox";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function $(id) {
    return document.getElementById(id);
  }

  function uuid() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }
    } catch (_) {}
    var s = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    return s.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function stripTags(s) {
    return String(s || "").replace(/<[^>]*>/g, "");
  }

  function trimField(s, max) {
    var t = stripTags(s).replace(/\s+/g, " ").trim();
    if (t.length > max) t = t.slice(0, max);
    return t;
  }

  function hasBannedUrl(s) {
    return /https?:\/\/|javascript:|data:|vbscript:|\bwww\./i.test(s);
  }

  function normalizeWebsite(raw) {
    var u = stripTags(raw).trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) {
      if (/^\/\//.test(u)) u = "https:" + u;
      else if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#].*)?$/i.test(u)) u = "https://" + u;
      else return null;
    }
    try {
      var parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      if (parsed.username || parsed.password) return null;
      var href = parsed.href;
      if (href.length > 200) href = href.slice(0, 200);
      return href;
    } catch (_) {
      return null;
    }
  }

  function showErr(msg) {
    var el = $("errMsg");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
  }

  function hideErr() {
    var el = $("errMsg");
    if (!el) return;
    el.textContent = "";
    el.classList.remove("show");
  }

  function showClosed() {
    var form = $("specialsForm");
    var closed = $("closedMsg");
    if (form) form.classList.add("hidden");
    if (closed) closed.classList.add("show");
  }

  function showSuccess() {
    var form = $("specialsForm");
    var ok = $("successMsg");
    if (form) form.classList.add("hidden");
    if (ok) ok.classList.add("show");
  }

  function onSubmit(e) {
    e.preventDefault();
    hideErr();
    var hp = trimField($("company_url") && $("company_url").value, 80);
    if (hp) {
      showSuccess();
      return;
    }
    var name = trimField($("restaurant_name") && $("restaurant_name").value, 80);
    var city = trimField($("city_or_zip") && $("city_or_zip").value, 80);
    var special = trimField($("special_text") && $("special_text").value, 280);
    var code = trimField($("code") && $("code").value, 40);
    var email = trimField($("contact_email") && $("contact_email").value, 120).toLowerCase();
    var websiteRaw = $("website") && $("website").value;
    var website = normalizeWebsite(websiteRaw);

    if (!name || !city || !special || !email) {
      showErr("Fill restaurant name, city or zip, special text, and contact email.");
      return;
    }
    if (!EMAIL_RE.test(email)) {
      showErr("Enter a valid contact email.");
      return;
    }
    if (hasBannedUrl(name) || hasBannedUrl(city) || hasBannedUrl(special) || (code && hasBannedUrl(code))) {
      showErr("URLs belong in the website field only.");
      return;
    }
    if (websiteRaw && String(websiteRaw).trim() && website === null) {
      showErr("Website must be http or https.");
      return;
    }

    var body = {
      restaurant_name: name,
      city_or_zip: city,
      special_text: special,
      contact_email: email,
    };
    if (code) body.code = code;
    if (website) body.website = website;

    var btn = $("submitBtn");
    if (btn) btn.disabled = true;

    fetch(INBOX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": uuid(),
      },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (res.status === 403 || res.status === 404) {
          showClosed();
          return null;
        }
        if (res.status === 429) {
          showErr("Too many submissions from this network. Try later.");
          return null;
        }
        if (!res.ok) {
          showErr("Couldn’t send that. Try again.");
          return null;
        }
        showSuccess();
        return null;
      })
      .catch(function () {
        showErr("Couldn’t reach the inbox. Try again.");
      })
      .then(function () {
        if (btn && !$("successMsg").classList.contains("show") && !$("closedMsg").classList.contains("show")) {
          btn.disabled = false;
        }
      });
  }

  var form = $("specialsForm");
  if (form) form.addEventListener("submit", onSubmit);
})();
