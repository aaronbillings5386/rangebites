/**
 * RangeBites — first-party counts only.
 * Page-open hits: body is {"kind": "view"|"locate"|"demo"|"deal"}; the app only sends "view",
 * at most once per browser session, from the home page (skipped entirely if sessionStorage is unavailable).
 * No location, email, cookies, or user-agent in the body.
 * "People helped": body is {"kind":"helped","device":<code>}. The code is a one-time random device code
 * (crypto.randomUUID, or a Math.random UUID fallback) made on this device and kept in localStorage
 * ("rb_device_id"). It is sent once, after the first search or Locate Me that returns ≥1 place (retried only
 * if that send fails), and is also the Idempotency-Key ("helped-<code>"). It is used only to count distinct
 * devices for the "People helped" number. Clearing this site's storage makes a new code.
 * The host also sees the requester's IP address on these requests.
 */
(function () {
  "use strict";

  var HITS_URL = "./.herenow/data/hits";
  /* "People helped": each device counted at most once, ever, only after a search or Locate Me
   * returned ≥1 place. The record is {"kind":"helped","device":<random UUID>}: an anonymous ID
   * made on this device (no name, location, IP, or user agent). The count is the number of
   * DISTINCT device IDs, so retries, double taps, and second tabs never double count.
   * Bots/crawlers, automation (webdriver), and QA runs (?qa=1, ?rbqa=1, rb_no_count=1) never count. */
  var HELPED_COLLECTIONS = { helped: 1, helped_selftest: 1 };
  var DEVICE_KEY = "rb_device_id";
  var HELPED_DONE_KEY = "rb_helped_done";
  var NO_COUNT_KEY = "rb_no_count";
  var TARGET_KEY = "rb_count_target"; // "helped_selftest" = count-test bucket only (never the public number)
  var BOT_UA = /bot|crawl|spider|slurp|scrap|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|httpclient|java\/|go-http|phantom|puppeteer|playwright|selenium|axios|node-fetch/i;
  var MAX_PAGES = 260; // collection max is 25,000 records at 100 per page

  function countTarget() {
    var t = lsGet(TARGET_KEY);
    return HELPED_COLLECTIONS[t] ? t : "helped";
  }
  function helpedUrl() { return "./.herenow/data/" + countTarget(); }
  function isSelfTest() { return countTarget() === "helped_selftest"; }
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
    if (v === 1) return "1 person helped";
    return v + " people helped";
  }

  /* Header counter: last good count cached on-device as a number ("rb_helped_count"). The People helped
   * device code is stored separately ("rb_device_id"; see the top of this file).
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
    if ((lsGet(COUNT_KEY + "_target") || "helped") !== countTarget()) return 0;
    var v = parseInt(lsGet(COUNT_KEY) || "", 10);
    return v > 0 ? v : 0;
  }
  function inBackoff(key) {
    var until = parseInt(lsGet(key || BACKOFF_KEY) || "", 10);
    return until > Date.now();
  }
  function startBackoff(key, ms) { lsSet(key || BACKOFF_KEY, String(Date.now() + (ms || BACKOFF_MS))); }

  /** Exact: page through every record, count distinct device IDs. Partial reads never paint. */
  function countDistinctDevices() {
    var seen = Object.create(null);
    var n = 0;
    var pages = 0;
    function next(cursor) {
      pages += 1;
      if (pages > MAX_PAGES) return Promise.reject(new Error("too many pages"));
      return fetchHitsPage(cursor, helpedUrl()).then(function (body) {
        var recs = (body && body.records) || [];
        for (var i = 0; i < recs.length; i++) {
          var d = recs[i] && recs[i].data ? recs[i].data : recs[i];
          var id = d && typeof d.device === "string" ? d.device : "";
          if (id && !seen[id]) { seen[id] = 1; n += 1; }
        }
        if (body && body.nextCursor) return next(body.nextCursor);
        return n;
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
      wrap.setAttribute("aria-label", formatOpens(v) + " (devices that got food results, counted once each)");
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

  function deviceId() {
    var id = lsGet(DEVICE_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = uuid();
      lsSet(DEVICE_KEY, id);
    }
    return id;
  }

  var helpedInFlight = false;
  var lastExact = null; // exact distinct-device count fetched this page load
  /** Call after a live search/Locate Me returned ≥1 place. Counts this device at most once, ever. */
  function markHelped() {
    var doneKey = HELPED_DONE_KEY + (isSelfTest() ? "_selftest" : "");
    if (helpedInFlight || lsGet(doneKey) === "1" || isTestTraffic() || inBackoff(WRITE_BACKOFF_KEY)) {
      return Promise.resolve(false);
    }
    var id = deviceId();
    if (!lsGet(DEVICE_KEY)) return Promise.resolve(false); // storage blocked: cannot promise once-ever, skip
    helpedInFlight = true;
    return fetch(helpedUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "helped-" + id },
      body: JSON.stringify({ kind: "helped", device: id }),
      keepalive: true,
    }).then(function (res) {
      helpedInFlight = false;
      if (res && res.ok) {
        lsSet(doneKey, "1");
        if (lastExact != null) {
          lastExact += 1; // our new, never-before-counted device ID
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
