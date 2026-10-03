/**
 * RangeBites — first-party counts only.
 * Page-open hits: body is {"kind": "view"|"locate"|"demo"|"deal"}; the app only sends "view",
 * at most once per browser session, from the home page (skipped entirely if sessionStorage is unavailable).
 * No location, email, cookies, or user-agent in the body.
 * "Devices that found food": body is {"kind":"found"} only. Anonymous +1. No device identifier is
 * created, stored, or sent. That request has no Idempotency-Key. Nothing is saved on the device except a
 * yes-or-no "already counted this session" flag in sessionStorage. The app does not store the requester IP.
 * The public number = LEGACY_FOUND_BASE + the number of "found" records. Page-open "hits" are owner-read.
 * The old "helped" collection is not written. The host may see the requester IP; this app does not store it.
 */
(function () {
  "use strict";

  var HITS_URL = "./.herenow/data/hits";
  /* "Devices that found food": one anonymous {"kind":"found"} per browser session, only after a
   * search or Locate Me returned ≥1 place. The session flag is "1" or absent. It is not an identifier.
   * Bots/crawlers, automation (webdriver), and QA runs (?qa=1, ?rbqa=1, rb_no_count=1) never count.
   * Writes go to the "found" collection only. The "helped" collection is never inserted. */
  /* Added to the public "found" total. Set this to the real helped count at publish
   * time. A new helped record has appeared since the earlier base, so confirm the
   * live count before shipping. */
  var LEGACY_FOUND_BASE = 2;
  var SESSION_COUNTED_KEY = "rb_found_session";
  var NO_COUNT_KEY = "rb_no_count";
  var TARGET_KEY = "rb_count_target"; // "found_selftest" = count-test bucket only
  var BOT_UA = /bot|crawl|spider|slurp|scrap|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|httpclient|java\/|go-http|phantom|puppeteer|playwright|selenium|axios|node-fetch/i;
  var MAX_PAGES = 260; // collection max is 25,000 records at 100 per page

  function countTarget() {
    var t = lsGet(TARGET_KEY);
    if (t === "helped" || t === "helped_selftest") t = "found_selftest";
    return t === "found_selftest" ? "found_selftest" : "found";
  }
  function foundUrl() { return "./.herenow/data/" + countTarget(); }
  function isSelfTest() { return countTarget() === "found_selftest"; }
  var KINDS = { view: true, locate: true, demo: true, deal: true };
  var CAP = 500;
  var PAGE = 100;

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

  function hit(kind) {
    if (!KINDS[kind]) return Promise.resolve(false);
    if (inBackoff(WRITE_BACKOFF_KEY)) return Promise.resolve(false);
    try {
      return fetch(HITS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": uuid(),
        },
        body: JSON.stringify({ kind: kind }),
        keepalive: true,
      }).then(function (res) {
        if (res && res.status === 429) startBackoff(WRITE_BACKOFF_KEY, WRITE_BACKOFF_MS);
        return !!(res && res.ok);
      }).catch(function () {
        return false;
      });
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function recordKind(rec) {
    if (!rec) return "";
    var data = rec.data && typeof rec.data === "object" ? rec.data : rec;
    var k = data && data.kind;
    return typeof k === "string" ? k : "";
  }

  function fetchHitsPage(cursor, base) {
    var url = (base || HITS_URL) + "?limit=" + PAGE;
    if (cursor) url += "&cursor=" + encodeURIComponent(cursor);
    return fetch(url, { method: "GET" }).then(function (res) {
      if (!res.ok) {
        var err = new Error("hits " + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  }

  function loadHits(max, base) {
    var cap = max || CAP;
    var all = [];
    function next(cursor) {
      return fetchHitsPage(cursor, base).then(function (body) {
        var recs = (body && body.records) || [];
        for (var i = 0; i < recs.length && all.length < cap; i++) all.push(recs[i]);
        var more = body && body.nextCursor;
        if (more && all.length < cap) return next(more);
        all.more = !!more; // more records beyond the cap → count is a lower bound
        return all;
      });
    }
    return next(null);
  }

  function tally(records) {
    var counts = { view: 0, locate: 0, demo: 0, deal: 0, total: 0 };
    (records || []).forEach(function (rec) {
      var k = recordKind(rec);
      if (KINDS[k]) counts[k] += 1;
      counts.total += 1;
    });
    return counts;
  }

  function zeros() {
    return { view: 0, locate: 0, demo: 0, deal: 0, total: 0 };
  }

  function formatOpens(n) {
    var v = Number(n) || 0;
    return v + (v === 1 ? " device" : " devices") + " got food results";
  }

  /* Header counter: last good count cached on-device as a number ("rb_helped_count").
   * One POST + one count fetch per browser session; after 429/failure back off and never show 0. */
  var COUNT_KEY = "rb_helped_count";
  var BACKOFF_KEY = "rb_hits_backoff_until";        // reads (count fetch)
  var WRITE_BACKOFF_KEY = "rb_hits_write_backoff_until"; // writes (page-open POST)
  var SENT_KEY = "rb_hit_view_sent";
  var FETCHED_KEY = "rb_count_fetched";
  var BACKOFF_MS = 20 * 60 * 1000;
  var WRITE_BACKOFF_MS = 60 * 60 * 1000;

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (_) {} }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (_) { return null; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, v); } catch (_) {} }

  function cachedCount() {
    if ((lsGet(COUNT_KEY + "_target") || "") !== countTarget()) return 0;
    var v = parseInt(lsGet(COUNT_KEY) || "", 10);
    return v > 0 ? v : 0;
  }
  function inBackoff(key) {
    var until = parseInt(lsGet(key || BACKOFF_KEY) || "", 10);
    return until > Date.now();
  }
  function startBackoff(key, ms) { lsSet(key || BACKOFF_KEY, String(Date.now() + (ms || BACKOFF_MS))); }

  /** Page through every "found" record and count them. Partial reads never paint.
   * Approximate: anyone can add a record (the host may rate-limit by IP). This app does not store that IP.
   * A new browser session can send the count again. */
  function countDistinctDevices() {
    var n = 0;
    var pages = 0;
    function next(cursor) {
      pages += 1;
      if (pages > MAX_PAGES) return Promise.reject(new Error("too many pages"));
      return fetchHitsPage(cursor, foundUrl()).then(function (body) {
        var recs = (body && body.records) || [];
        for (var i = 0; i < recs.length; i++) {
          if (recordKind(recs[i]) === "found") n += 1;
        }
        if (body && body.nextCursor) return next(body.nextCursor);
        return n + (isSelfTest() ? 0 : LEGACY_FOUND_BASE);
      });
    }
    return next(null);
  }

  function paintVisitCount(n, opts) {
    var num = document.getElementById("visitCountNum");
    var wrap = document.getElementById("visitCount");
    if (!num) return;
    var fresh = Number(n) || 0;
    // Exact server count wins; otherwise show the last exact count cached on this device.
    var v = opts && opts.exact ? fresh : Math.max(fresh, cachedCount());
    if (v <= 0) {
      // Never show 0 or an error — hide until a real count is known.
      if (wrap) wrap.hidden = true;
      return;
    }
    lsSet(COUNT_KEY, String(v));
    lsSet(COUNT_KEY + "_target", countTarget());
    num.textContent = String(v);
    if (wrap) {
      wrap.setAttribute("aria-label", "Devices that got food results (once per browser session; approximate): " + v);
      wrap.hidden = false;
    }
  }

  function refreshVisitCount(opts) {
    var num = document.getElementById("visitCountNum");
    if (!num) return Promise.resolve();
    paintVisitCount(0); // cached value (or hidden) right away
    var force = opts && opts.force;
    if (!force && (inBackoff(BACKOFF_KEY) || ssGet(FETCHED_KEY))) return Promise.resolve();
    return countDistinctDevices()
      .then(function (n) {
        ssSet(FETCHED_KEY, "1");
        lastExact = n;
        paintVisitCount(n, { exact: true });
      })
      .catch(function (err) {
        if (err && (err.status === 429 || err.status >= 500)) startBackoff(BACKOFF_KEY, BACKOFF_MS);
        paintVisitCount(0);
      });
  }

  function hitViewOncePerSession() {
    // No usable sessionStorage (missing or throws) -> skip the page-open send, so it never sends on every load.
    try {
      var ss = window.sessionStorage;
      if (!ss || ss.getItem(SENT_KEY) || inBackoff(WRITE_BACKOFF_KEY) || isTestTraffic()) return Promise.resolve(false);
      ss.setItem(SENT_KEY, "1");
    } catch (_) {
      return Promise.resolve(false);
    }
    return hit("view").then(function (ok) {
      if (ok) {
        var c = cachedCount();
        if (c > 0) lsSet(COUNT_KEY, String(c + 1));
      }
      return ok;
    });
  }

  /** Bots, automation, and QA/owner test traffic never count toward the public number. */
  function isTestTraffic() {
    try {
      if (/[?&](rb)?qa=1\b/.test(location.search)) lsSet(NO_COUNT_KEY, "1");
    } catch (_) {}
    if (lsGet(NO_COUNT_KEY) === "1") return true;
    if (isSelfTest()) return false; // count-test bucket: automation allowed, public number untouched
    try { if (navigator.webdriver) return true; } catch (_) {}
    try { if (BOT_UA.test(navigator.userAgent || "")) return true; } catch (_) {}
    return false;
  }

  /** Delete leftover device, visitor, and install ids. Named keys, plus any key that still looks like one. */
  function clearLegacyDeviceIds(localStore, sessionStore) {
    var named = [
      "rb_device",
      "rb_device_id",
      "deviceId",
      "device_id",
      "visitorId",
      "visitor_id",
      "installId",
      "install_id",
      "rb_helped_id",
      "rb_helped_done",
      "rb_helped_done_selftest",
      "rb_found_pending_key",
      "rb_visitor",
      "rb_install_id"
    ];
    var looksLikeId = /device|visitor|install|pending_key|helped_done|helped_id|deviceId|device_id/i;
    function wipe(store) {
      if (!store || typeof store.removeItem !== "function") return;
      var i;
      for (i = 0; i < named.length; i++) {
        try { store.removeItem(named[i]); } catch (_) {}
      }
      if (typeof store.length !== "number" || typeof store.key !== "function") return;
      var found = [];
      try {
        for (i = 0; i < store.length; i++) {
          var k = store.key(i);
          if (k && looksLikeId.test(k)) found.push(k);
        }
      } catch (_) {}
      for (i = 0; i < found.length; i++) {
        try { store.removeItem(found[i]); } catch (_) {}
      }
    }
    wipe(localStore);
    wipe(sessionStore);
  }

  var helpedInFlight = false;
  var lastExact = null; // exact found-record count fetched this page load
  /** Call after a live search/Locate Me returned ≥1 place. One anonymous +1 per browser session. */
  function markHelped() {
    var countedKey = isSelfTest() ? "rb_found_session_selftest" : SESSION_COUNTED_KEY;
    if (helpedInFlight || isTestTraffic() || inBackoff(WRITE_BACKOFF_KEY)) {
      return Promise.resolve(false);
    }
    try {
      var ss = window.sessionStorage;
      if (!ss || ss.getItem(countedKey) === "1") return Promise.resolve(false);
      ss.setItem(countedKey, "1");
    } catch (_) {
      return Promise.resolve(false);
    }
    helpedInFlight = true;
    return fetch(foundUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "found" }),
      keepalive: true,
    }).then(function (res) {
      helpedInFlight = false;
      if (res && res.ok) {
        if (lastExact != null) {
          lastExact += 1; // this send was accepted, so the on-screen total includes it
          paintVisitCount(lastExact, { exact: true });
        }
        return true;
      }
      if (res && res.status === 429) startBackoff(WRITE_BACKOFF_KEY, WRITE_BACKOFF_MS);
      return false;
    }).catch(function () {
      helpedInFlight = false;
      return false;
    });
  }

  window.RangeBitesMetrics = {
    markHelped: markHelped,
    hit: hit,
    loadHits: loadHits,
    tally: tally,
    zeros: zeros,
    refreshVisitCount: refreshVisitCount,
  };

  function boot() {
    var path = "";
    try {
      path = (location.pathname || "").split("/").pop() || "index.html";
    } catch (_) {
      path = "index.html";
    }
    try { localStorage.removeItem("rb_visit_count"); localStorage.removeItem("rb_visit_count_more"); } catch (_) {}
    try { clearLegacyDeviceIds(window.localStorage, window.sessionStorage); } catch (_) {}
    var home = !path || path === "index.html" || path === "";
    var wait = home ? hitViewOncePerSession() : Promise.resolve(false);
    wait.then(function () {
      return refreshVisitCount();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
