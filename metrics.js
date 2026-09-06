/**
 * RangeBites — first-party tap counts only.
 * Body is always {"kind": "view"|"locate"|"demo"|"deal"}.
 * Never send location, email, cookies, user-agent, or identifiers in the body.
 */
(function () {
  "use strict";

  var HITS_URL = "./.herenow/data/hits";
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

  function fetchHitsPage(cursor) {
    var url = HITS_URL + "?limit=" + PAGE;
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

  function loadHits(max) {
    var cap = max || CAP;
    var all = [];
    function next(cursor) {
      return fetchHitsPage(cursor).then(function (body) {
        var recs = (body && body.records) || [];
        for (var i = 0; i < recs.length && all.length < cap; i++) all.push(recs[i]);
        var more = body && body.nextCursor;
        if (more && all.length < cap) return next(more);
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
    if (v === 1) return "1 visit proudly served";
    return v + " proudly served";
  }

  function paintVisitCount(n) {
    var num = document.getElementById("visitCountNum");
    var wrap = document.getElementById("visitCount");
    if (!num) return;
    var v = Number(n) || 0;
    num.textContent = String(v);
    if (wrap) wrap.setAttribute("aria-label", formatOpens(v) + " · Stats");
  }

  function refreshVisitCount() {
    var num = document.getElementById("visitCountNum");
    if (!num) return Promise.resolve();
    return loadHits(CAP)
      .then(function (recs) {
        paintVisitCount(tally(recs).view);
      })
      .catch(function () {
        paintVisitCount(0);
      });
  }

  window.RangeBitesMetrics = {
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
    var home = !path || path === "index.html" || path === "";
    var wait = home ? hit("view") : Promise.resolve(false);
    wait.then(function () {
      return refreshVisitCount();
    }).then(function () {
      if (home) setTimeout(refreshVisitCount, 800);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
