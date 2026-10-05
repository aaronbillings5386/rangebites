/**
 * RangeBites stores no visitor information.
 * This file does not count visits, write here.now collections, or keep a session flag.
 * On load it deletes leftover device ids, location keys, and the old found-count cache.
 */
(function () {
  "use strict";

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

  /** Delete leftover location, last-city, and search-history keys. Also drops the old found-count cache. */
  function clearLegacyLocationKeys(localStore, sessionStore) {
    var locationFields = [
      "lastPlaceQuery",
      "lastCity",
      "last_city",
      "searchHistory",
      "lat",
      "lng",
      "latitude",
      "longitude",
      "coords",
      "location"
    ];
    function scrubStoredPrefs(raw) {
      try {
        var p = JSON.parse(raw);
        if (!p || typeof p !== "object" || Array.isArray(p)) return raw;
        var changed = false;
        var n;
        for (n = 0; n < locationFields.length; n++) {
          if (Object.prototype.hasOwnProperty.call(p, locationFields[n])) {
            delete p[locationFields[n]];
            changed = true;
          }
        }
        return changed ? JSON.stringify(p) : raw;
      } catch (_) {
        return raw;
      }
    }
    var named = [
      "rb_last_place",
      "rb_last_city",
      "rb_last_query",
      "lastCity",
      "last_city",
      "lastPlaceQuery",
      "rb_search_history",
      "rb_location",
      "rb_lat",
      "rb_lng",
      "latitude",
      "longitude",
      "rb_coords",
      "geolocation",
      "rb_found_session",
      "rb_found_session_selftest",
      "rb_helped_count",
      "rb_helped_count_target",
      "rb_hits_backoff_until",
      "rb_hits_write_backoff_until",
      "rb_count_fetched",
      "rb_count_target",
      "rb_no_count",
      "rb_visit_count",
      "rb_visit_count_more"
    ];
    var looksLikeLocation = /last.?city|last.?place|last.?query|search.?history|(^|[_-])(lat|lng)([_-]|$)|latitude|longitude|(^|[_-])coords([_-]|$)|(^|[_-])location([_-]|$)|geolocation|location_history/i;
    function wipe(store) {
      if (!store || typeof store.removeItem !== "function") return;
      var i;
      for (i = 0; i < named.length; i++) {
        try { store.removeItem(named[i]); } catch (_) {}
      }
      if (typeof store.length === "number" && typeof store.key === "function") {
        var found = [];
        try {
          for (i = 0; i < store.length; i++) {
            var k = store.key(i);
            if (!k || k === "rb_ui_prefs" || k === "rb_saved" || k === "rb_notice_seen") continue;
            if (looksLikeLocation.test(k)) found.push(k);
          }
        } catch (_) {}
        for (i = 0; i < found.length; i++) {
          try { store.removeItem(found[i]); } catch (_) {}
        }
      }
      if (typeof store.getItem !== "function" || typeof store.setItem !== "function") return;
      try {
        var prefs = store.getItem("rb_ui_prefs");
        if (!prefs) return;
        var next = scrubStoredPrefs(prefs);
        if (next !== prefs) store.setItem("rb_ui_prefs", next);
      } catch (_) {}
    }
    wipe(localStore);
    wipe(sessionStore);
  }

  function clearLegacyLocationDatabases() {
    try {
      if (!window.indexedDB || typeof window.indexedDB.databases !== "function") return;
      window.indexedDB.databases().then(function (list) {
        (list || []).forEach(function (db) {
          var name = db && db.name;
          if (!name) return;
          if (/last.?city|last.?place|search.?history|latitude|longitude|geolocation|location_history|(^|[_-])(lat|lng|coords|location)([_-]|$)/i.test(name)) {
            try { window.indexedDB.deleteDatabase(name); } catch (_) {}
          }
        });
      }).catch(function () {});
    } catch (_) {}
  }

  window.RangeBitesMetrics = {
    clearLegacyLocationKeys: clearLegacyLocationKeys,
  };

  function boot() {
    try { clearLegacyDeviceIds(window.localStorage, window.sessionStorage); } catch (_) {}
    try { clearLegacyLocationKeys(window.localStorage, window.sessionStorage); } catch (_) {}
    clearLegacyLocationDatabases();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
