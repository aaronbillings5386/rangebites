/**
 * RangeBites — privacy-safe product analytics (session-scoped).
 *
 * NEVER send: lat, lng, place names as location history, coords, addresses,
 * or “near X” sequences. deal_id is an entity id (osm/demo), not a trail.
 *
 * Default event names: Data Analyst snake_case (below).
 *
 * LOCKED default: Data Analyst snake_case only (do NOT also emit Title Case).
 * DISPUTED mapping (held until Analyst + Data Analyst fully align — snake_case wins):
 *   locate_me_requested  ↔  "Locate Me Requested"
 *   locate_me_result     ↔  "Locate Me Result"
 *   radius_changed       ↔  "Radius Changed"
 *   search_completed     ↔  "Search Completed"
 *   deal_impression      ↔  "Deal Impression"
 *   deal_tapped          ↔  "Deal Tapped" / "Deal Viewed"
 *   nav_handoff          ↔  "Nav Handoff" / "Deal Navigated"
 * Additive (snake_case): app_opened, onboarding_completed; account_created no-op until accounts.
 *
 * Target Amplitude project: **855341**. Browser SDK init uses FOOD_RADAR_AMPLITUDE_API_KEY
 * (must be the API key from that project). FOOD_RADAR_AMPLITUDE_PROJECT_ID is documented in config.
 */
(function () {
  "use strict";

  const AMPLITUDE_CDN =
    "https://cdn.amplitude.com/libs/analytics-browser-2.11.1-min.js.gz";

  /** In-memory only — never localStorage / IndexedDB */
  const memoryQueue = [];
  /** Names-only ring for FOOD_RADAR_ANALYTICS_DEBUG verify (never props) */
  const debugNamesLog = [];
  const impressedDeals = Object.create(null);
  const navHandoffDeals = Object.create(null);

  let amplitudeReady = false;
  let amplitudeClient = null;
  let initStarted = false;

  function apiKey() {
    return "";
  }

  function debugOn() {
    if (window.FOOD_RADAR_ANALYTICS_DEBUG) return true;
    try {
      return new URLSearchParams(location.search).get("analytics_debug") === "1";
    } catch (_) {
      return false;
    }
  }

  function paintDebugBeacon() {
    if (!debugOn()) return;
    try {
      const el = document.documentElement;
      el.dataset.frAnalyticsQueue = String(memoryQueue.length);
      el.dataset.frAnalyticsNames = debugNamesLog.join(",");
      el.setAttribute("data-fr-analytics-queue", String(memoryQueue.length));
      el.setAttribute("data-fr-analytics-names", debugNamesLog.join(","));
    } catch (_) {
      /* ignore */
    }
  }

  function debugName(name) {
    // Names only — never props (could leak radii/deal context in shared logs)
    if (debugOn()) {
      debugNamesLog.push(name);
      paintDebugBeacon();
      try {
        console.info("[RangeBites analytics]", name);
      } catch (_) {
        /* ignore */
      }
    }
  }

  function memoryStorage() {
    const store = Object.create(null);
    return {
      isEnabled: function () {
        return true;
      },
      get: function (key) {
        return Promise.resolve(store[key]);
      },
      set: function (key, value) {
        store[key] = value;
        return Promise.resolve(undefined);
      },
      remove: function (key) {
        delete store[key];
        return Promise.resolve(undefined);
      },
      reset: function () {
        Object.keys(store).forEach(function (k) {
          delete store[k];
        });
        return Promise.resolve(undefined);
      },
    };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Amplitude CDN load failed"));
      };
      document.head.appendChild(s);
    });
  }

  function flushQueue() {
    if (!amplitudeReady || !amplitudeClient) return;
    while (memoryQueue.length) {
      const item = memoryQueue.shift();
      try {
        amplitudeClient.track(item.name, item.props);
      } catch (_) {
        /* drop */
      }
    }
  }

  function initAmplitudeIfKeyed() {
    const key = apiKey();
    if (!key || initStarted) return;
    initStarted = true;

    loadScript(AMPLITUDE_CDN)
      .then(function () {
        const amp = window.amplitude;
        if (!amp || typeof amp.init !== "function") {
          throw new Error("Amplitude global missing");
        }
        // Privacy-forward: no autocapture, no cookie/local identity, memory transport buffer
        amp.init(key, {
          autocapture: false,
          defaultTracking: false,
          identityStorage: "none",
          trackingOptions: { ipAddress: false },
          storageProvider: memoryStorage(),
          logLevel: 0,
        });
        amplitudeClient = amp;
        amplitudeReady = true;
        flushQueue();
      })
      .catch(function () {
        // Stay on in-memory queue for the session
        initStarted = false;
      });
  }


  function isAmplitudeKeyed() {
    return !!apiKey();
  }

  /** Lawyer-safe UI copy: banner + About reflect keyed vs memory-queue. */
  function applyPrivacyDisclosure() {
    const keyed = isAmplitudeKeyed();
    const bannerNote = document.getElementById("analyticsBannerNote");
    const about = document.getElementById("analyticsAboutCopy");
    const keyedBanner =
      "Product analytics: Amplitude is enabled for this session. Session events (locate, radius, deals, nav) may leave the browser. Never lat/lng. We do not persist GPS.";
    const unkeyedBanner =
      "Product analytics: optional. No Amplitude key — events stay in a memory queue only (nothing sent).";
    const keyedAbout =
      "Amplitude is enabled. Session events (locate, radius, deals, nav) may go to Amplitude. Never lat/lng. We do not persist GPS.";
    const unkeyedAbout =
      "Optional product analytics. No Amplitude key — events stay in a memory queue only (nothing sent).";
    const noTrack = "We do not track you. Location is used for this search only and is not saved.";
    if (bannerNote) bannerNote.textContent = noTrack;
    if (about) about.textContent = noTrack;
  }

  function track(name, props) {
    return;
    const safeProps = props && typeof props === "object" ? props : {};
    debugName(name);

    if (apiKey()) {
      initAmplitudeIfKeyed();
      if (amplitudeReady && amplitudeClient) {
        try {
          amplitudeClient.track(name, safeProps);
        } catch (_) {
          memoryQueue.push({ name: name, props: safeProps });
        }
        paintDebugBeacon();
        return;
      }
      memoryQueue.push({ name: name, props: safeProps });
      paintDebugBeacon();
      return;
    }

    // No API key: session queue only
    memoryQueue.push({ name: name, props: safeProps });
    paintDebugBeacon();
  }

  function looksCouponLike(deal) {
    if (!deal) return false;
    const blob = ((deal.kind || "") + " " + (deal.label || "") + " " + (deal.detail || "")).toLowerCase();
    return /coupon|%\s*off|bogo|promo|code|disc/.test(blob);
  }

  const RangeBitesAnalytics = {
    isAmplitudeKeyed: isAmplitudeKeyed,
    applyPrivacyDisclosure: applyPrivacyDisclosure,
    /** Boot — no accounts in this MVP */
    appOpened: function () {
      track("app_opened", { has_account: false });
    },
    onboardingCompleted: function (screensSeen) {
      track("onboarding_completed", {
        screens_seen: Number(screensSeen) || 0,
      });
    },
    /** No accounts yet — stub only */
    accountCreated: function () {
      /* no-op stub */
    },
    locateMeRequested: function (source) {
      track("locate_me_requested", {
        source: source === "auto" ? "auto" : "button",
      });
    },
    locateMeResult: function (outcome) {
      const o =
        outcome === "granted" || outcome === "denied" || outcome === "error"
          ? outcome
          : "error";
      track("locate_me_result", { outcome: o });
    },
    radiusChanged: function (radiusMi, priorRadiusMi) {
      const next = Number(radiusMi);
      const prior = Number(priorRadiusMi);
      if (next === prior) return; // no-op chip re-tap
      track("radius_changed", {
        radius_mi: next,
        prior_radius_mi: prior,
      });
    },
    searchCompleted: function (radiusMi, resultCount) {
      track("search_completed", {
        radius_mi: Number(radiusMi),
        result_count: Number(resultCount),
      });
    },
    /** Once per deal_id per session */
    dealImpression: function (dealId, position, radiusMi) {
      if (!dealId || impressedDeals[dealId]) return;
      impressedDeals[dealId] = true;
      track("deal_impression", {
        deal_id: String(dealId),
        position: Number(position),
        radius_mi: Number(radiusMi),
      });
    },
    /**
     * Deal Viewed → deal_tapped (snake_case only).
     * has_coupon: cheap heuristic from deal label/kind.
     */
    dealTapped: function (dealId, position, radiusMi, dealOrHasCoupon) {
      if (!dealId) return;
      let hasCoupon = false;
      if (typeof dealOrHasCoupon === "boolean") hasCoupon = dealOrHasCoupon;
      else if (dealOrHasCoupon && typeof dealOrHasCoupon === "object") {
        hasCoupon = looksCouponLike(dealOrHasCoupon);
      }
      track("deal_tapped", {
        deal_id: String(dealId),
        position: Number(position),
        radius_mi: Number(radiusMi),
        has_coupon: !!hasCoupon,
      });
    },
    /**
     * Deal Navigated → nav_handoff.
     * Props: deal_id, maps_app, radius_mi (no lat/long).
     */
    navHandoff: function (dealId, mapsApp, radiusMi) {
      if (!dealId || navHandoffDeals[dealId]) return;
      const app =
        mapsApp === "apple" || mapsApp === "google" || mapsApp === "other"
          ? mapsApp
          : "other";
      navHandoffDeals[dealId] = true;
      const props = { deal_id: String(dealId), maps_app: app };
      if (radiusMi != null && !Number.isNaN(Number(radiusMi))) {
        props.radius_mi = Number(radiusMi);
      }
      track("nav_handoff", props);
    },
    /** Test/debug helpers — queue length (no key) + names when debug flag on */
    _queueLength: function () {
      return memoryQueue.length;
    },
    _debugEventNames: function () {
      return debugOn() ? debugNamesLog.slice() : [];
    },
  };

  window.RangeBitesAnalytics = RangeBitesAnalytics;

  // Eager init only when a key is present
  if (apiKey()) initAmplitudeIfKeyed();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyPrivacyDisclosure);
  } else {
    applyPrivacyDisclosure();
  }
  if (debugOn()) paintDebugBeacon();
})();
