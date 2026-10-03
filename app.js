/**
 * RangeBites — client-side Overpass + Leaflet
 *
 * Privacy rules (non-negotiable):
 * - NEVER store lat/lng or location history in localStorage, IndexedDB, cookies, or console logs.
 * - rb_ui_prefs: range, walk chip, dietary/filter chips, last city TEXT, units mi/km TEXT, onboard/hero/a2hs flags.
 *   Never coordinates. Do not auto-run Overpass/Nominatim from saved prefs.
 * - rb_saved: osm id + name + address you heart on this device. Never lat/lng. No GPS trail.
 * - Clear now wipes GPS+places only; UI prefs + hearts stay. Do NOT wipe on pagehide — iOS Safari fires it on the GPS sheet, app switch, and Maps.
 * - Locate Me + live OSM Overpass only. No demo map, no fake places, no invented hours/phones.
 * - Same-origin Overpass/Nominatim proxies only (/api/overpass, /api/nominatim). Never mail.ru Overpass (hangs). lz4 is not in the client URL list (504 stall). We do not invent restaurants.
 */
(function () {
  "use strict";

  /* forge 20261003 (Bolt): here.now cannot send X-Frame-Options / CSP frame-ancestors headers and
   * <meta> frame-ancestors is ignored, so refuse to run inside someone else's frame. */
  try {
    if (window.top !== window.self) {
      document.documentElement.style.display = "none";
      window.top.location = window.self.location.href;
      return;
    }
  } catch (_) {
    document.documentElement.style.display = "none";
    return;
  }

  /** Neutral map view until Locate Me — not a fake city of places */
  const MAP_DEFAULT = { lat: 20, lng: 0, zoom: 2 };
  const MAX_RESULTS = 120;
  /** Same-origin Overpass only. Client URL list is /api/overpass only. Never mail.ru. lz4 is not in this list. */
  const OVERPASS_URLS = [
    "/api/overpass",
  ];
  /** Server-side Overpass [timeout:N]; client abort is a little longer. */
  const OVERPASS_TIMEOUT_S = 25;
  const OVERPASS_FAST_TIMEOUT_S = 10;
  /** Client abort: ~22s full radius, ~12s fast inner ring. Do not cut to 6-8s (slow mobile + busy Overpass). */
  const OVERPASS_CLIENT_ABORT_MS = 22000;
  const OVERPASS_FAST_ABORT_MS = 12000;
  /** Progressive search: inner ring first (cards paint fast), then full radius. */
  const FAST_RING_MILES = 3;
  /** Status ping only — button stays Searching until Overpass finishes */
  const OVERPASS_SLOW_MS = 1800;
  const NOMINATIM_URL = "/api/nominatim";
  const MILES_TO_METERS = 1609.344;
  const KM_PER_MILE = 1.60934;
  const MILES_COUNTRY = { us: 1, gb: 1, uk: 1, lr: 1 };
  /** On-device UI prefs only — never lat/lng, places, or location history */
  const UI_PREFS_KEY = "rb_ui_prefs";
  const UI_PREFS_TYPES = { all: 1, restaurant: 1, fast_food: 1, cafe: 1, bar: 1 };
  const UI_PREFS_MILES = { 10: 1, 25: 1, 50: 1 };
  const UI_PREFS_TAGS = { takeaway: 1, delivery: 1, driveThrough: 1, wheelchair: 1, outdoorSeating: 1, restroom: 1, dogsOk: 1, airConditioning: 1, changingTable: 1, smokeFree: 1, kidsArea: 1 };
  const TAG_PLACE_KEY = { takeaway: "takeout", delivery: "delivery", driveThrough: "driveThru", wheelchair: "wheelchair", outdoorSeating: "outdoorSeating", restroom: "restroom", dogsOk: "dogsOk", airConditioning: "airConditioning", changingTable: "changingTable", smokeFree: "smokeFree", kidsArea: "kidsArea" };
  const UI_PREFS_DIET_OSM = { vegan: 1, vegetarian: 1, gluten_free: 1, halal: 1 };
  const CUISINE_CANON = [
    "american", "barbecue", "burger", "pizza", "mexican", "chinese", "thai",
    "japanese", "korean", "vietnamese", "indian", "italian", "greek",
    "mediterranean", "seafood", "sushi", "chicken", "sandwich", "breakfast",
    "diner", "soul_food", "latin", "caribbean", "middle_eastern", "ethiopian",
    "french", "german", "irish", "tex-mex", "ramen", "poke", "vegan", "vegetarian",
  ];
  const CUISINE_ALIASES = {
    bbq: "barbecue", barbeque: "barbecue", burgers: "burger", hamburger: "burger",
    texmex: "tex-mex", tex_mex: "tex-mex", soulfood: "soul_food", "soul-food": "soul_food",
    latin_american: "latin", "latin-american": "latin",
    "middle-eastern": "middle_eastern", middleeastern: "middle_eastern",
    fish: "seafood",
    taco: "mexican", tacos: "mexican", burrito: "mexican",
    coffee: "coffee", coffee_shop: "coffee",
    icecream: "ice_cream", "ice-cream": "ice_cream",
    "fish-and-chips": "fish_and_chips", fishandchips: "fish_and_chips",
    brunch: "breakfast", pancake: "breakfast", pancakes: "breakfast",
    pasta: "italian", curry: "indian",
    doughnut: "donut", donuts: "donut",
    fried_chicken: "chicken", "fried-chicken": "chicken",
    szechuan: "chinese", sichuan: "chinese", szechwan: "chinese", cantonese: "chinese",
    dim_sum: "chinese", dimsum: "chinese", "dim-sum": "chinese",
    gyro: "greek", gyros: "greek", souvlaki: "greek",
    izakaya: "japanese", teriyaki: "japanese", udon: "japanese", sashimi: "sushi",
  };
  /**
   * Food-type chips. Rendered only for categories with ≥1 match in the current search (in-range places).
   * Hidden before Locate/city search. Zero-match chips are omitted, not dimmed. Fixed order; skip missing.
   * Match order: OSM amenity/shop → cuisine tokens → optional diet flags → conservative name hints.
   * Single-select: tap to filter, tap again to clear.
   */
  const FOOD_CATEGORIES = [
    { id: "pizza", label: "Pizza", cuisines: ["pizza"], amenities: [], nameHints: ["pizza", "pizzeria"] },
    { id: "burgers", label: "Burgers", cuisines: ["burger"], amenities: [], nameHints: ["burger", "hamburger"] },
    { id: "mexican", label: "Mexican", cuisines: ["mexican", "tex-mex"], amenities: [], nameHints: ["mexican", "taco", "burrito", "taqueria"] },
    { id: "japanese", label: "Japanese", cuisines: ["japanese", "sushi", "ramen"], amenities: [], nameHints: ["japanese", "sushi", "ramen", "izakaya", "teriyaki", "udon", "sashimi"] },
    { id: "chinese", label: "Chinese", cuisines: ["chinese"], amenities: [], nameHints: ["chinese", "szechuan", "sichuan", "dim sum"] },
    { id: "thai", label: "Thai", cuisines: ["thai"], amenities: [], nameHints: ["thai", "pad thai"] },
    { id: "asian", label: "Asian", cuisines: ["korean", "vietnamese", "asian", "poke", "filipino", "malaysian", "indonesian", "taiwanese"], amenities: [], nameHints: ["korean", "vietnamese", "asian", "pho", "filipino"] },
    { id: "bbq", label: "BBQ", cuisines: ["barbecue"], amenities: [], nameHints: ["bbq", "barbecue", "barbeque"] },
    { id: "seafood", label: "Seafood", cuisines: ["seafood", "sushi", "poke", "fish_and_chips"], amenities: ["seafood"], nameHints: ["seafood", "oyster", "lobster", "fish"] },
    { id: "cafe", label: "Cafe", cuisines: ["coffee"], amenities: ["cafe"], nameHints: ["coffee", "espresso"] },
    { id: "breakfast", label: "Breakfast", cuisines: ["breakfast", "diner"], amenities: [], nameHints: ["breakfast", "brunch", "diner", "pancake"] },
    { id: "healthy", label: "Healthy", cuisines: ["vegan", "vegetarian", "salad", "juice", "smoothie", "poke"], amenities: [], dietAny: true, nameHints: ["salad", "vegan", "juice", "smoothie"] },
    { id: "dessert", label: "Dessert", cuisines: ["ice_cream", "dessert", "gelato", "donut", "pastry", "cake"], amenities: ["ice_cream"], nameHints: ["ice cream", "gelato", "yogurt", "donut", "dessert"] },
    { id: "italian", label: "Italian", cuisines: ["italian"], amenities: [], nameHints: ["italian", "trattoria", "pasta"] },
    { id: "indian", label: "Indian", cuisines: ["indian"], amenities: [], nameHints: ["indian", "tandoor", "curry"] },
    { id: "mediterranean", label: "Mediterranean", cuisines: ["mediterranean", "greek"], amenities: [], nameHints: ["mediterranean", "greek", "gyro", "souvlaki", "taverna"] },
    { id: "american", label: "American", cuisines: ["american"], amenities: [], nameHints: ["american"] },
  ];
  const FOOD_CATEGORY_IDS = {};
  FOOD_CATEGORIES.forEach(function (c) { FOOD_CATEGORY_IDS[c.id] = 1; });
  const FOOD_CATEGORY_FROM_TYPE = { cafe: "cafe", ice_cream: "dessert" };
  /** Hearts: osm id, name, address only — never lat/lng */
  const SAVED_KEY = "rb_saved";
  const SAVED_MAX = 80;

  /** Fixed walking speed for walk-time chips — no routing API */
  const WALK_MPH = 3;
  const WALK_MIN_TO_MILES = {
    5: (5 / 60) * WALK_MPH,   // 0.25 mi
    10: (10 / 60) * WALK_MPH, // 0.5 mi
    15: (15 / 60) * WALK_MPH, // 0.75 mi
  };

  const DIET_OSM_LABEL = {
    vegan: "Vegan",
    vegetarian: "Vegetarian",
    gluten_free: "No gluten",
    halal: "Halal",
  };

  const state = {
    lat: null,
    lng: null,
    radiusMiles: 10,
    places: [],
    loading: false,
    /** Bumps on each runSearch; stale Overpass responses must not rehydrate */
    searchGen: 0,
    /** Dietary chip: veg|coffee|pizza|freefood|null — UI pref, not location */
    dietaryFilter: null,
    /** Active walk chip minutes, or null when using mile chips */
    walkMinutes: null,
    filters: {
      openNow: false,
      hasDeal: false,
      saved: false,
      type: "all",
      takeaway: false,
      delivery: false,
      driveThrough: false,
      wheelchair: false,
      outdoorSeating: false,
      restroom: false,
      dogsOk: false,
      airConditioning: false,
      changingTable: false,
      smokeFree: false,
      kidsArea: false,
      lateNight: false,
      cuisine: null,
      foodCategory: null,
      diet: { vegan: false, vegetarian: false, gluten_free: false, halal: false },
    },
    /** Last Overpass radius in miles — local chips may narrow without a new query */
    fetchedRadiusMiles: null,
    /** Client-side name filter of the current list — never Nominatim */
    nameQuery: "",
    map: null,
    markersLayer: null,
    userMarker: null,
    radiusCircle: null,
    glowTimer: null,
    /** Honest Overpass / geocode error, or null */
    searchError: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /** UI prefs live outside location state so Clear now cannot wipe them */
  const uiPrefs = {
    lastPlaceQuery: "",
    onboardDismissed: false,
    heroTipHidden: false,
    a2hsDismissed: false,
    filtersOpen: false,
    termsAccepted: false,
    units: "mi",
  };

  function looksLikeCoords(s) {
    return /[-+]?\d{1,3}\.\d+\s*[, ]\s*[-+]?\d{1,3}\.\d+/.test(String(s || ""));
  }

  function looksLikePostal(s) {
    const t = String(s || "").trim();
    if (/^\d{4,5}(?:-\d{4})?$/.test(t)) return true;
    if (/^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(t)) return true;
    if (/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/.test(t)) return true;
    return false;
  }

  function sanitizePlaceQuery(raw) {
    let q = typeof raw === "string" ? raw.trim() : "";
    if (q.length > 80) q = q.slice(0, 80);
    if (looksLikeCoords(q)) return "";
    return q;
  }

  function syncLastPlaceControl() {
    const wrap = $("#lastPlaceWrap");
    const btn = $("#lastPlaceBtn");
    if (!wrap || !btn) return;
    const q = sanitizePlaceQuery(uiPrefs.lastPlaceQuery);
    if (!q) {
      wrap.hidden = true;
      btn.textContent = "";
      btn.removeAttribute("data-query");
      return;
    }
    wrap.hidden = false;
    btn.textContent = q;
    btn.setAttribute("data-query", q);
    btn.setAttribute("aria-label", "Search last city: " + q);
  }

  function persistUiPrefs() {
    try {
      const q = sanitizePlaceQuery(uiPrefs.lastPlaceQuery);
      const payload = {
        radiusMiles: state.radiusMiles,
        walkMinutes: state.walkMinutes == null ? null : state.walkMinutes,
        filters: {
          openNow: !!state.filters.openNow,
          hasDeal: !!state.filters.hasDeal,
          saved: !!state.filters.saved,
          type: UI_PREFS_TYPES[state.filters.type] ? state.filters.type : "all",
          takeaway: !!state.filters.takeaway,
          delivery: !!state.filters.delivery,
          driveThrough: !!state.filters.driveThrough,
          wheelchair: !!state.filters.wheelchair,
          outdoorSeating: !!state.filters.outdoorSeating,
          restroom: !!state.filters.restroom,
          dogsOk: !!state.filters.dogsOk,
          airConditioning: !!state.filters.airConditioning,
          changingTable: !!state.filters.changingTable,
          smokeFree: !!state.filters.smokeFree,
          kidsArea: !!state.filters.kidsArea,
          lateNight: !!state.filters.lateNight,
          cuisine: state.filters.cuisine ? String(state.filters.cuisine).slice(0, 40) : null,
          foodCategory: FOOD_CATEGORY_IDS[state.filters.foodCategory] ? state.filters.foodCategory : null,
          diet: {
            vegan: !!(state.filters.diet && state.filters.diet.vegan),
            vegetarian: !!(state.filters.diet && state.filters.diet.vegetarian),
            gluten_free: !!(state.filters.diet && state.filters.diet.gluten_free),
            halal: !!(state.filters.diet && state.filters.diet.halal),
          },
        },
        lastPlaceQuery: q,
        units: uiPrefs.units === "km" ? "km" : "mi",
        onboardDismissed: !!uiPrefs.onboardDismissed,
        heroTipHidden: !!uiPrefs.heroTipHidden,
        a2hsDismissed: !!uiPrefs.a2hsDismissed,
        termsAccepted: !!uiPrefs.termsAccepted,
      };
      delete payload.lat;
      delete payload.lng;
      delete payload.latitude;
      delete payload.longitude;
      delete payload.coords;
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify(payload));
    } catch (_) {
      /* private mode — ok */
    }
  }

  function readUiPrefs() {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object" || Array.isArray(p)) return null;
      return p;
    } catch (_) {
      return null;
    }
  }

  function applyUiPrefs() {
    const p = readUiPrefs();
    if (!p) return;
    const walk = p.walkMinutes == null || p.walkMinutes === "" ? null : Number(p.walkMinutes);
    if (walk != null && WALK_MIN_TO_MILES[walk] != null) {
      state.walkMinutes = walk;
      state.radiusMiles = WALK_MIN_TO_MILES[walk];
    } else {
      state.walkMinutes = null;
      const mi = Number(p.radiusMiles);
      state.radiusMiles = UI_PREFS_MILES[mi] ? mi : 10;
    }
    state.dietaryFilter = null;
    const f = p.filters && typeof p.filters === "object" ? p.filters : {};
    state.filters.openNow = false;
    state.filters.hasDeal = !!f.hasDeal;
    state.filters.saved = !!f.saved;
    state.filters.type = UI_PREFS_TYPES[f.type] ? f.type : "all";
    state.filters.takeaway = !!f.takeaway;
    state.filters.delivery = !!f.delivery;
    state.filters.driveThrough = !!f.driveThrough;
    state.filters.wheelchair = !!f.wheelchair;
    state.filters.outdoorSeating = !!f.outdoorSeating;
    state.filters.restroom = !!f.restroom;
    state.filters.dogsOk = !!f.dogsOk;
    state.filters.airConditioning = !!f.airConditioning;
    state.filters.changingTable = !!f.changingTable;
    state.filters.smokeFree = !!f.smokeFree;
    state.filters.kidsArea = !!f.kidsArea;
    state.filters.lateNight = !!f.lateNight;
    const cuis = typeof f.cuisine === "string" ? f.cuisine.trim().toLowerCase().slice(0, 40) : "";
    state.filters.cuisine = cuis || null;
    const catRaw = typeof f.foodCategory === "string" ? f.foodCategory.trim().toLowerCase() : "";
    if (FOOD_CATEGORY_IDS[catRaw]) {
      state.filters.foodCategory = catRaw;
    } else if (FOOD_CATEGORY_FROM_TYPE[state.filters.type]) {
      state.filters.foodCategory = FOOD_CATEGORY_FROM_TYPE[state.filters.type];
      state.filters.type = "all";
    } else {
      state.filters.foodCategory = null;
    }
    const d = f.diet && typeof f.diet === "object" ? f.diet : {};
    state.filters.diet = {
      vegan: !!d.vegan,
      vegetarian: !!d.vegetarian,
      gluten_free: !!d.gluten_free,
      halal: !!d.halal,
    };
    const q = sanitizePlaceQuery(p.lastPlaceQuery);
    uiPrefs.lastPlaceQuery = q;
    uiPrefs.units = p.units === "km" ? "km" : "mi";
    uiPrefs.onboardDismissed = !!p.onboardDismissed;
    uiPrefs.heroTipHidden = !!p.heroTipHidden;
    uiPrefs.a2hsDismissed = !!p.a2hsDismissed;
    uiPrefs.termsAccepted = !!p.termsAccepted;
    uiPrefs.filtersOpen = false;
    const input = $("#placeSearch");
    if (input && q) input.value = q;
    syncLastPlaceControl();
    const dealBtn = $("#filterDeal");
    if (dealBtn) dealBtn.classList.toggle("active", state.filters.hasDeal);
    const openBtn = $("#filterOpen");
    if (openBtn) {
      openBtn.hidden = false;
      openBtn.classList.toggle("active", state.filters.openNow);
      openBtn.setAttribute("aria-pressed", state.filters.openNow ? "true" : "false");
    }
    const openFirst = $("#openNowFirst");
    if (openFirst) {
      openFirst.classList.toggle("active", state.filters.openNow);
      openFirst.setAttribute("aria-pressed", state.filters.openNow ? "true" : "false");
    }
    setToggleState($("#filterSaved"), state.filters.saved);
    setToggleState($("#filterLateNight"), !!state.filters.lateNight);
    const typeSel = $("#filterType");
    if (typeSel) typeSel.value = state.filters.type;
    renderFoodCategoryChips();
    $$("[data-tag]").forEach((btn) => {
      const key = btn.getAttribute("data-tag");
      if (UI_PREFS_TAGS[key]) btn.classList.toggle("active", !!state.filters[key]);
    });
    syncUnitsChipsUI();
    syncRadiusChipLabels();
  }

  function analytics() {
    // Information app: no product analytics, no user tracking.
    return null;
  }

  function metricsHit(_kind) {
    // No tap logging. Aaron: do not track.
  }

  function dealListPosition(placeId) {
    const list = filteredPlaces();
    const idx = list.findIndex((p) => p.id === placeId);
    return idx >= 0 ? idx : 0;
  }

  function milesToMeters(mi) {
    return mi * MILES_TO_METERS;
  }

  function haversineMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.7613;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function unitsAreKm() {
    return uiPrefs.units === "km";
  }

  function formatMiles(mi) {
    const n = Number(mi);
    if (unitsAreKm()) {
      const km = n * KM_PER_MILE;
      if (km < 0.1) return "< 0.1 km";
      if (km < 10) return km.toFixed(1) + " km";
      return Math.round(km) + " km";
    }
    if (n < 0.1) return "< 0.1 mi";
    if (n < 10) return n.toFixed(1) + " mi";
    return Math.round(n) + " mi";
  }

  function formatRadiusChipLabel(mi) {
    const n = Number(mi);
    if (unitsAreKm()) return Math.round(n * KM_PER_MILE) + " km";
    return n + " mi";
  }

  function milesCountryFromHit(hit) {
    if (!hit) return true;
    const code = String(
      (hit.address && hit.address.country_code) || hit.country_code || ""
    ).toLowerCase();
    if (MILES_COUNTRY[code]) return true;
    if (code) return false;
    const dn = String(hit.display_name || hit.label || "").toLowerCase();
    if (/\b(united states|usa|u\.s\.a\.?|u\.s\.)\b/.test(dn)) return true;
    if (/\b(united kingdom|great britain|england|scotland|wales|northern ireland)\b/.test(dn)) return true;
    if (/\bliberia\b/.test(dn)) return true;
    if (/(^|,\s*)(us|usa|uk|gb|lr)(\s*,|$)/i.test(dn)) return true;
    return false;
  }

  function syncUnitsChipsUI() {
    $$(".chip[data-units]").forEach((c) => {
      c.classList.toggle("active", c.getAttribute("data-units") === (uiPrefs.units === "km" ? "km" : "mi"));
    });
  }

  function syncRadiusChipLabels() {
    $$(".chip[data-radius]").forEach((c) => {
      const mi = Number(c.dataset.radius);
      if (!Number.isFinite(mi)) return;
      c.textContent = formatRadiusChipLabel(mi);
    });
  }

  function setDistanceUnits(u, { persist, rerender } = {}) {
    uiPrefs.units = u === "km" ? "km" : "mi";
    syncUnitsChipsUI();
    syncRadiusChipLabels();
    if (persist !== false) persistUiPrefs();
    if (rerender !== false && state.places && state.places.length) {
      renderList();
      renderMarkers(filteredPlaces());
    }
  }

  function applyUnitsFromGeocode(hit) {
    try {
      hoursCountry = String((hit && hit.address && hit.address.country_code) || (hit && hit.country_code) || "").toLowerCase();
    } catch (_) { hoursCountry = ""; }
    setDistanceUnits(milesCountryFromHit(hit) ? "mi" : "km", { persist: true, rerender: false });
  }

  /** Nearest first (straight-line haversine from the search center or GPS). Ties by name. */
  function sortNearestFirst(list) {
    return list.slice().sort((a, b) => (a.miles - b.miles) || String(a.name).localeCompare(String(b.name)));
  }

  function osmDietTagged(tags, key) {
    const v = String((tags && tags["diet:" + key]) || "").toLowerCase();
    return v === "yes" || v === "only" || v === "limited";
  }

  function placeMatchesDietOsm(p) {
    const d = state.filters.diet || {};
    if (d.vegan && !p.dietVegan) return false;
    if (d.vegetarian && !p.dietVegetarian) return false;
    if (d.gluten_free && !p.dietGlutenFree) return false;
    if (d.halal && !p.dietHalal) return false;
    return true;
  }

  function canonCuisine(raw) {
    const t = String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!t) return "";
    if (CUISINE_ALIASES[t]) return CUISINE_ALIASES[t];
    if (CUISINE_CANON.indexOf(t) >= 0) return t;
    return t;
  }

  function cuisineLabel(token) {
    return prettyOsmValue(token);
  }

  /* forge 20261003: readable OSM values. coffee_shop -> "Coffee shop"; small map for common cuisines. */
  const OSM_VALUE_LABELS = {
    bbq: "BBQ", barbecue: "Barbecue", burger: "Burgers", pizza: "Pizza", sandwich: "Sandwiches",
    chicken: "Chicken", fried_chicken: "Fried chicken", coffee_shop: "Coffee shop", ice_cream: "Ice cream",
    donut: "Doughnuts", sushi: "Sushi", tex_mex: "Tex-Mex", american: "American", mexican: "Mexican",
    italian: "Italian", chinese: "Chinese", japanese: "Japanese", thai: "Thai", indian: "Indian",
    vietnamese: "Vietnamese", korean: "Korean", greek: "Greek", seafood: "Seafood", steak_house: "Steakhouse",
    breakfast: "Breakfast", brunch: "Brunch", kebab: "Kebab", noodle: "Noodles", ramen: "Ramen",
    hot_dog: "Hot dogs", bagel: "Bagels", juice: "Juice", bubble_tea: "Bubble tea", tea: "Tea",
    regional: "Regional", diner: "Diner", southern: "Southern", soul_food: "Soul food", cajun: "Cajun",
    mediterranean: "Mediterranean", middle_eastern: "Middle Eastern", french: "French", german: "German",
  };
  function prettyOsmValue(v) {
    const raw = String(v == null ? "" : v).trim();
    if (!raw) return "";
    const key = raw.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(OSM_VALUE_LABELS, key)) return OSM_VALUE_LABELS[key];
    const spaced = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    // Only capitalize all-lowercase OSM tokens; keep names someone typed with their own casing.
    if (spaced !== spaced.toLowerCase()) return spaced;
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
  function prettyCuisineList(c) {
    const seen = {};
    return String(c || "").split(/[;,]/).map((t) => prettyOsmValue(t)).filter((t) => {
      if (!t || seen[t.toLowerCase()]) return false;
      seen[t.toLowerCase()] = 1; return true;
    }).join(", ");
  }
  /** Display-only phone formatting. The tel: href is built separately from the raw digits. */
  function formatPhoneDisplay(phone) {
    const raw = String(phone || "").split(/[;,]/)[0].trim();
    if (!raw) return "";
    const d = raw.replace(/\D/g, "");
    const nanp = d.length === 11 && d.charAt(0) === "1" ? d.slice(1) : (d.length === 10 && !/^\+/.test(raw) ? d : "");
    if (nanp && /^[2-9]\d{2}[2-9]\d{6}$/.test(nanp)) {
      return "(" + nanp.slice(0, 3) + ") " + nanp.slice(3, 6) + "-" + nanp.slice(6);
    }
    return raw.replace(/\s+/g, " ");
  }

  function cuisineIconSvg(token) {
    const svg = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const inner = {
      american: '<path d="M4 14h16"/><path d="M6 10h12"/><path d="M7 7c3-3 7-3 10 0"/>',
      barbecue: '<path d="M8 14c0 4 8 4 8 0"/><path d="M9 10c.5-2 1-4 3-5"/><path d="M15 10c-.5-2-1-4-3-5"/><path d="M8 14h8"/>',
      burger: '<path d="M5 13h14"/><path d="M4 17h16"/><path d="M6 9c2-3 10-3 12 0"/>',
      pizza: '<path d="M12 3 L21 20 H3 Z"/><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/><circle cx="9.5" cy="15" r="0.8" fill="currentColor" stroke="none"/>',
      mexican: '<path d="M4 16c4-8 12-8 16 0"/><path d="M7 16h10"/><path d="M12 8v3"/>',
      chinese: '<path d="M7 10h10v8H7z"/><path d="M5 8h14"/><path d="M9 6l-2 2"/><path d="M17 6l2 2"/>',
      thai: '<path d="M12 5c2 3 2 6 0 8s-4 2-4-1 2-4 4-7z"/><path d="M12 13v6"/>',
      japanese: '<ellipse cx="12" cy="14" rx="7" ry="4"/><path d="M8 14c1-3 7-3 8 0"/>',
      korean: '<path d="M6 14h12v4H6z"/><path d="M8 14V9h8v5"/><path d="M12 9V6"/>',
      vietnamese: '<path d="M5 16h14l-2 4H7z"/><path d="M7 16c1-5 9-5 10 0"/>',
      indian: '<path d="M12 4v2"/><path d="M8 10c0-3 8-3 8 0v8H8z"/>',
      italian: '<path d="M7 8c4 2 6 2 10 0"/><path d="M7 12c4 2 6 2 10 0"/><path d="M7 16c4 2 6 2 10 0"/>',
      greek: '<path d="M6 8h12"/><path d="M8 8v10"/><path d="M16 8v10"/><path d="M6 18h12"/>',
      mediterranean: '<circle cx="12" cy="12" r="4"/><path d="M12 4v2"/><path d="M12 18v2"/><path d="M4 12h2"/><path d="M18 12h2"/>',
      seafood: '<path d="M4 12c6-6 12-4 16 0-4 4-10 6-16 0z"/><circle cx="8" cy="11" r="0.8" fill="currentColor" stroke="none"/>',
      sushi: '<ellipse cx="12" cy="12" rx="8" ry="4"/><path d="M8 12c1-2 7-2 8 0"/>',
      chicken: '<path d="M15 8c2 0 4 2 4 4s-3 5-7 5-6-2-6-5 2-5 5-5h4z"/><circle cx="16" cy="9" r="0.7" fill="currentColor" stroke="none"/>',
      sandwich: '<path d="M5 9h14l-1 4H6z"/><path d="M5 15h14"/><path d="M6 9V7h12v2"/>',
      breakfast: '<circle cx="12" cy="13" r="5"/><path d="M12 4v2"/><path d="M6 7l1.2 1.2"/><path d="M18 7l-1.2 1.2"/>',
      diner: '<path d="M8 7v10"/><path d="M8 11h5a3 3 0 0 1 0 6H8"/>',
      soul_food: '<path d="M6 14h12c0 4-3 5-6 5s-6-1-6-5z"/><path d="M9 10c1-3 5-3 6 0"/>',
      latin: '<path d="M8 7c4 1 4 5 0 8"/><path d="M12 5c4 2 5 7 1 11"/>',
      caribbean: '<path d="M12 20V10"/><path d="M12 10c-4-1-6-4-6-4 2 0 5 1 6 4"/><path d="M12 10c4-1 6-4 6-4-2 0-5 1-6 4"/>',
      middle_eastern: '<path d="M12 6c4 2 6 6 4 10H8c-2-4 0-8 4-10z"/>',
      ethiopian: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
      french: '<path d="M5 16c3-8 11-8 14 0"/><path d="M7 16h10"/>',
      german: '<path d="M8 14c-2 0-3-3-1-5 4-1 8 3 10 1 2 1 1 5-2 5H8z"/><path d="M10 9c0-2 4-2 4 0"/>',
      irish: '<path d="M12 20s-6-5-6-9a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 9-6 9z"/>',
      "tex-mex": '<path d="M12 4l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"/>',
      ramen: '<path d="M5 13h14"/><path d="M6 13c0 5 12 5 12 0"/><path d="M8 10c2 1 6 1 8 0"/>',
      poke: '<ellipse cx="12" cy="14" rx="7" ry="4"/><path d="M7 14c1-3 9-3 10 0"/>',
      vegan: '<path d="M5 19c8-2 10-10 11-15-6 2-11 8-11 15z"/><path d="M7 12c3 1 6 4 7 7"/>',
      vegetarian: '<path d="M12 4c3 4 4 8 0 16"/><path d="M12 10c-4 2-6 6-6 9"/><path d="M12 10c4 2 6 6 6 9"/>',
    };
    return "<svg " + svg + ">" + (inner[token] || inner.american) + "</svg>";
  }

  function foodCategoryById(id) {
    const key = String(id || "");
    for (let i = 0; i < FOOD_CATEGORIES.length; i++) {
      if (FOOD_CATEGORIES[i].id === key) return FOOD_CATEGORIES[i];
    }
    return null;
  }

  function foodCategoryIconSvg(id) {
    const tokenMap = {
      pizza: "pizza",
      burgers: "burger",
      mexican: "mexican",
      japanese: "sushi",
      chinese: "chinese",
      thai: "thai",
      asian: "ramen",
      bbq: "barbecue",
      seafood: "seafood",
      cafe: "breakfast",
      breakfast: "breakfast",
      healthy: "vegetarian",
      dessert: "ice_cream",
      italian: "italian",
      indian: "indian",
      mediterranean: "mediterranean",
      american: "american",
    };
    if (id === "dessert") {
      const svg = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
      return "<svg " + svg + '><path d="M12 3c2 2 3 4 3 6a3 3 0 1 1-6 0c0-2 1-4 3-6z"/><path d="M8 15c0 3 8 3 8 0"/><path d="M9 15h6"/></svg>';
    }
    if (id === "cafe") {
      const svg = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
      return "<svg " + svg + '><path d="M6 9h10v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V9z"/><path d="M16 11h2a2 2 0 1 1 0 4h-2"/><path d="M9 5c.4 1 .4 2 0 3"/><path d="M12 5c.4 1 .4 2 0 3"/></svg>';
    }
    return cuisineIconSvg(tokenMap[id] || "american");
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function nameHasFoodHint(name, hint) {
    const n = String(name || "").toLowerCase();
    const h = String(hint || "").toLowerCase().trim();
    if (!n || !h) return false;
    if (h.indexOf(" ") >= 0) return n.indexOf(h) >= 0;
    return new RegExp("(^|[^a-z0-9])" + escapeRegExp(h) + "([^a-z0-9]|$)", "i").test(n);
  }

  function placeMatchesFoodCategory(p, cat) {
    if (!p || !cat) return false;
    const amenity = String(p.amenity || "").toLowerCase();
    if (cat.amenities && cat.amenities.indexOf(amenity) >= 0) return true;
    const tokens = cuisineTokens(p).map(canonCuisine);
    const want = cat.cuisines || [];
    for (let i = 0; i < tokens.length; i++) {
      if (want.indexOf(tokens[i]) >= 0) return true;
    }
    if (cat.dietAny && (p.dietVegan || p.dietVegetarian)) return true;
    const hints = cat.nameHints || [];
    for (let i = 0; i < hints.length; i++) {
      if (nameHasFoodHint(p.name, hints[i])) return true;
    }
    return false;
  }

  function foodCategoryMatchCount(cat) {
    const places = state.places || [];
    let n = 0;
    for (let i = 0; i < places.length; i++) {
      const p = places[i];
      if (p.miles > state.radiusMiles + 0.05) continue;
      if (placeMatchesFoodCategory(p, cat)) n += 1;
    }
    return n;
  }

  function setFoodCategory(id) {
    const next = FOOD_CATEGORY_IDS[id] ? id : null;
    const cur = FOOD_CATEGORY_IDS[state.filters.foodCategory] ? state.filters.foodCategory : null;
    state.filters.foodCategory = cur === next ? null : next;
    if (state.filters.foodCategory) {
      state.filters.cuisine = null;
      state.filters.type = "all";
      const typeSel = $("#filterType");
      if (typeSel) typeSel.value = "all";
    }
    persistUiPrefs();
    renderList();
    const cat = foodCategoryById(state.filters.foodCategory);
    if (!state.lat) {
      setStatus("Tap Locate Me, or search any city. Any type of food.");
      return;
    }
    const n = filteredPlaces().length;
    setStatus(cat ? n + " " + cat.label.toLowerCase() + " places" : n + " restaurants after filters");
  }



  function syncTrustStrip() {
    const el = $("#trustStrip");
    if (!el) return;
    const show = state.lat != null;
    el.hidden = !show;
  }

  function syncRadiusChipsUI() {
    $$(".chip[data-radius]").forEach((c) => {
      const mi = Number(c.dataset.radius);
      const active =
        state.walkMinutes == null && Math.abs(mi - state.radiusMiles) < 0.001;
      c.classList.toggle("active", active);
    });
    $$(".chip-walk").forEach((c) => {
      const m = Number(c.dataset.walkMin);
      c.classList.toggle("active", state.walkMinutes === m);
    });
  }

  function syncDietChipsUI() {
    $$("#dietChips [data-diet]").forEach((c) => {
      const key = c.dataset.diet;
      c.classList.toggle("active", !!(state.filters.diet && state.filters.diet[key]));
    });
  }

  function setRadiusMiles(mi, { fromWalk, walkMin, track, persist } = {}) {
    const prior = state.radiusMiles;
    state.radiusMiles = mi;
    if (fromWalk) state.walkMinutes = walkMin;
    else state.walkMinutes = null;
    syncRadiusChipsUI();
    if (persist !== false) persistUiPrefs();
    if (track !== false && analytics()) {
      analytics().radiusChanged(mi, prior);
    }
  }

  function amenityLabel(a) {
    const labels = {
      restaurant: "Restaurant",
      fast_food: "Fast food",
      cafe: "Café",
      bar: "Bar",
      pub: "Pub",
      biergarten: "Beer garden",
      ice_cream: "Ice cream",
      food_court: "Food court",
      canteen: "Canteen",
      bakery: "Bakery",
      pastry: "Bakery",
      deli: "Deli",
      seafood: "Seafood",
      butcher: "Butcher",
      food_bank: "Food bank",
      food_pantry: "Food bank",
      soup_kitchen: "Soup kitchen",
      social_facility: "Food bank",
    };
    return labels[a] || "Food";
  }

  /** OSM tags only. Never invent a pantry from a restaurant name. */
  function isTaggedFreeFood(tags) {
    if (!tags) return false;
    // Only amenity=food_bank|soup_kitchen (what the Overpass query asks for). No social_facility/office relabels.
    const amenity = String(tags.amenity || "").toLowerCase();
    return amenity === "food_bank" || amenity === "soup_kitchen";
  }

  const OSM_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];


  /** Permanently closed OSM tags only. Missing hours is not closed. */
  function isPermanentlyClosed(tags) {
    if (!tags) return false;
    const oh = String(tags.opening_hours || "").trim().toLowerCase();
    if (oh === "closed" || oh === "off") return true;
    // end_date (lifecycle) already passed → gone. Only full ISO dates/years; anything fuzzy is ignored.
    const end = String(tags.end_date || "").trim();
    if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(end)) {
      const parts = end.split("-").map(Number);
      const endMs = new Date(parts[0], parts[1] ? parts[1] - 1 : 11, parts[2] || (parts[1] ? 28 : 31)).getTime();
      if (endMs < Date.now()) return true;
    }
    const yes = (v) => String(v || "").toLowerCase() === "yes";
    if (yes(tags.disused) || yes(tags.abandoned) || yes(tags.closed) || yes(tags.permanently_closed) || yes(tags.demolished)) return true;
    if (String(tags.shop || "").toLowerCase() === "vacant") return true;
    for (const k of Object.keys(tags)) {
      // Lifecycle prefixes: disused:amenity, was:amenity, abandoned:shop, closed:*, removed:* …
      if (/^(disused|abandoned|was|closed|removed|razed|demolished|destroyed|former):/i.test(k)) return true;
    }
    return false;
  }


  function parseMinutes(s) {
    const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = +m[1];
    const mm = +m[2];
    if (hh > 24 || mm > 59 || (hh === 24 && mm !== 0)) return null;
    return hh * 60 + mm;
  }

  function expandOsmDays(spec) {
    const out = new Set();
    for (const piece of String(spec).split(",")) {
      const p = piece.trim();
      if (!p) continue;
      const range = p.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
      if (range) {
        const a = range[1][0].toUpperCase() + range[1][1].toLowerCase();
        const b = range[2][0].toUpperCase() + range[2][1].toLowerCase();
        const ia = OSM_DAYS.indexOf(a);
        const ib = OSM_DAYS.indexOf(b);
        if (ia < 0 || ib < 0) continue;
        let i = ia;
        for (let n = 0; n < 7; n++) {
          out.add(OSM_DAYS[i]);
          if (i === ib) break;
          i = (i + 1) % 7;
        }
        continue;
      }
      const one = p.match(/^([A-Za-z]{2})$/);
      if (one) {
        const d = one[1][0].toUpperCase() + one[1][1].toLowerCase();
        if (OSM_DAYS.includes(d)) out.add(d);
      }
    }
    return out;
  }

  function minutesInSpan(nowMin, start, end) {
    if (start == null || end == null || start === end) return false;
    if (end > start) return nowMin >= start && nowMin < end;
    return nowMin >= start || nowMin < end;
  }


  /** Civil clock at a longitude. Device TZ when lng is unused. Never stores GPS. */
  function nowAtLng(lng) {
    const n = Number(lng);
    if (!Number.isFinite(n)) return new Date();
    const crudeHours = Math.round(n / 15);
    const deviceHours = -Math.round(new Date().getTimezoneOffset() / 60);
    if (Math.abs(crudeHours - deviceHours) <= 1) return new Date();
    const utcMs = Date.now();
    const offsetMs = crudeHours * 3600000;
    return new Date(utcMs + offsetMs + new Date().getTimezoneOffset() * 60000);
  }




  /** Wall clock for open-now math. Eastern band (VA/WV/KY/TN east of ~87.6°W) uses
   * America/New_York via Intl (DST-correct, independent of the device's own zone).
   * Elsewhere falls back to nowAtLng. Returns a Date whose local getters read that wall clock. */
  const HOURS_TZ = "America/New_York";
  let hoursTzFmt = null;
  function placeNow(lng) {
    const n = Number(lng);
    if (Number.isFinite(n) && n < -87.6) return nowAtLng(n);
    try {
      hoursTzFmt = hoursTzFmt || new Intl.DateTimeFormat("en-US", {
        timeZone: HOURS_TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
        hour: "numeric", minute: "numeric", second: "numeric",
      });
      const parts = {};
      for (const x of hoursTzFmt.formatToParts(new Date())) parts[x.type] = x.value;
      const d = new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
      return Number.isFinite(d.getTime()) ? d : nowAtLng(lng);
    } catch (_) {
      return nowAtLng(lng);
    }
  }

  /* ---------- OSM opening_hours (strict subset, OSM rule semantics) ----------
   * Supports: 24/7; weekday lists/ranges (Mo-Fr,Su); PH (US federal holidays, computed); "off"/"closed";
   * multiple time spans; overnight spans (18:00-02:00, 22:00-26:00) spilling into the next day;
   * ";" rules override earlier rules for the days they name; ", Sa ..." additional rules add to them;
   * days not named by any rule are closed. Anything else (months, dates, weeks, SH, sunrise, comments,
   * "||", open-ended "+", "open"/"unknown") → null so the card says "Hours not listed" — never "Open".
   * Time is the device's local clock (nowAtLng for far-away searches). Cross-checked vs opening_hours.js. */
  const OH_DAY_IDX = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
  const ohCache = new Map();
  let hoursCountry = ""; // ISO country from the last geocode; "" when unknown (Locate Me)

  function ohParseTime(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const h = +m[1], mm = +m[2];
    if (mm > 59 || h > 48 || (h === 48 && mm)) return null;
    return h * 60 + mm;
  }

  /** Parse one rule body into { days:Set<0-6>, ph:boolean, spans:[[s,e]], off:boolean } or null. */
  function ohParseSelectorAndTimes(body) {
    let rest = body.trim();
    const days = new Set();
    let ph = false;
    let hadSelector = false;
    const selM = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?))*)(?=\s|$|:)/.exec(rest);
    if (selM) {
      hadSelector = true;
      for (const piece of selM[1].split(",")) {
        const p = piece.trim();
        if (p === "PH") { ph = true; continue; }
        const r = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(p);
        if (!r) return null;
        const a = OH_DAY_IDX[r[1]];
        const b = r[2] ? OH_DAY_IDX[r[2]] : a;
        for (let i = a, n = 0; n < 7; n++, i = (i + 1) % 7) { days.add(i); if (i === b) break; }
      }
      rest = rest.slice(selM[0].length).trim();
      if (rest.startsWith(":")) rest = rest.slice(1).trim(); // "Mo-Fr: 09:00-17:00"
    }
    if (!hadSelector) for (let i = 0; i < 7; i++) days.add(i);
    if (/^(off|closed)$/i.test(rest)) return { days, ph, spans: [], off: true };
    if (!rest) return null; // "Mo-Fr" with no times: not supported
    const spans = [];
    for (const piece of rest.split(",")) {
      const t = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(piece.trim());
      if (!t) return null;
      const s = ohParseTime(t[1]);
      let e = ohParseTime(t[2]);
      if (s == null || e == null || s >= 1440) return null;
      if (e <= s) e += 1440; // overnight
      if (e - s > 1440) return null;
      spans.push([s, e]);
    }
    return { days, ph, spans, off: false };
  }

  /** Parse full opening_hours → array of rules, or null if any part is unsupported. Cached. */
  function ohParse(hours) {
    const raw = String(hours || "").trim();
    if (!raw) return null;
    if (ohCache.has(raw)) return ohCache.get(raw);
    let rules = [];
    let ok = true;
    const normal = raw.split(";").map((r) => r.trim()).filter(Boolean);
    if (!normal.length || /\|\||"|\+|\[|\]/.test(raw)) ok = false;
    for (const part of ok ? normal : []) {
      if (/^24\/7$/.test(part)) {
        rules.push({ additional: false, days: new Set([0, 1, 2, 3, 4, 5, 6]), ph: false, spans: [[0, 1440]], off: false, allDays: true });
        continue;
      }
      // Split "Mo-Fr 08:00-17:00, Sa 09:00-12:00" into additional rules at ", <weekday|PH>"
      const chunks = part.split(/,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/);
      // Re-join chunks that were day lists ("Mo,We 10:00-12:00" split into "Mo" + "We 10:00-12:00")
      const merged = [];
      for (const c of chunks) {
        if (merged.length && /^(?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+$/.test(merged[merged.length - 1])) {
          merged[merged.length - 1] += "," + c;
        } else merged.push(c);
      }
      for (let i = 0; i < merged.length; i++) {
        const r = ohParseSelectorAndTimes(merged[i]);
        if (!r) { ok = false; break; }
        r.additional = i > 0;
        rules.push(r);
      }
      if (!ok) break;
    }
    const out = ok && rules.length ? rules : null;
    ohCache.set(raw, out);
    return out;
  }

  function nthWeekday(y, m, wd, n) { // n>=1 nth, n=-1 last
    if (n > 0) { const d = new Date(y, m, 1); return 1 + ((wd - d.getDay() + 7) % 7) + (n - 1) * 7; }
    const last = new Date(y, m + 1, 0); return last.getDate() - ((last.getDay() - wd + 7) % 7);
  }
  /** US federal holidays (observed dates), computed — no data file. */
  function isUsFederalHoliday(date) {
    const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    const fixed = [[0, 1], [5, 19], [6, 4], [10, 11], [11, 25]];
    for (const [fm, fd] of fixed) {
      for (const yy of [y - 1, y, y + 1]) {
        const h = new Date(yy, fm, fd); const wd = h.getDay();
        if (yy === y && fm === m && fd === d) return true; // the holiday itself
        const obs = new Date(yy, fm, fd + (wd === 6 ? -1 : wd === 0 ? 1 : 0)); // observed weekday
        if (obs.getFullYear() === y && obs.getMonth() === m && obs.getDate() === d) return true;
      }
    }
    const floating = [[0, 1, 3], [1, 1, 3], [4, 1, -1], [8, 1, 1], [9, 1, 2], [10, 4, 4]];
    for (const [fm, wd, n] of floating) if (m === fm && d === nthWeekday(y, fm, wd, n)) return true;
    return false;
  }
  function ohIsHoliday(date, lat, lng) {
    const cc = String(hoursCountry || "").toLowerCase();
    const inUs = cc ? cc === "us" : (Number(lat) > 18 && Number(lat) < 72 && Number(lng) < -64 && Number(lng) > -180);
    return inUs && isUsFederalHoliday(date);
  }

  /** Spans for one calendar day (minutes from that day's 00:00; may exceed 1440). */
  function ohDaySpans(rules, date, lat, lng) {
    const wd = date.getDay();
    const hol = rules.some((r) => r.ph) && ohIsHoliday(date, lat, lng);
    let spans = [];
    let idx = -1;
    rules.forEach((r, i) => {
      const hits = (r.ph && hol) || r.days.has(wd);
      if (!hits) return;
      idx = i;
      if (r.off) { spans = []; return; }
      spans = r.additional ? spans.concat(r.spans) : r.spans.slice();
    });
    return { spans, idx };
  }

  /** Open intervals as absolute minutes relative to `now`'s local midnight, covering yesterday..+7 days. */
  function ohIntervals(rules, now, lat, lng) {
    const out = [];
    const days = [];
    for (let off = -1; off <= 8; off++) {
      days.push(ohDaySpans(rules, new Date(now.getFullYear(), now.getMonth(), now.getDate() + off, 12), lat, lng));
    }
    for (let k = 0; k < days.length - 1; k++) {
      const off = k - 1;
      // Past-midnight part spills into the next day unless a later rule re-defined that next day.
      const spillOk = days[k].idx >= days[k + 1].idx;
      for (const [s, e] of days[k].spans) {
        out.push([off * 1440 + s, off * 1440 + (spillOk ? e : Math.min(e, 1440))]);
      }
    }
    out.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of out) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
      else merged.push(iv.slice());
    }
    return merged;
  }

  function ohEval(hours, now, lat, lng) {
    const rules = ohParse(hours);
    if (!rules) return null;
    now = now || new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const ivs = ohIntervals(rules, now, lat, lng);
    const cur = ivs.find((iv) => iv[0] <= nowMin && nowMin < iv[1]);
    const next = ivs.find((iv) => iv[0] > nowMin);
    return {
      open: !!cur,
      untilClose: cur ? (cur[1] >= 8 * 1440 ? null : cur[1] - nowMin) : null,
      untilOpen: !cur && next ? next[0] - nowMin : null,
      nextOpenAt: !cur && next ? next[0] : null, // minutes from today's 00:00 (may be > 1440)
      allDay: !!cur && cur[0] <= -1440 && cur[1] >= 8 * 1440,
      today: ohDaySpans(rules, new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12), lat, lng).spans,
    };
  }

  /** OSM opening_hours when tagged. Returns "open" | "closed" | null (missing/unreadable). Never invents. */
  function parseOpeningHours(hours, now, lat, lng) {
    const r = ohEval(hours, now, lat, lng);
    return r ? (r.open ? "open" : "closed") : null;
  }
  /** Minutes until the current open span ends. Null if closed, unknown, or open around the clock. */
  function minutesUntilClose(hours, now, lat, lng) {
    const r = ohEval(hours, now, lat, lng);
    return r && r.open ? r.untilClose : null;
  }
  /** Minutes until the next open span starts (within 7 days). Null if open or unknown. */
  function minutesUntilOpen(hours, now, lat, lng) {
    const r = ohEval(hours, now, lat, lng);
    return r && !r.open ? r.untilOpen : null;
  }
  /** Late night = TODAY's tagged hours run past 21:00 (or cross midnight). Unreadable hours → false.
   * forge 20261003 (Gate G5): was "any day of the week"; now reuses ohDaySpans for today only. */
  function isLateNightHours(hours, now, lat, lng) {
    const rules = ohParse(hours);
    if (!rules) return false;
    now = now || placeNow(lng != null ? lng : state.lng);
    const today = ohDaySpans(rules, new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12), lat, lng).spans;
    return today.some(([s, e]) => e > 21 * 60 || s >= 21 * 60);
  }

  function clockFromMinutes(min) {
    let m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
    let h = Math.floor(m / 60);
    const mm = m % 60;
    const am = h < 12;
    const h12 = h % 12 || 12;
    return h12 + (mm ? ":" + String(mm).padStart(2, "0") : "") + (am ? "am" : "pm");
  }

  const OH_DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  /** "Today 7am–9pm" / "Closed today" from parsed OSM spans. "" if unreadable. */
  function todayHoursText(r) {
    if (!r) return "";
    if (r.allDay) return "Tagged 24 hours";
    if (!r.today || !r.today.length) return "Today tagged closed";
    const merged = [];
    for (const sp of r.today.slice().sort((x, y) => x[0] - y[0])) {
      const last = merged[merged.length - 1];
      if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
      else merged.push(sp.slice());
    }
    return "Today " + merged
      .map(([a, b]) => (a === 0 && b >= 1440 ? "all day" : clockFromMinutes(a) + "–" + clockFromMinutes(b)))
      .join(", ");
  }

  /** Plain hours for cards. Never invents; only formats tagged OSM hours.
   * Readable tag → open/closed now + today's hours. Unreadable tag → the raw tag text.
   * No tag → "" (card says "Hours not listed"). */
  function friendlyHoursLine(p, now) {
    const raw = String(p.hours || "").trim();
    if (!raw) return "";
    now = now || placeNow(p.lng != null ? p.lng : state.lng);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const r = ohEval(raw, now, p.lat, p.lng);
    if (!r) return "Hours (OSM): " + raw + " · verify";
    return friendlyHoursCore(p, r, now, nowMin) + hoursSourceNote(p) + " · verify";
  }
  /** Where the hours came from. OSM check dates older than 2 years are called out. */
  function hoursSourceNote(p) {
    if (p.hoursSource === "atp") return " · chain store locator";
    const y = /^(\d{4})/.exec(String(p.hoursChecked || ""));
    if (y && new Date().getFullYear() - Number(y[1]) >= 2) return " · OSM checked " + y[1];
    return "";
  }
  function friendlyHoursCore(p, r, now, nowMin) {
    const today = todayHoursText(r);
    if (r.open) {
      if (r.allDay) return "Tagged 24 hours";
      const until = r.untilClose != null ? clockFromMinutes(nowMin + r.untilClose) : "";
      const lead = r.untilClose != null && r.untilClose <= 60 ? "Closes soon" : "Tagged open";
      return lead + (until ? " · until " + until : "") + " · " + today;
    }
    let opens = "";
    if (r.nextOpenAt != null) {
      const dayOff = Math.floor(r.nextOpenAt / 1440);
      opens = "Opens " + clockFromMinutes(r.nextOpenAt) +
        (dayOff === 0 ? "" : dayOff === 1 ? " tomorrow" : " " + OH_DAY_SHORT[(now.getDay() + dayOff) % 7]);
    }
    return "Tagged closed" + (opens ? " · " + opens : "") + " · " + today;
  }

  function openIshStatus(hours) {
    return parseOpeningHours(hours);
  }





  function walkMinutesApprox(miles) {
    const mi = Number(miles);
    if (!Number.isFinite(mi) || mi < 0) return 1;
    return Math.max(1, Math.round((mi / WALK_MPH) * 60));
  }

  function walkLabel(miles) {
    return "about " + walkMinutesApprox(miles) + " min walk";
  }

  function osmTagYes(v) {
    return String(v || "").toLowerCase() === "yes";
  }

  function osmTagNo(v) {
    return String(v || "").toLowerCase() === "no";
  }

  /** OSM address tags only. Empty when untagged. */
  function osmAddress(tags) {
    if (!tags) return "";
    const full = String(tags["addr:full"] || "").trim();
    if (full) return full.slice(0, 160);
    const line1 = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ").trim();
    const city = [tags["addr:city"], tags["addr:state"], tags["addr:postcode"]].filter(Boolean).join(", ");
    const out = [line1, city].filter(Boolean).join(", ");
    return out.slice(0, 160);
  }

  /** forge 20261003 (Gate G6): card street line from addr:housenumber + addr:street (+ addr:city). "" without a street. */
  function osmStreetLine(tags) {
    if (!tags) return "";
    const street = String(tags["addr:street"] || "").trim();
    if (!street) return "";
    const line = [String(tags["addr:housenumber"] || "").trim(), street].filter(Boolean).join(" ");
    const city = String(tags["addr:city"] || "").trim();
    return (city ? line + ", " + city : line).slice(0, 120);
  }

  function readSaved() {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((x) => x && typeof x === "object" && x.id && x.name)
        .map((x) => ({
          id: String(x.id),
          name: String(x.name).slice(0, 120),
          address: typeof x.address === "string" ? x.address.slice(0, 160) : "",
        }))
        .slice(0, SAVED_MAX);
    } catch (_) {
      return [];
    }
  }

  function writeSaved(list) {
    try {
      localStorage.setItem(
        SAVED_KEY,
        JSON.stringify(
          (list || []).slice(0, SAVED_MAX).map((x) => ({
            id: String(x.id),
            name: String(x.name || "").slice(0, 120),
            address: String(x.address || "").slice(0, 160),
          }))
        )
      );
    } catch (_) {
      /* private mode — ok */
    }
  }

  function clearSavedPlaces() {
    writeSaved([]);
    renderList();
    setStatus("Saved restaurants cleared on this device");
  }

  function isSavedId(id) {
    if (!id) return false;
    return readSaved().some((x) => x.id === id);
  }

  function toggleSavedPlace(place) {
    if (!place || !place.id) return;
    const list = readSaved();
    const idx = list.findIndex((x) => x.id === place.id);
    if (idx >= 0) list.splice(idx, 1);
    else list.unshift({ id: place.id, name: place.name || "", address: place.address || "" });
    writeSaved(list);
  }

  function heartBtnHtml(place) {
    const on = isSavedId(place && place.id);
    const pid = escapeHtml((place && place.id) || "");
    const label = (on ? "Unsave " : "Save ") + ((place && place.name) || "restaurant");
    return `<button type="button" class="heart-btn${on ? " is-saved" : ""}" data-heart="${pid}" aria-pressed="${on ? "true" : "false"}" aria-label="${escapeHtml(label)}"><svg class="heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.1 20.3S3 14.2 3 8.8C3 6 5.2 4 8 4c1.6 0 3 .8 4 2 1-1.2 2.4-2 4-2 2.8 0 5 2 5 4.8 0 5.4-9.1 11.5-9.1 11.5z"/></svg></button>`;
  }

  function syncHeartButtons(id) {
    const on = isSavedId(id);
    document.querySelectorAll("[data-heart]").forEach((btn) => {
      if (btn.getAttribute("data-heart") !== id) return;
      btn.classList.toggle("is-saved", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      const card = btn.closest("[data-id], .sheet-body");
      const nameEl = card && card.querySelector(".place-name, .deal-sheet-place");
      const name = (nameEl && nameEl.textContent) || "place";
      btn.setAttribute("aria-label", (on ? "Unsave " : "Save ") + name);
    });
  }

  function isStandaloneDisplay() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
      if (navigator.standalone) return true;
    } catch (_) {}
    return false;
  }

  function isIosDevice() {
    const ua = navigator.userAgent || "";
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent || "");
  }

  function detectDevice() {
    let device = "desktop";
    try {
      const ua = navigator.userAgent || "";
      const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
      const narrow = !!(window.matchMedia && window.matchMedia("(max-width: 767px)").matches);
      const mid = !!(window.matchMedia && window.matchMedia("(max-width: 1099px)").matches);
      const iosPhone = /iPhone|iPod/i.test(ua);
      const iosPad = /iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const android = /Android/i.test(ua);
      if (narrow) device = "phone";
      else if (mid) device = "tablet";
      else device = "desktop";
    } catch (_) {}
    document.documentElement.setAttribute("data-device", device);
    return device;
  }

  function isHandheldDevice() {
    const d = document.documentElement.getAttribute("data-device");
    if (d === "desktop") return false;
    if (d === "phone" || d === "tablet") return true;
    try {
      const coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
      const narrow = !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);
      const ua = navigator.userAgent || "";
      const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const android = /Android/i.test(ua);
      return (coarse && (narrow || ios || android)) || ios || (android && coarse);
    } catch (_) {
      return false;
    }
  }

  function maybeShowA2hs() {
    const el = $("#a2hsHint");
    if (!el) return;
    if (uiPrefs.a2hsDismissed || isStandaloneDisplay() || !isHandheldDevice()) {
      el.hidden = true;
      return;
    }
    if (!(state.places && state.places.length)) {
      el.hidden = true;
      return;
    }
    const copy = el.querySelector(".a2hs-copy");
    if (copy) {
      copy.textContent = isIosDevice()
        ? "On iPhone: Share, then Add to Home Screen."
        : "Add RangeBites to your Home Screen.";
    }
    el.hidden = false;
  }

  function dismissA2hs() {
    uiPrefs.a2hsDismissed = true;
    persistUiPrefs();
    const el = $("#a2hsHint");
    if (el) el.hidden = true;
  }

  /** forge 20261003 (Gate G4): toggle buttons carry aria-pressed in sync with their .active class. */
  function setToggleState(el, on) {
    if (!el) return;
    el.classList.toggle("active", !!on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function filtersAreOpen() {
    const sheet = $("#filtersSheet");
    return !!(sheet && sheet.classList.contains("open"));
  }

  function syncFiltersLaunch() {
    const btn = $("#filtersBtn");
    if (!btn) return;
    const nonDefault =
      state.walkMinutes != null ||
      Math.abs(state.radiusMiles - 10) > 0.001 ||
      !!state.dietaryFilter ||
      !!state.filters.hasDeal ||
      !!state.filters.saved ||
      !!state.filters.openNow ||
      !!state.filters.takeaway ||
      !!state.filters.delivery ||
      !!state.filters.driveThrough ||
      !!state.filters.wheelchair ||
      !!state.filters.outdoorSeating ||
      !!state.filters.restroom ||
      !!state.filters.dogsOk ||
      !!state.filters.airConditioning ||
      !!state.filters.changingTable ||
      !!state.filters.smokeFree ||
      !!state.filters.kidsArea ||
      !!state.filters.lateNight ||
      !!state.filters.cuisine ||
      !!state.filters.foodCategory ||
      !!(state.filters.diet && (state.filters.diet.vegan || state.filters.diet.vegetarian || state.filters.diet.gluten_free || state.filters.diet.halal)) ||
      (state.filters.type && state.filters.type !== "all");
    btn.classList.toggle("is-active", nonDefault);
  }

  /* forge 20261003 (Lens/QA): closed sheets are inert + aria-hidden; focus goes back to the opener first. */
  const sheetOpener = new WeakMap();
  function setSheetHidden(sheet, hidden) {
    if (!sheet) return;
    if (hidden) {
      const active = document.activeElement;
      if (active && sheet.contains(active)) {
        const back = sheetOpener.get(sheet);
        const target = back && document.contains(back) && !back.closest("[inert]") ? back : $("#placeSearch");
        try { target && target.focus({ preventScroll: true }); } catch (_) {}
        if (sheet.contains(document.activeElement)) { try { active.blur(); } catch (_) {} }
      }
      sheet.setAttribute("inert", "");
      sheet.setAttribute("aria-hidden", "true");
    } else {
      const active = document.activeElement;
      if (active && active !== document.body && !sheet.contains(active)) sheetOpener.set(sheet, active);
      sheet.removeAttribute("inert");
      sheet.setAttribute("aria-hidden", "false");
      const closeBtn = sheet.querySelector(".sheet-close, button");
      setTimeout(() => { try { closeBtn && closeBtn.focus({ preventScroll: true }); } catch (_) {} }, 30);
    }
  }

  function openFilters() {
    const sheet = $("#filtersSheet");
    const back = $("#filtersBackdrop");
    if (!sheet) return;
    if (back) {
      back.hidden = false;
      back.classList.add("open");
    }
    sheet.classList.add("open");
    setSheetHidden(sheet, false);
    const btn = $("#filtersBtn");
    if (btn) btn.setAttribute("aria-expanded", "true");
    const phone = window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
    if (phone) document.body.style.overflow = "hidden";
    uiPrefs.filtersOpen = false;
    setTimeout(() => state.map && state.map.invalidateSize(), 80);
  }

  function closeFilters() {
    const sheet = $("#filtersSheet");
    const back = $("#filtersBackdrop");
    if (sheet) {
      sheet.classList.remove("open");
      setSheetHidden(sheet, true);
    }
    if (back) {
      back.classList.remove("open");
      back.hidden = true;
    }
    const btn = $("#filtersBtn");
    if (btn) btn.setAttribute("aria-expanded", "false");
    uiPrefs.filtersOpen = false;
    if (!$("#aboutSheet") || !$("#aboutSheet").classList.contains("open")) {
      if (!$("#dealSheet") || !$("#dealSheet").classList.contains("open")) {
        document.body.style.overflow = "";
      }
    }
    setTimeout(() => state.map && state.map.invalidateSize(), 80);
  }

  function setStatus(msg) {
    const el = $("#statusLine");
    if (el) el.textContent = msg || "";
  }

  function showBanner(id, show) {
    const el = $(id);
    if (!el) return;
    el.classList.toggle("show", !!show);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }


  function setMapLoading(on) {
    const wrap = document.querySelector(".map-wrap");
    if (wrap) wrap.classList.toggle("is-loading", !!on);
  }

  /* ---------- Map ---------- */

  function initMap() {
    if (state.map) return;
    state.map = L.map("map", {
      zoomControl: false,
      attributionControl: true,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
      preferCanvas: true,
    }).setView([MAP_DEFAULT.lat, MAP_DEFAULT.lng], MAP_DEFAULT.zoom);
    if (state.map.attributionControl) state.map.attributionControl.setPrefix("");

    L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
      attribution:
        'Data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL)' +
        ' · Tiles <a href="https://creativecommons.org/licenses/by-sa/2.0/" target="_blank" rel="noopener noreferrer">CC-BY-SA 2.0</a> OSM Deutschland/FOSSGIS' +
        ' · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Report a map error</a>',
      maxZoom: 18,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2
    }).addTo(state.map);

    L.control.zoom({ position: "bottomright" }).addTo(state.map);
    state.markersLayer = L.layerGroup().addTo(state.map);
  }

  function updateMapCenter(lat, lng, radiusMi) {
    initMap();
    state.map.setView([lat, lng], radiusMi <= 10 ? 13 : radiusMi <= 20 ? 12 : 11, { animate: false });

    if (state.userMarker) state.map.removeLayer(state.userMarker);
    if (state.radiusCircle) state.map.removeLayer(state.radiusCircle);

    const icon = L.divIcon({
      className: "",
      html: '<div class="radar-marker"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    state.userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(state.map);
    // Warm kitchen radius — not teal
    state.radiusCircle = L.circle([lat, lng], {
      radius: milesToMeters(radiusMi),
      color: "#ffc43a",
      weight: 1,
      fillColor: "#ffc43a",
      fillOpacity: 0.08,
    }).addTo(state.map);
  }

  function triggerLocateGlow() {
    /* radar-glow dropped — locate pulse is the busy state on the button */
  }

  function clearMapLayers() {
    if (state.markersLayer) state.markersLayer.clearLayers();
    if (state.userMarker && state.map) {
      state.map.removeLayer(state.userMarker);
      state.userMarker = null;
    }
    if (state.radiusCircle && state.map) {
      state.map.removeLayer(state.radiusCircle);
      state.radiusCircle = null;
    }
  }

  /** placeId → Leaflet marker (for pin ↔ list sync) */
  const markerById = new Map();

  function clearCardSelection() {
    $$(".place-card.selected").forEach((el) => el.classList.remove("selected"));
    $$(".deal-rail-card.selected").forEach((el) => el.classList.remove("selected"));
    markerById.forEach((m) => {
      const el = m.getElement && m.getElement();
      if (!el) return;
      const pin = el.querySelector(".radar-marker");
      if (pin) pin.classList.remove("active-pin");
    });
  }

  function highlightPlace(placeId, { openPopup, scrollCard, pan } = {}) {
    if (!placeId) return;
    clearCardSelection();
    let card = null;
    try {
      card = document.querySelector(`.place-card[data-id="${CSS.escape(placeId)}"]`);
    } catch (_) {
      card = document.querySelector('.place-card[data-id="' + placeId.replace(/"/g, '') + '"]');
    }
    if (card) {
      card.classList.add("selected");
      if (scrollCard) {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    try {
      const railCard = document.querySelector(
        `.deal-rail-card[data-deal-open="${CSS.escape(placeId)}"]`
      );
      if (railCard) railCard.classList.add("selected");
    } catch (_) {
      /* ignore */
    }
    const m = markerById.get(placeId);
    if (m) {
      const el = m.getElement && m.getElement();
      if (el) {
        const pin = el.querySelector(".radar-marker");
        if (pin) pin.classList.add("active-pin");
      }
      if (pan && state.map) {
        state.map.panTo(m.getLatLng(), { animate: true });
      }
      if (openPopup) m.openPopup();
    }
  }

  function renderMarkers(places) {
    if (!state.markersLayer) return;
    state.markersLayer.clearLayers();
    markerById.clear();
    places.forEach((p) => {
      const isDeal = !!p.deal;
      const isSponsored = !!p.sponsored;
      const size = isDeal ? 16 : 12;
      // forge 20261003 (Lens): 32px invisible hit box around the same small visual dot.
      const HIT = 32;
      const iconW = isSponsored ? 76 : HIT;
      const iconH = isSponsored ? size + 14 : HIT;
      const pinClass = `radar-marker${isDeal ? " deal" : ""}${isSponsored ? " sponsored" : ""}`;
      const pinHtml = isSponsored
        ? `<div class="${pinClass}"></div><span class="pin-sponsored">Sponsored</span>`
        : `<div class="pin-hit"><div class="${pinClass}"></div></div>`;
      const icon = L.divIcon({
        className: isSponsored ? "sponsored-pin-icon" : "pin-hit-icon",
        html: pinHtml,
        iconSize: [iconW, iconH],
        iconAnchor: isSponsored ? [iconW / 2, size / 2] : [HIT / 2, HIT / 2],
      });
      const m = L.marker([p.lat, p.lng], { icon });
      const sponsoredPopup = isSponsored
        ? `<br><span class="popup-sponsored">Sponsored</span>`
        : "";
      m.bindPopup(
        `<strong>${escapeHtml(p.name)}</strong><br>${formatMiles(p.miles)} · ${escapeHtml(p.cuisine ? prettyCuisineList(p.cuisine) : amenityLabel(p.amenity))}` +
          (p.deal ? `<br><span class="popup-deal">${escapeHtml(p.deal.label)}</span>` : "") +
          sponsoredPopup
      );
      m.on("click", () => {
        highlightPlace(p.id, { openPopup: false, scrollCard: true, pan: false });
        openDealSheet(p, { startDirections: true });
      });
      markerById.set(p.id, m);
      state.markersLayer.addLayer(m);
    });
  }

  /* ---------- Overpass ---------- */

  /** forge 20261003 (Shade): coordinates sent to Overpass are rounded to 3 decimals (about 110 m). */
  function roundCoord3(v) {
    return Math.round(Number(v) * 1000) / 1000;
  }

  function buildOverpassQuery(lat, lng, radiusM, mode) {
    // +120 m pad so rounding the centre never drops a place near the edge; distances and the
    // radius cut-off still use the full-precision origin on this device (normalizeElements).
    const r = Math.round(radiusM) + 120;
    const t = mode === "fast" ? OVERPASS_FAST_TIMEOUT_S : OVERPASS_TIMEOUT_S;
    const around = `(around:${r},${roundCoord3(lat).toFixed(3)},${roundCoord3(lng).toFixed(3)})`;
    const named = '["name"]';
    // Lean query — same food types, fewer unions so phones finish before timeout.
    // Pantries: amenity=food_bank|soup_kitchen only. Copy must not claim social_facility/office/worldwide.
    const food = "restaurant|fast_food|cafe|bar|pub|ice_cream|food_court|biergarten|food_bank|soup_kitchen";
    return `[out:json][timeout:${t}];(` +
      `node["amenity"~"^(` + food + `)$"]${named}${around};` +
      `way["amenity"~"^(` + food + `)$"]${named}${around};` +
      `relation["amenity"~"^(` + food + `)$"]${named}${around};` +
      `node["shop"~"^(bakery|deli)$"]${named}${around};` +
      `way["shop"~"^(bakery|deli)$"]${named}${around};` +
      `);out center;`;
  }

  function overpassErrorMessage(err) {
    if (!err) return "Couldn’t reach OpenStreetMap. Try again.";
    if (err.name === "AbortError") return "OpenStreetMap timed out. Try again.";
    const m = String(err.message || "");
    if (/HTTP 429/.test(m)) return "OpenStreetMap is busy. Try again in a moment.";
    if (/HTTP 50[234]/.test(m)) return "OpenStreetMap is down. Try again.";
    if (/HTTP /.test(m)) return "OpenStreetMap returned an error. Try again.";
    return "Couldn’t reach OpenStreetMap. Try again.";
  }

  function firstFulfilled(promises) {
    return new Promise((resolve, reject) => {
      let left = promises.length;
      let lastErr = null;
      if (!left) {
        reject(new Error("Overpass unreachable"));
        return;
      }
      promises.forEach((p) => {
        Promise.resolve(p).then(resolve, (err) => {
          lastErr = err;
          left -= 1;
          if (left === 0) reject(lastErr || new Error("Overpass unreachable"));
        });
      });
    });
  }

  async function fetchPlaces(lat, lng, radiusMiles, opts) {
    opts = opts || {};
    const mode = opts.mode || "full";
    const urls = OVERPASS_URLS.slice();
    const abortMs = mode === "fast" ? OVERPASS_FAST_ABORT_MS : OVERPASS_CLIENT_ABORT_MS;
    const radiusM = milesToMeters(radiusMiles);
    const query = buildOverpassQuery(lat, lng, radiusM, mode);
    const body = "data=" + encodeURIComponent(query);

    async function fetchOne(url) {
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, abortMs);
      try {
        let res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            Accept: "application/json",
          },
          body: body,
          signal: controller.signal,
          referrerPolicy: "origin",
        });
        if (!res.ok && (res.status === 429 || res.status === 502 || res.status === 504)) {
          try { setStatus("OpenStreetMap is busy… retrying"); } catch (_) {}
          await new Promise(function (r) { setTimeout(r, 2500); });
          res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
              Accept: "application/json",
            },
            body: body,
            signal: controller.signal,
            referrerPolicy: "origin",
          });
        }
        if (!res.ok) throw new Error("Overpass HTTP " + res.status);
        const data = await res.json();
        const remark = String(data.remark || "");
        if (/timeout|error/i.test(remark)) throw new Error("Overpass remark timeout");
        const places = normalizeElements(data.elements || [], lat, lng);
        if (!places.length) throw new Error("Overpass empty");
        return places;
      } finally {
        clearTimeout(timer);
      }
    }

    let lastErr = null;
    for (let i = 0; i < urls.length; i++) {
      try {
        return await fetchOne(urls[i]);
      } catch (err) {
        lastErr = err;
        // empty on this URL → try next in OVERPASS_URLS; empty on all → real empty list
      }
    }
    if (lastErr && /empty/i.test(String(lastErr.message || ""))) return [];
    throw lastErr || new Error("Overpass unreachable");
  }

  function shortPlaceLabel(displayName, fallback) {
    const parts = String(displayName || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!parts.length) return fallback || "that city";
    const city = parts[0];
    const skip = /county|parish|united states|^usa$|^\d{5}/i;
    const rest = parts.slice(1).find((p) => !skip.test(p));
    return rest ? city + ", " + rest : city;
  }


  function pickGeocodeHit(data) {
    if (!Array.isArray(data) || !data.length) return null;
    function score(h) {
      const t = String((h && (h.addresstype || h.type)) || "").toLowerCase();
      const cls = String((h && (h.category || h.class)) || "").toLowerCase();
      if (t === "postcode" || t === "postal_code") return 0;
      if (t === "country" || t === "continent") return 40;
      if (t === "state" || t === "region") return 25;
      if (t === "county") return 12;
      if (/^(city|town|village|municipality)$/.test(t)) return 0;
      if (/^(suburb|neighbourhood|neighborhood|hamlet)$/.test(t)) return 4;
      if (cls === "place") return 6;
      if (cls === "boundary") return 15;
      return 18;
    }
    let best = data[0];
    let bestS = score(best);
    for (let i = 1; i < data.length; i++) {
      const sc = score(data[i]);
      const cc = (data[i].address && data[i].address.country_code) || "";
      const bestCc = (best.address && best.address.country_code) || "";
      if (sc < bestS || (sc === bestS && cc === "us" && bestCc !== "us")) {
        best = data[i];
        bestS = sc;
      }
    }
    if (bestS >= 40) return null;
    return best;
  }

  /* forge 20261003 (Snitch): at most 1 Nominatim request per second from this page. The here.now proxy
   * only supports per-IP hourly limits, so a global 1 req/s cap cannot be set at the proxy. */
  const NOMINATIM_MIN_GAP_MS = 1100;
  let nominatimLastAt = 0;
  /* forge 20261003 (Gate G1): a 429/503 from the city lookup fails fast with a "busy" message, and further
   * lookups wait out a short cooldown (Retry-After, capped at 60 s) without calling Nominatim again. */
  const NOMINATIM_BUSY_MAX_MS = 60000;
  let nominatimBusyUntil = 0;
  function nominatimBusyError() {
    const e = new Error("Nominatim HTTP 429");
    e.busy = true;
    return e;
  }
  function noteNominatimBusy(res) {
    const ra = parseInt((res && res.headers && res.headers.get && res.headers.get("Retry-After")) || "", 10);
    const ms = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, NOMINATIM_BUSY_MAX_MS) : 15000;
    nominatimBusyUntil = Date.now() + ms;
  }
  async function nominatimFetch(url, init) {
    const wait = nominatimLastAt + NOMINATIM_MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nominatimLastAt = Date.now();
    return fetch(url, init);
  }

  function geocodeHitToPlace(hit, fallback) {
    const lat = parseFloat(hit && hit.lat);
    const lng = parseFloat(hit && hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      label: hit.display_name || fallback,
      display_name: hit.display_name || fallback,
      country_code: (hit.address && hit.address.country_code) || "",
      address: hit.address || null,
      name: hit.name || "",
      importance: typeof hit.importance === "number" ? hit.importance : null,
    };
  }

  /** Short label for a geocoder hit: "Bristol, TN" in the US, "Bristol, United Kingdom" elsewhere. */
  function geocodeShortLabel(h) {
    const a = (h && h.address) || {};
    const name = String((h && h.name) || String((h && h.display_name) || "").split(",")[0] || "").trim();
    if (!name) return "";
    const cc = String(a.country_code || "").toLowerCase();
    const iso = String(a["ISO3166-2-lvl4"] || "");
    if (cc === "us") {
      const st = /^US-([A-Z]{2})$/.test(iso) ? iso.slice(3) : String(a.state || "").trim();
      return st ? name + ", " + st : name;
    }
    const where = String(a.country || "").trim();
    return where ? name + ", " + where : name;
  }

  /** forge 20261003 (Gate G2): same-name settlements from one geocoder response, deduped, US first.
   * Counties/states/regions are dropped; duplicates (same label, or same state and within 5 mi) are dropped. No network. */
  function geocodeAlternates(data, chosen, max) {
    if (!Array.isArray(data) || !chosen) return [];
    max = max || 5;
    const settle = /^(city|town|village|municipality|hamlet|suburb)$/;
    const chosenName = normWord(chosen.name || String(chosen.display_name || "").split(",")[0]);
    const region = (h) => { const a = (h && h.address) || {}; return String(a.country_code || "") + "|" + String(a["ISO3166-2-lvl4"] || a.state || ""); };
    const seen = [{ label: geocodeShortLabel(chosen).toLowerCase(), region: region(chosen), lat: parseFloat(chosen.lat), lng: parseFloat(chosen.lon) }];
    const picks = [];
    data.forEach((h, i) => {
      if (!h || h === chosen) return;
      const t = String(h.addresstype || h.type || "").toLowerCase();
      if (!settle.test(t)) return;
      if (normWord(h.name || String(h.display_name || "").split(",")[0]) !== chosenName) return;
      const label = geocodeShortLabel(h);
      const lat = parseFloat(h.lat), lng = parseFloat(h.lon);
      if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const key = label.toLowerCase();
      const reg = region(h);
      // Same label, or same state/region and within 5 mi, is a duplicate. Twin towns across a state line
      // (Bristol VA / Bristol TN) are both kept.
      if (seen.some((x) => x.label === key || (x.region === reg && haversineMiles(x.lat, x.lng, lat, lng) < 5))) return;
      seen.push({ label: key, region: reg, lat, lng });
      const cc = String((h.address && h.address.country_code) || "").toLowerCase();
      picks.push({ i, us: cc === "us", hit: h, label });
    });
    picks.sort((a, b) => (a.us === b.us ? a.i - b.i : a.us ? -1 : 1));
    return picks.slice(0, max).map((x) => Object.assign(geocodeHitToPlace(x.hit, x.label), { shortLabel: x.label }));
  }

  async function geocodePlace(q) {
    const t = String(q || "").trim();
    if (!t) return null;
    // Mobile/OS often sends "24266, Lebanon, United States" — prefer the ZIP.
    const zipLead = t.match(/^(\d{5})(?:-\d{4})?\b/);
    let lookup = t;
    if (zipLead) lookup = zipLead[1];
    else if (/^(lebanon)(\s*,?\s*(va|virginia))?$/i.test(t)) {
      lookup = "Lebanon, Russell County, Virginia";
    } else if (/lebanon/i.test(t) && /\b(va|virginia)\b/i.test(t)) {
      lookup = "Lebanon, Russell County, Virginia";
    }
    const params = new URLSearchParams();
    params.set("format", "jsonv2");
    params.set("limit", "8");
    params.set("addressdetails", "1");
    if (!looksLikePostal(lookup)) params.set("featureType", "settlement");
    params.set("q", lookup);
    if (Date.now() < nominatimBusyUntil) throw nominatimBusyError();
    const ac = new AbortController();
    // forge 20261003 (Chip): 10 s lookup budget (was 20 s) so a dead geocoder fails sooner.
    const timer = setTimeout(() => ac.abort(), 10000);
    try {
      const res = await nominatimFetch(NOMINATIM_URL + "?" + params.toString(), {
        headers: { Accept: "application/json" },
        referrerPolicy: "origin",
        signal: ac.signal,
      });
      if (res.status === 429 || res.status === 503) { noteNominatimBusy(res); throw nominatimBusyError(); }
      if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
      let data = await res.json();
      if ((!data || !data.length) && !looksLikePostal(lookup)) {
        const p2 = new URLSearchParams();
        p2.set("format", "jsonv2");
        p2.set("limit", "8");
        p2.set("addressdetails", "1");
        p2.set("q", lookup);
        const res2 = await nominatimFetch(NOMINATIM_URL + "?" + p2.toString(), {
          headers: { Accept: "application/json" },
          referrerPolicy: "origin",
          signal: ac.signal,
        });
        if (res2.status === 429 || res2.status === 503) { noteNominatimBusy(res2); throw nominatimBusyError(); }
        if (res2.ok) data = await res2.json();
      }
      if (!data || !data.length) return null;
      const hit = pickGeocodeHit(data);
      if (!hit) return null;
      const out = geocodeHitToPlace(hit, t);
      if (!out) return null;
      // forge 20261003 (Gate G2): other places with the same name, from this same response (no extra call).
      out.alternates = looksLikePostal(lookup) ? [] : geocodeAlternates(data, hit);
      return out;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Same place mapped twice (node + building way/relation): same normalized name within ~130 m.
   * Keep one: node coords (the POI itself) over way/relation center; fill missing tags from the other. */
  function mergeDuplicateElements(elements) {
    const norm = (n) => String(n || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const rank = { node: 0, way: 1, relation: 2 };
    const kept = [];
    const rk = (t) => (Object.prototype.hasOwnProperty.call(rank, t) ? rank[t] : 3); // node is 0 — do not use || (0 is falsy)
    const sorted = elements.slice().sort((a, b) => rk(a.type) - rk(b.type));
    for (const el of sorted) {
      const tags = el.tags || {};
      const name = String(tags.name || "").trim();
      const lat = el.lat != null ? el.lat : el.center && el.center.lat;
      const lng = el.lon != null ? el.lon : el.center && el.center.lon;
      if (!name || lat == null || lng == null) { kept.push(el); continue; }
      const key = norm(name);
      const prev = kept.find((k) => {
        const kt = k.tags || {};
        const klat = k.lat != null ? k.lat : k.center && k.center.lat;
        const klng = k.lon != null ? k.lon : k.center && k.center.lon;
        if (k.type === "node" && el.type === "node") return false; // two POI nodes = two places
        return klat != null && norm(kt.name) === key && haversineMiles(klat, klng, lat, lng) < 0.08;
      });
      if (!prev) { kept.push(el); continue; }
      const merged = Object.assign({}, tags, prev.tags || {}); // keeper's tags win; fill gaps
      prev.tags = merged;
    }
    return kept;
  }

  function normalizeElements(elements, originLat, originLng) {
    const places = [];

    for (const el of mergeDuplicateElements(elements || [])) {
      const tags = el.tags || {};
      const name = String(tags.name || "").replace(/\s+/g, " ").trim();
      if (!name) continue; // never show a blank name
      if (isPermanentlyClosed(tags)) continue;

      let lat = el.lat;
      let lng = el.lon;
      if (lat == null && el.center) {
        lat = el.center.lat;
        lng = el.center.lon;
      }
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const freeFood = isTaggedFreeFood(tags);
      let amenity = tags.amenity || tags.shop || "restaurant";
      if (freeFood && amenity !== "soup_kitchen") amenity = "food_bank";
      const miles = haversineMiles(originLat, originLng, lat, lng);
      const deal =
        !freeFood &&
        window.RangeBitesDeals &&
        typeof window.RangeBitesDeals.matchDeal === "function"
          ? window.RangeBitesDeals.matchDeal({
              name,
              cuisine: tags.cuisine || "",
              description: tags.description || tags.note || "",
              amenity,
            })
          : null;

      const hours = tags.opening_hours || "";
      const kitchenHours = tags["opening_hours:kitchen"] || "";
      const atPlace = placeNow(originLng);
      const openStatus = parseOpeningHours(hours, atPlace, lat, lng);
      const kitchenStatus = kitchenHours ? parseOpeningHours(kitchenHours, atPlace, lat, lng) : null;
      const untilClose = openStatus === "open" ? minutesUntilClose(hours, atPlace, lat, lng) : null;
      const untilOpen = openStatus === "closed" ? minutesUntilOpen(hours, atPlace, lat, lng) : null;
      const cuisineRaw = tags.cuisine || "";
      const cuisineCanon = cuisineTokens({ cuisine: cuisineRaw }).map(canonCuisine);
      const dietVegan = osmDietTagged(tags, "vegan") || cuisineCanon.indexOf("vegan") >= 0;
      const dietVegetarian = osmDietTagged(tags, "vegetarian") || cuisineCanon.indexOf("vegetarian") >= 0 || dietVegan;
      const dietGlutenFree = osmDietTagged(tags, "gluten_free");
      const dietHalal = osmDietTagged(tags, "halal");
      places.push({
        id: el.type + "/" + el.id,
        name,
        lat,
        lng,
        amenity,
        cuisine: cuisineRaw,
        hours,
        hoursSource: hours ? "osm" : "",
        hoursChecked: String(tags["check_date:opening_hours"] || tags.check_date || tags["survey:date"] || "").trim(),
        brandQid: String(tags["brand:wikidata"] || "").trim(),
        kitchenHours,
        kitchenClosedDoorsOpen: openStatus === "open" && kitchenHours && kitchenStatus === "closed",
        phone: tags.phone || tags["contact:phone"] || "",
        website: tags.website || tags["contact:website"] || tags.url || "",
        menuUrl: tags["website:menu"] || tags.menu || tags["contact:menu"] || "",
        osmRating: parseOsmRating(tags),
        address: osmAddress(tags),
        street: osmStreetLine(tags),
        city: String(tags["addr:city"] || tags["addr:town"] || tags["addr:suburb"] || "").trim(),
        takeout: osmTagYes(tags.takeaway),
        delivery: osmTagYes(tags.delivery),
        driveThru: osmTagYes(tags.drive_through),
        wheelchair: String(tags.wheelchair || "").toLowerCase() === "yes",
        outdoorSeating: osmTagYes(tags.outdoor_seating),
        restroom: osmTagYes(tags.toilets),
        dogsOk: osmTagYes(tags.dog),
        airConditioning: osmTagYes(tags.air_conditioning),
        changingTable: osmTagYes(tags.changing_table),
        smokeFree: osmTagNo(tags.smoking),
        kidsArea: osmTagYes(tags.kids_area),
        dietVegan,
        dietVegetarian,
        dietGlutenFree,
        dietHalal,
        miles,
        deal,
        openStatus,
        closesSoon: openStatus === "open" && untilClose != null && untilClose <= 60,
        opensSoon: openStatus === "closed" && untilOpen != null && untilOpen > 0 && untilOpen <= 90,
        untilOpen,
        freeFood,
        socialFacility: tags.social_facility || "",
      });
    }

    return sortNearestFirst(places).slice(0, 400);
  }

  /* ---------- AllThePlaces chain hours (CC0, weekly store-locator scrape) ----------
   * data/atp-hours.json is built offline by tools/build-atp-hours.py (no key, no cost).
   * Match = same brand:wikidata within 150 m. Fills missing OSM hours; within 60 m the
   * chain locator wins over older OSM chain hours. Label says where hours came from. */
  const ATP_URL = "data/atp-hours.json";
  const ATP_FILL_M = 150;
  const ATP_OVERRIDE_M = 60;
  let atpIndex = null;
  let atpLoading = null;
  function loadAtpHours() {
    if (atpLoading) return atpLoading;
    atpLoading = fetch(ATP_URL, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const idx = new Map();
        for (const row of (j && Array.isArray(j.rows) ? j.rows : [])) {
          if (!Array.isArray(row) || !row[0] || !row[3]) continue;
          const list = idx.get(row[0]) || [];
          list.push(row);
          idx.set(row[0], list);
        }
        atpIndex = idx;
        return idx;
      })
      .catch(() => { atpIndex = new Map(); return atpIndex; });
    return atpLoading;
  }
  function metersBetween(lat1, lng1, lat2, lng2) {
    return haversineMiles(lat1, lng1, lat2, lng2) * 1609.344;
  }
  /** Recompute open/closed fields from p.hours. Never invents: unreadable → null. */
  function setHoursState(p, now) {
    const at = now || placeNow(p.lng);
    const st = p.hours ? parseOpeningHours(p.hours, at, p.lat, p.lng) : null;
    const untilClose = st === "open" ? minutesUntilClose(p.hours, at, p.lat, p.lng) : null;
    const untilOpen = st === "closed" ? minutesUntilOpen(p.hours, at, p.lat, p.lng) : null;
    p.openStatus = st;
    p.closesSoon = st === "open" && untilClose != null && untilClose <= 60;
    p.opensSoon = st === "closed" && untilOpen != null && untilOpen > 0 && untilOpen <= 90;
    p.untilOpen = untilOpen;
  }
  /** Merge chain hours into places. Returns how many places changed. */
  function applyAtpHours(places) {
    if (!atpIndex || !atpIndex.size || !places || !places.length) return 0;
    let changed = 0;
    for (const p of places) {
      if (!p.brandQid || p.hoursSource === "atp") continue;
      const rows = atpIndex.get(p.brandQid);
      if (!rows) continue;
      let best = null;
      let bestM = Infinity;
      for (const row of rows) {
        const m = metersBetween(p.lat, p.lng, row[1], row[2]);
        if (m < bestM) { bestM = m; best = row; }
      }
      if (!best) continue;
      const fill = !p.hours && bestM <= ATP_FILL_M;
      const override = p.hours && bestM <= ATP_OVERRIDE_M && String(best[3]).trim() !== String(p.hours).trim();
      if (!fill && !override) continue;
      if (parseOpeningHours(best[3], placeNow(p.lng), p.lat, p.lng) == null) continue; // only readable chain hours
      if (override) p.osmHours = p.hours;
      p.hours = String(best[3]).trim();
      p.hoursSource = "atp";
      p.hoursSpider = String(best[4] || ""); // AllThePlaces spider name (attribution only)
      setHoursState(p);
      changed++;
    }
    return changed;
  }

  function cuisineTokens(p) {
    return String((p && p.cuisine) || "")
      .split(/[;,/]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  function filteredPlaces() {
    let list = state.places.slice();
    list = list.filter((p) => p.miles <= state.radiusMiles + 0.05);
    if (state.filters.hasDeal) list = list.filter((p) => !!p.deal);
    // Open now chip gates closed. Default still shows closed + unknown hours. Never invent hours.
    if (state.filters.openNow) list = list.filter((p) => p.openStatus === "open");
    if (state.filters.type !== "all") list = list.filter((p) => p.amenity === state.filters.type);
    if (state.filters.saved) list = list.filter((p) => isSavedId(p.id));
    if (state.filters.takeaway) list = list.filter((p) => !!p.takeout);
    if (state.filters.delivery) list = list.filter((p) => !!p.delivery);
    if (state.filters.driveThrough) list = list.filter((p) => !!p.driveThru);
    if (state.filters.wheelchair) list = list.filter((p) => !!p.wheelchair);
    if (state.filters.outdoorSeating) list = list.filter((p) => !!p.outdoorSeating);
    if (state.filters.restroom) list = list.filter((p) => !!p.restroom);
    if (state.filters.dogsOk) list = list.filter((p) => !!p.dogsOk);
    if (state.filters.airConditioning) list = list.filter((p) => !!p.airConditioning);
    if (state.filters.changingTable) list = list.filter((p) => !!p.changingTable);
    if (state.filters.smokeFree) list = list.filter((p) => !!p.smokeFree);
    if (state.filters.kidsArea) list = list.filter((p) => !!p.kidsArea);
    // forge 20261003 (Gate G5): evaluated at filter time so it follows today's hours (incl. past midnight).
    if (state.filters.lateNight) list = list.filter((p) => isLateNightHours(p.hours, placeNow(p.lng), p.lat, p.lng));
    const d = state.filters.diet || {};
    if (d.vegan) list = list.filter((p) => !!p.dietVegan);
    if (d.vegetarian) list = list.filter((p) => !!p.dietVegetarian);
    if (d.gluten_free) list = list.filter((p) => !!p.dietGlutenFree);
    if (d.halal) list = list.filter((p) => !!p.dietHalal);
    if (state.dietaryFilter === "freefood") list = list.filter((p) => !!p.freeFood);
    if (state.filters.cuisine) {
      const want = canonCuisine(state.filters.cuisine);
      list = list.filter((p) => cuisineTokens(p).map(canonCuisine).indexOf(want) >= 0);
    }
    const cat = foodCategoryById(state.filters.foodCategory);
    if (cat) list = list.filter((p) => placeMatchesFoodCategory(p, cat));
    const nq = String(state.nameQuery || "").trim().toLowerCase();
    if (nq) list = list.filter((p) => String(p.name || "").toLowerCase().includes(nq));
    list = sortNearestFirst(list).slice(0, MAX_RESULTS);

    return list;
  }

  function mapsPlatform() {
    const ua = navigator.userAgent || "";
    const iOS =
      /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (iOS) return "apple";
    if (/Android/i.test(ua)) return "android";
    return "unknown";
  }

  function mapsLinks(p) {
    const lat = Number(p && p.lat);
    const lng = Number(p && p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { apple: "", google: "" };
    const q = encodeURIComponent(p.name || "restaurant");
    return {
      apple: "https://maps.apple.com/?daddr=" + lat + "," + lng + "&q=" + q,
      google:
        "https://www.google.com/maps/dir/?api=1&destination=" +
        lat +
        "," +
        lng +
        "&travelmode=driving",
    };
  }

  /** Reviews live on Google Maps. Do not send "Reviews" to Apple search. */
  function reviewsMapsLinks(p) {
    const name = p && p.name ? String(p.name).trim() : "";
    if (!name) return { google: "" };
    const city = String((p && p.city) || (typeof uiPrefs !== "undefined" && uiPrefs.lastPlaceQuery) || "").trim();
    const q = city ? name + " " + city : name;
    return {
      google: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q),
    };
  }

  function openMapsUrl(url, mapsApp, placeId) {
    if (!url) return;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_) {}
    const aNav = analytics();
    if (aNav) aNav.navHandoff(placeId, mapsApp, state.radiusMiles);
  }

  function startPlatformDirections(place) {
    if (!place) return "unknown";
    const links = mapsLinks(place);
    const plat = mapsPlatform();
    if (plat === "apple" && links.apple) {
      openMapsUrl(links.apple, "apple", place.id);
      return plat;
    }
    if (plat === "android" && links.google) {
      openMapsUrl(links.google, "google", place.id);
      return plat;
    }
    return plat;
  }

  function openDealUrl(p) {
    const web = p && p.website ? absoluteUrl(p.website) : "";
    if (web) return web;
    return mapsLinks(p).google;
  }

  function absoluteUrl(url) {
    const raw = String(url || "").trim();
    if (!raw || /[\s<>"']/.test(raw)) return "";
    let u = raw;
    if (!/^https?:\/\//i.test(u)) {
      if (/^\/\//.test(u)) u = "https:" + u;
      else if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}([/:?#].*)?$/i.test(u)) u = "https://" + u;
      else return "";
    }
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      if (parsed.username || parsed.password) return "";
      return parsed.href;
    } catch (_) {
      return "";
    }
  }

  function telHref(phone) {
    const raw = String(phone || "").split(/[;,]/)[0].trim(); // OSM may list several numbers

    if (!raw) return "";
    const digits = raw.replace(/[^\d+]/g, "");
    if (!digits || digits.replace(/\D/g, "").length < 7) return "";
    return "tel:" + digits;
  }

  /**
   * Quiet Precision contact rows — Call / Website / Hours when OSM tags present.
   * Hide entirely when none.
   */
  function isFakeDemoPhone(phone) {
    // Only the reserved fictional range NXX-555-0100..0199. Real numbers can contain 555.
    const d = String(phone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    return /^\d{3}55501\d{2}$/.test(d);
  }

  function contactBlockHtml(p) {
    const rows = [];
    const tel = isFakeDemoPhone(p.phone) ? "" : telHref(p.phone);
    if (tel) {
      rows.push(
        `<a class="contact-link" href="${escapeHtml(tel)}">Call <span class="contact-value">${escapeHtml(formatPhoneDisplay(p.phone))}</span></a>`
      );
    }
    const menu = /example\.com/i.test(p.menuUrl || "") ? "" : absoluteUrl(p.menuUrl);
    if (menu) {
      rows.push(
        `<a class="contact-link" href="${escapeHtml(menu)}" target="_blank" rel="noopener noreferrer">Menu</a>`
      );
    }
    const web = /example\.com/i.test(p.website || "") ? "" : absoluteUrl(p.website);
    if (web) {
      rows.push(
        `<a class="contact-link" href="${escapeHtml(web)}" target="_blank" rel="noopener noreferrer" title="Link from the OpenStreetMap listing">Website</a>`
      );
    }
    if (p.hours) {
      const src = p.hoursSource === "atp"
        ? " (chain store locator via AllThePlaces, CC0)"
        : " (OpenStreetMap)";
      rows.push(
        `<div class="contact-hours"><span class="contact-label">Hours</span> ${escapeHtml(p.hours)}${src}</div>`
      );
    }
    if (!rows.length) return "";
    return `<div class="place-contact" aria-label="Contact">${rows.join("")}</div>`;
  }

  /**
   * Honest reviews MVP: Maps handoff only. Optional OSM stars/rating tag if real.
   * Never invent star numbers.
   */
  function reviewsBlockHtml(p) {
    const links = reviewsMapsLinks(p);
    const gHref = escapeHtml(links.google || "");
    if (!gHref) return "";
    return `<div class="reviews-block">
  <div class="nav-row reviews-row"><a class="nav-btn reviews-cta" href="${gHref}" target="_blank" rel="noopener noreferrer">Reviews</a></div>
  <p class="reviews-note">Reviews open in Google Maps</p>
</div>`;
  }

  /** Parse rare real OSM stars/rating tags only — never invent. */
  function parseOsmRating(tags) {
    const t = tags || {};
    const raw = t.stars || t.rating || t["stars:tripadvisor"] || "";
    if (!raw) return "";
    const s = String(raw).trim();
    // Accept numeric or simple "4" / "4.5" / "4/5" style — reject junk
    if (!/^[\d.]+(?:\s*\/\s*[\d.]+)?$/.test(s)) return "";
    return s;
  }

  function heroTipHidden() {
    return !!uiPrefs.heroTipHidden;
  }

  function hideHeroTip(persist) {
    const tip = $("#heroTip");
    if (tip) {
      tip.classList.add("hidden");
      tip.hidden = true;
    }
    if (persist) {
      uiPrefs.heroTipHidden = true;
      persistUiPrefs();
    }
  }

  function syncHeroTipVisibility() {
    if (heroTipHidden()) hideHeroTip(false);
  }

  /* ---------- List + deal sheet ---------- */

  function setDealRailLabel() {
    const wrap = $("#dealRailWrap");
    if (!wrap) return;
    const el = wrap.querySelector(".deal-rail-label");
    if (!el) return;
    el.innerHTML = `Promo text on this listing <span class="deal-rail-sub">Confirm with the restaurant</span>`;
  }

  function renderDealRail(list) {
    const wrap = $("#dealRailWrap");
    const rail = $("#dealRail");
    if (!wrap || !rail) return;
    const deals = (list || []).filter((p) => !!p.deal);
    if (state.loading || state.lat == null || !deals.length) {
      wrap.hidden = true;
      wrap.classList.remove("is-empty");
      rail.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    wrap.classList.remove("is-empty");
    setDealRailLabel();
    rail.innerHTML = deals
      .slice(0, 12)
      .map((p, idx) => {
        const sponsored = p.sponsored
          ? `<span class="rail-sponsored">Sponsored</span>`
          : "";
        return `<button type="button" class="deal-rail-card" role="listitem" data-deal-open="${escapeHtml(p.id)}" data-rail-pos="${idx}">
  <span class="rail-deal">${escapeHtml(p.deal.label)}</span>
  <span class="rail-name">${escapeHtml(p.name)}</span>
  <span class="rail-meta">${formatMiles(p.miles)} · ${escapeHtml(amenityLabel(p.amenity))}</span>
  ${sponsored}
</button>`;
      })
      .join("");
  }

  function openNowPlaces() {
    const seen = new Set();
    return (state.places || [])
      .filter((p) => {
        if (p.openStatus !== "open") return false;
        if (!p.hours || !String(p.hours).trim()) return false;
        if (p.miles > state.radiusMiles + 0.05) return false;
        const key = String(p.name || "").toLowerCase() + "|" + Number(p.lat || 0).toFixed(3);
        if (seen.has(p.id) || seen.has(key)) return false;
        seen.add(p.id);
        seen.add(key);
        return true;
      })
      .sort((x, y) => (x.miles || 0) - (y.miles || 0));
  }

  function renderOpenStrip() {
    const wrap = $("#openStrip");
    const track = $("#openStripTrack");
    if (!wrap || !track) return;
    if (state.lat == null) {
      wrap.hidden = true;
      track.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    const open = openNowPlaces();
    if (!open.length) {
      track.innerHTML = state.loading
        ? `<p class="open-strip-empty">Checking OSM hours…</p>`
        : `<p class="open-strip-empty">No tagged open restaurants in this range.</p>`;
      return;
    }
    track.innerHTML = open
      .slice(0, 24)
      .map(
        (p) =>
          `<button type="button" class="open-pill" role="listitem" data-id="${escapeHtml(p.id)}"><span class="open-name">${escapeHtml(p.name)}</span><span class="open-mark">${p.hoursSource === "atp" ? "Chain hours" : "OSM hours"}</span></button>`
      )
      .join("");
  }

  function opensSoonPlaces() {
    return (state.places || []).filter(
      (p) =>
        p.opensSoon &&
        p.hours &&
        String(p.hours).trim() &&
        p.miles <= state.radiusMiles + 0.05
    );
  }

  function renderOpensSoonRail() {
    const wrap = $("#opensSoonStrip");
    const track = $("#opensSoonTrack");
    if (!wrap || !track) return;
    if (state.loading || state.lat == null) {
      wrap.hidden = true;
      track.innerHTML = "";
      return;
    }
    const soon = opensSoonPlaces();
    if (!soon.length) {
      wrap.hidden = true;
      track.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    track.innerHTML = soon
      .slice(0, 24)
      .map(
        (p) =>
          `<button type="button" class="open-pill opens-soon-pill" role="listitem" data-id="${escapeHtml(p.id)}"><span class="open-name">${escapeHtml(p.name)}</span><span class="open-mark">Opens soon · OSM hours</span></button>`
      )
      .join("");
  }

  function syncOpenNowChip() {
    const btn = $("#filterOpen");
    if (!btn) return;
    btn.hidden = false;
    btn.classList.toggle("active", !!state.filters.openNow);
  }

  function syncOsmTagChips() {
    const present = {};
    (state.places || []).forEach((p) => {
      Object.keys(TAG_PLACE_KEY).forEach((tag) => {
        if (p[TAG_PLACE_KEY[tag]]) present[tag] = true;
      });
    });
    $$("[data-tag]").forEach((btn) => {
      const key = btn.getAttribute("data-tag");
      if (!UI_PREFS_TAGS[key]) return;
      const show = !!present[key];
      btn.hidden = !show;
      if (!show && state.filters[key]) {
        state.filters[key] = false;
        btn.classList.remove("active");
      }
    });
    const group = document.querySelector(".filters-tags");
    if (group) {
      const any = Object.keys(UI_PREFS_TAGS).some((k) => present[k]);
      group.hidden = !any;
      const label = group.previousElementSibling;
      if (label && label.classList.contains("section-label")) label.hidden = !any;
      const wrap = group.closest(".filter-group");
      if (wrap) wrap.hidden = !any;
    }
  }

  function renderDietChips() {
    const wrap = $("#dietChips");
    const label = $("#dietChipsLabel");
    if (!wrap) return;
    const present = { vegan: 0, vegetarian: 0, gluten_free: 0, halal: 0 };
    (state.places || []).forEach((p) => {
      if (p.dietVegan) present.vegan++;
      if (p.dietVegetarian) present.vegetarian++;
      if (p.dietGlutenFree) present.gluten_free++;
      if (p.dietHalal) present.halal++;
    });
    const keys = Object.keys(UI_PREFS_DIET_OSM).filter((k) => present[k] > 0);
    // forge 20261003: an active diet filter whose chip is not shown can't be turned off; clear it.
    if (state.places && state.places.length && state.filters.diet) {
      let cleared = false;
      Object.keys(state.filters.diet).forEach((k) => {
        if (state.filters.diet[k] && !present[k]) { state.filters.diet[k] = false; cleared = true; }
      });
      if (cleared) persistUiPrefs();
    }
    if (!keys.length) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      if (label) label.hidden = true;
      return;
    }
    if (label) label.hidden = false;
    wrap.hidden = false;
    wrap.innerHTML = keys
      .map((k) => {
        const on = !!(state.filters.diet && state.filters.diet[k]);
        return `<button type="button" class="chip chip-diet${on ? " active" : ""}" data-diet="${escapeHtml(k)}">${escapeHtml(DIET_OSM_LABEL[k] || k)}</button>`;
      })
      .join("");
  }

  function renderFoodCategoryChips() {
    const wraps = $$("[data-food-cats]");
    if (!wraps.length) return;
    const hasPlaces = !!(state.places && state.places.length);
    const visible = [];
    if (hasPlaces) {
      for (let i = 0; i < FOOD_CATEGORIES.length; i++) {
        const cat = FOOD_CATEGORIES[i];
        const count = foodCategoryMatchCount(cat);
        if (count > 0) visible.push({ cat, count });
      }
    }
    if (
      hasPlaces &&
      state.filters.foodCategory &&
      !visible.some((row) => row.cat.id === state.filters.foodCategory)
    ) {
      state.filters.foodCategory = null;
      persistUiPrefs();
    }
    const selected = FOOD_CATEGORY_IDS[state.filters.foodCategory] ? state.filters.foodCategory : null;
    const html = visible
      .map((row) => {
        const cat = row.cat;
        const on = selected === cat.id;
        const countPart = row.count === 1 ? ", 1 place" : ", " + row.count + " places";
        return (
          `<button type="button" class="chip chip-food-cat${on ? " active" : ""}"` +
          ` data-food-cat="${escapeHtml(cat.id)}"` +
          ` aria-pressed="${on ? "true" : "false"}"` +
          ` aria-label="${escapeHtml(cat.label)}${escapeHtml(countPart)}">` +
          `<span class="cuisine-icon" aria-hidden="true">${foodCategoryIconSvg(cat.id)}</span>` +
          `<span class="cuisine-name">${escapeHtml(cat.label)}</span>` +
          `</button>`
        );
      })
      .join("");
    const show = visible.length > 0;
    wraps.forEach((wrap) => {
      wrap.hidden = !show;
      wrap.innerHTML = html;
    });
    const mainWrap = $("#foodCatWrap");
    if (mainWrap) mainWrap.hidden = !show;
    const sheetGroup = $("#foodCatFilterGroup");
    if (sheetGroup) sheetGroup.hidden = !show;
  }

  function renderCuisineChips() {
    const wrap = $("#cuisineChips");
    const label = $("#cuisineChipsLabel");
    if (!wrap) return;
    if (!state.lat || !(state.places && state.places.length)) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      if (label) label.hidden = true;
      return;
    }
    const counts = {};
    (state.places || []).forEach((p) => {
      cuisineTokens(p).forEach((c) => {
        const k = canonCuisine(c);
        if (!k) return;
        counts[k] = (counts[k] || 0) + 1;
      });
    });
    const keys = [];
    CUISINE_CANON.forEach((c) => {
      if (counts[c]) keys.push(c);
    });
    // forge 20261003: same for a cuisine filter with no chip in this area.
    if (state.filters.cuisine && !counts[canonCuisine(state.filters.cuisine)]) {
      state.filters.cuisine = null;
      persistUiPrefs();
    }
    Object.keys(counts)
      .sort()
      .forEach((c) => {
        if (CUISINE_CANON.indexOf(c) < 0) keys.push(c);
      });
    if (!keys.length) {
      wrap.hidden = true;
      wrap.innerHTML = "";
      if (label) label.hidden = true;
      if (state.filters.cuisine && !counts[canonCuisine(state.filters.cuisine)]) {
        state.filters.cuisine = null;
      }
      return;
    }
    if (label) label.hidden = false;
    wrap.hidden = false;
    wrap.innerHTML = keys
      .map((c) => {
        const on = canonCuisine(state.filters.cuisine) === c;
        const name = escapeHtml(cuisineLabel(c));
        return `<button type="button" class="chip chip-cuisine${on ? " active" : ""}" data-cuisine="${escapeHtml(c)}"><span class="cuisine-icon">${cuisineIconSvg(c)}</span><span class="cuisine-name">${name}</span></button>`;
      })
      .join("");
  }

  function renderList() {
    syncOpenNowChip();
    renderOpenStrip();
    renderOpensSoonRail();
    renderDietChips();
    renderFoodCategoryChips();
    renderCuisineChips();
    syncOsmTagChips();
    const ul = $("#placeList");
    const countEl = $("#resultCount");
    const dealCountEl = $("#dealCount");
    const list = filteredPlaces();
    const dealCount = list.filter((p) => !!p.deal).length;
    renderDealRail(list);
    syncTrustStrip();

    const nameWrap = $("#nameSearchWrap");
    if (nameWrap) nameWrap.hidden = !state.lat || !list.length;
    syncFiltersLaunch();
    if (countEl) {
      countEl.textContent = list.length
        ? `${list.length} restaurant${list.length === 1 ? "" : "s"}`
        : "";
    }
    if (dealCountEl) {
      if (dealCount > 0 && !state.loading) {
        dealCountEl.hidden = false;
        dealCountEl.textContent =
          dealCount === 1 ? "1 listing promo" : `${dealCount} listing promos`;
      } else {
        dealCountEl.hidden = true;
        dealCountEl.textContent = "";
      }
    }
    const dealNote = $("#dealNote") || document.querySelector(".deal-note");
    if (dealNote) dealNote.hidden = !(dealCount > 0 && !state.loading);

    if (!ul) return;

    if (state.loading && !state.places.length) {
      renderDealRail([]);
      ul.classList.remove("list-appear");
      setMapLoading(true);
      ul.innerHTML = `<li class="skeleton-block" aria-busy="true" aria-label="Finding food">
  <p class="skeleton-copy">Finding food…</p>
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>
  <div class="skeleton-card"></div>
</li>`;
      return;
    }
    setMapLoading(false);

    if (!state.lat) {
      renderDealRail([]);
      ul.classList.remove("list-appear");
      if (state.searchError) {
        ul.innerHTML = `<li class="empty"><strong>${escapeHtml(state.searchError)}</strong> We do not invent restaurants.</li>`;
        requestAnimationFrame(function () { renderMarkers([]); });
        return;
      }
      if (state.filters.saved) {
        const saved = readSaved();
        if (!saved.length) {
          ul.innerHTML = `<li class="empty"><strong>No saved restaurants on this device.</strong> Heart a restaurant to remember it here. No GPS trail.</li>`;
          requestAnimationFrame(function () { renderMarkers([]); });
          return;
        }
        ul.innerHTML = saved
          .map((s) => {
            const addr = s.address ? `<div class="place-meta">${escapeHtml(s.address)}</div>` : "";
            return `<li class="place-card" data-id="${escapeHtml(s.id)}" data-saved-only="1">
  <div class="place-top">
    <div class="place-main">
      <h3 class="place-name">${escapeHtml(s.name)}</h3>
      ${addr}
    </div>
    ${heartBtnHtml(s)}
  </div>
</li>`;
          })
          .join("");
        requestAnimationFrame(function () { renderMarkers([]); });
        return;
      }
      ul.innerHTML = `<li class="empty">Tap Locate Me or search any city. Any type of food.</li>`;
      requestAnimationFrame(function () { renderMarkers([]); });
      return;
    }

    if (!list.length) {
      renderDealRail([]);
      ul.classList.remove("list-appear");
      ul.innerHTML = state.searchError
        ? `<li class="empty"><strong>${escapeHtml(state.searchError)}</strong> We do not invent restaurants. Try again or search any city.</li>`
        : state.nameQuery.trim()
          ? `<li class="empty"><strong>No restaurants match that name in this list.</strong> Search food filters the current nearby list.</li>`
          : state.filters.saved
          ? (readSaved().length
              ? `<li class="empty"><strong>None of your saved restaurants are in this range.</strong> Widen it, or clear Saved.</li>`
              : `<li class="empty"><strong>No saved restaurants on this device.</strong> Heart a restaurant to remember it here. No GPS trail.</li>`)
          : state.filters.foodCategory
          ? `<li class="empty"><strong>No ${escapeHtml((foodCategoryById(state.filters.foodCategory) || {}).label || "that type")} in this range.</strong> Matches OpenStreetMap cuisine and amenity tags, plus a few name words. Tap the chip again to show all.</li>`
          : state.dietaryFilter === "freefood"
          ? `<li class="empty"><strong>No tagged pantries in this range.</strong> In this search area, food banks and soup kitchens show only when OpenStreetMap tags amenity=food_bank or soup_kitchen. Listings may be wrong or stale; confirm before you go.</li>`
          : state.filters.hasDeal
          ? `<li class="empty"><strong>No promo text here.</strong> Widen the range, or clear the promo filter.</li>`
          : (state.filters.openNow && state.places && state.places.length
          ? `<li class="empty"><strong>None tagged open.</strong> They show when OSM hours say open — verify.</li>`
          : `<li class="empty"><strong>No tagged food in this range.</strong> Search another city.</li>`);
      requestAnimationFrame(function () { renderMarkers([]); });
      return;
    }

    ul.innerHTML = list
      .map((p, idx) => {
        const links = mapsLinks(p);
        const typeBadge = `<span class="badge badge-type">${escapeHtml(amenityLabel(p.amenity))}</span>`;
        const dealBadge = p.deal
          ? `<button type="button" class="badge badge-deal" data-deal-open="${escapeHtml(p.id)}" title="${escapeHtml(p.deal.detail)}">${escapeHtml(p.deal.label)}</button>`
          : "";
        const sponsoredBadge = p.sponsored
          ? `<span class="badge badge-sponsored">Sponsored</span>`
          : "";
        let openBadge = "";
        if (p.hours && p.openStatus === "open" && p.closesSoon) openBadge = `<span class="badge badge-soon">Closes soon · verify</span>`;
        else if (p.hours && p.openStatus === "open") openBadge = `<span class="badge badge-open">Tagged open · verify</span>`;
        else if (p.hours && p.openStatus === "closed") openBadge = `<span class="badge badge-closed">Closed · verify</span>`;
        else if (p.hours && p.opensSoon) openBadge = "";
        const kitchenBadge = p.kitchenClosedDoorsOpen
          ? `<span class="badge badge-kitchen">Kitchen closed · OSM</span>`
          : "";
        const outdoorBadge = p.outdoorSeating ? `<span class="badge badge-tag">Outdoor seating</span>` : "";
        const wheelchairBadge = p.wheelchair ? `<span class="badge badge-tag">Wheelchair access · OSM tag · call to confirm</span>` : "";
        const takeoutBadge = p.takeout ? `<span class="badge badge-tag">Takeout</span>` : "";
        const deliveryBadge = p.delivery ? `<span class="badge badge-tag">Delivery · OSM tag · verify</span>` : "";
        const driveBadge = p.driveThru ? `<span class="badge badge-tag">Drive-thru</span>` : "";
        const restroomBadge = p.restroom ? `<span class="badge badge-tag">${escapeHtml("Restroom")}</span>` : "";
        const dogsBadge = p.dogsOk ? `<span class="badge badge-tag">${escapeHtml("Dogs OK")}</span>` : "";
        const acBadge = p.airConditioning ? `<span class="badge badge-tag">${escapeHtml("A/C")}</span>` : "";
        const changingBadge = p.changingTable ? `<span class="badge badge-tag">${escapeHtml("Changing table")}</span>` : "";
        const smokeBadge = p.smokeFree ? `<span class="badge badge-tag">${escapeHtml("No smoking")}</span>` : "";
        const kidsBadge = p.kidsArea ? `<span class="badge badge-tag">${escapeHtml("Kids area")}</span>` : "";
        const cuisine = p.cuisine
          ? escapeHtml(prettyCuisineList(p.cuisine) || amenityLabel(p.amenity))
          : escapeHtml(amenityLabel(p.amenity));
        const cardClass = p.deal ? "place-card has-deal" : "place-card";
        const dealCallout = p.deal
          ? `<div class="deal-callout" data-deal-open="${escapeHtml(p.id)}"><div class="deal-sample">From the listing. Confirm with the restaurant.</div><div class="deal-callout-detail">${escapeHtml(p.deal.detail)}</div></div>`
          : "";
        const plat = mapsPlatform();
        const appleHref = escapeHtml(links.apple);
        const googleHref = escapeHtml(links.google);
        const pid = escapeHtml(p.id);
        let primaryCta;
        let secondaryCta;
        if (plat === "apple" && links.apple) {
          primaryCta = `<a class="nav-btn primary-nav" href="${appleHref}" target="_blank" rel="noopener noreferrer" data-nav-deal="${pid}" data-maps-app="apple">Directions</a>`;
          secondaryCta = links.google
            ? `<a class="nav-btn" href="${googleHref}" target="_blank" rel="noopener noreferrer" data-nav-deal="${pid}" data-maps-app="google">Google Maps</a>`
            : "";
        } else if (plat === "android" && links.google) {
          primaryCta = `<a class="nav-btn primary-nav" href="${googleHref}" target="_blank" rel="noopener noreferrer" data-nav-deal="${pid}" data-maps-app="google">Directions</a>`;
          secondaryCta = links.apple
            ? `<a class="nav-btn" href="${appleHref}" target="_blank" rel="noopener noreferrer" data-nav-deal="${pid}" data-maps-app="apple">Apple Maps</a>`
            : "";
        } else {
          primaryCta = `<button type="button" class="nav-btn primary-nav" data-deal-open="${pid}">Directions</button>`;
          secondaryCta = `<button type="button" class="nav-btn" data-deal-open="${pid}">Listing</button>`;
        }
        const stagger = `style="--i:${Math.min(idx, 8)}"`;
        const contactHtml = contactBlockHtml(p);
        const reviewsHtml = reviewsBlockHtml(p);
        // forge 20261003 (Lens): Call / Menu / Website live once, in contactBlockHtml (no duplicate nav buttons).
        const addrCta = (p.address && String(p.address).trim())
          ? `<button type="button" class="nav-btn" data-copy-addr="${pid}">Copy address</button>`
          : "";
        let hoursLine = "";
        const hoursText = p.hours ? friendlyHoursLine(p) : "";
        if (hoursText && p.openStatus === "open") {
          hoursLine = `<div class="place-hours is-open">${escapeHtml(hoursText)}</div>`;
        } else if (hoursText && p.openStatus === "closed") {
          hoursLine = `<div class="place-hours is-closed">${escapeHtml(hoursText)}</div>`;
        } else if (hoursText) {
          // Tagged but outside the parser's subset: show the tag text, no open/closed guess.
          hoursLine = `<div class="place-hours is-raw">${escapeHtml(hoursText)}</div>`;
        } else {
          // No OSM opening_hours tag at all: never guess.
          hoursLine = `<div class="place-hours is-unknown">Hours not listed</div>`;
        }

        return `
<li class="${cardClass}" data-id="${escapeHtml(p.id)}" ${p.deal ? `data-has-deal="1"` : ""} ${stagger}>
  <div class="place-top">
    <div class="place-main">
      <h3 class="place-name">${escapeHtml(p.name)}</h3>
      <div class="place-meta">${cuisine}</div>
      ${p.street ? `<div class="place-addr">${escapeHtml(p.street)}</div>` : ""}
      ${hoursLine}
      <div class="badge-row">${dealBadge}${sponsoredBadge}${typeBadge}${openBadge}${kitchenBadge}${outdoorBadge}${wheelchairBadge}${takeoutBadge}${deliveryBadge}${driveBadge}${restroomBadge}${dogsBadge}${acBadge}${changingBadge}${smokeBadge}${kidsBadge}</div>
    </div>
    <div class="place-side">
      ${heartBtnHtml(p)}
      <div class="place-distance" title="Straight-line at 3 mph. Not a routed walk."><span class="dist-mi">${formatMiles(p.miles)}</span><span class="dist-walk">${escapeHtml(walkLabel(p.miles))}</span></div>
    </div>
  </div>
  ${dealCallout}
  ${disclaimerLinesHtml(p)}
  ${contactHtml}
  <div class="nav-row">
    ${primaryCta}
    ${secondaryCta}
    ${addrCta}
    <button type="button" class="nav-btn" data-share="${pid}">Share</button>
  </div>
  ${reviewsHtml}
</li>`;
      })
      .join("");

    // Privacy-safe deal impressions (once per deal_id / session)
    list.forEach((p, i) => {
      if (!p.deal) return;
      const a = analytics();
      if (a) a.dealImpression(p.id, i, state.radiusMiles);
    });

    // List first. Pins/tiles are independent — never wait on tileload.
    ul.classList.remove("list-appear");
    void ul.offsetWidth;
    ul.classList.add("list-appear");
    requestAnimationFrame(function () {
      renderMarkers(state.lat ? list : []);
    });
  }

  function findPlaceById(id) {
    return state.places.find((p) => p.id === id) || filteredPlaces().find((p) => p.id === id);
  }

  function directionsBlockHtml(place) {
    const links = mapsLinks(place);
    const id = escapeHtml(place.id);
    const apple = escapeHtml(links.apple || "");
    const google = escapeHtml(links.google || "");
    const appleBtn = apple
      ? `<a class="nav-btn dir-btn" href="${apple}" target="_blank" rel="noopener noreferrer" data-nav-deal="${id}" data-maps-app="apple">Directions (Apple)</a>`
      : "";
    const googleBtn = google
      ? `<a class="nav-btn dir-btn" href="${google}" target="_blank" rel="noopener noreferrer" data-nav-deal="${id}" data-maps-app="google">Directions (Google)</a>`
      : "";
    if (!appleBtn && !googleBtn) return "";
    return `<div class="dir-row" role="group" aria-label="Directions">${appleBtn}${googleBtn}</div>
<p class="dir-note">Directions use the map pin.</p>`;
  }

  function specialsBlockHtml(place) {
    if (place.deal && place.deal.label) {
      return `<div class="deal-sheet-detail">
  <div class="deal-sample">From the listing. Confirm with the restaurant.</div>
  <div class="deal-callout-detail">${escapeHtml(place.deal.label)}</div>
  <div class="deal-callout-detail">${escapeHtml(place.deal.detail || "")}</div>
</div>
<p class="deal-sheet-disclosure">This copies listing text. Confirm with the restaurant. Not a live coupon, and not a promise it works at the register.</p>
<button type="button" class="nav-btn deal-cta use-special-btn" data-use-special="${escapeHtml(place.id)}">Copy listing text</button>
<p class="use-special-status" id="useSpecialStatus" hidden>Copied. Confirm with the restaurant.</p>
<p class="specials-add"><a href="specials.html">Restaurants: add yours</a></p>`;
    }
    return `<div class="no-special">
  <p class="no-special-title">No special on file</p>
  <p class="no-special-copy">No listed promo on this restaurant.</p>
  <p><a href="specials.html">Restaurants: add yours</a></p>
</div>`;
  }

  function copyAddress(place, btn) {
    const addr = String((place && place.address) || "").trim();
    if (!addr) return;
    const done = function () {
      if (!btn) return;
      const prev = btn.getAttribute("data-copy-label") || "Copy address";
      btn.setAttribute("data-copy-label", prev);
      btn.textContent = "Copied";
      setTimeout(function () {
        if (btn) btn.textContent = prev;
      }, 1200);
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(addr).then(done, function () {});
    }
  }

  function cityShareUrl() {
    const q = (uiPrefs.lastPlaceQuery || "").trim();
    try {
      const u = new URL(window.location.origin + "/");
      if (q) u.searchParams.set("q", q);
      return u.toString();
    } catch (_) {
      return window.location.origin + "/";
    }
  }

  function rememberCityInUrl(q) {
    const t = sanitizePlaceQuery(q);
    if (!t) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("q", t);
      u.hash = "";
      history.replaceState({}, "", u);
    } catch (_) {}
  }

  function sharePlace(place) {
    if (!place) return;
    const title = place.name || "RangeBites";
    const text = place.deal && place.deal.label
      ? title + " — " + place.deal.label
      : title + " — food near you";
    const url = cityShareUrl();
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text + " " + url).then(function () {
        setStatus("Link copied · " + title);
      }, function () {});
    }
  }

  function useThisSpecial(place) {
    if (!place || !place.deal) return;
    const text = [place.deal.label, place.deal.detail].filter(Boolean).join("\n");
    const afterCopy = function () {
      const status = $("#useSpecialStatus");
      if (status) {
        status.hidden = false;
        status.textContent = "Copied — confirm with the restaurant.";
      }
      const web = /example\.com/i.test(place.website || "") ? "" : absoluteUrl(place.website);
      const tel = isFakeDemoPhone(place.phone) ? "" : telHref(place.phone);
      if (web) {
        try {
          window.open(web, "_blank", "noopener,noreferrer");
        } catch (_) {}
      } else if (tel) {
        window.location.href = tel;
      }
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(afterCopy, afterCopy);
    } else {
      afterCopy();
    }
  }

  function openDealSheet(place, opts) {
    if (!place) return;
    opts = opts || {};
    highlightPlace(place.id, { openPopup: false, scrollCard: true, pan: true });
    if (place.deal) {
      metricsHit("deal");
      const aTap = analytics();
      if (aTap) aTap.dealTapped(place.id, dealListPosition(place.id), state.radiusMiles, place.deal);
    }
    if (opts.startDirections) startPlatformDirections(place);
    const body = $("#dealSheetBody");
    const title = $("#dealSheetTitle");
    if (title) title.textContent = place.deal ? "Promo text" : "Place";
    const sponsored = place.sponsored
      ? `<span class="badge badge-sponsored" style="margin-left:6px">Sponsored</span>`
      : "";
    const dealLabel = place.deal
      ? `<span class="deal-sheet-label">${escapeHtml(place.deal.label)}</span>${sponsored}`
      : sponsored;

    const tagBits = [];
    if (place.hours && place.opensSoon) tagBits.push("Opens soon · OSM hours");
    if (place.kitchenClosedDoorsOpen) tagBits.push("Kitchen closed · OSM");
    if (place.outdoorSeating) tagBits.push("Outdoor seating");
    if (place.wheelchair) tagBits.push("Wheelchair access · OSM tag · call to confirm");
    if (place.takeout) tagBits.push("Takeaway");
    if (place.delivery) tagBits.push("Delivery · OSM tag · verify");
    if (place.driveThru) tagBits.push("Drive-through");
    if (place.restroom) tagBits.push("Restroom");
    if (place.dogsOk) tagBits.push("Dogs OK");
    if (place.airConditioning) tagBits.push("A/C");
    if (place.changingTable) tagBits.push("Changing table");
    if (place.smokeFree) tagBits.push("No smoking");
    if (place.kidsArea) tagBits.push("Kids area");
    if (place.hours && place.openStatus === "open" && place.closesSoon) tagBits.push("Closes soon · OSM hours · verify");
    const tagLine = tagBits.length
      ? `<div class="badge-row sheet-tags">${tagBits.map((b) => `<span class="badge badge-tag">${escapeHtml(b)}</span>`).join("")}</div>`
      : "";
    body.innerHTML =
      dealLabel +
      `<div class="sheet-place-row"><h3 class="deal-sheet-place" id="dealSheetPlace">${escapeHtml(place.name)}</h3>${heartBtnHtml(place)}</div>` +
      `<div class="deal-sheet-meta"><strong class="sheet-dist">${formatMiles(place.miles)}</strong> · ${escapeHtml(walkLabel(place.miles))} · ${escapeHtml(amenityLabel(place.amenity))}</div>` +
      tagLine +
      directionsBlockHtml(place) +
      specialsBlockHtml(place) +
      contactBlockHtml(place) +
      reviewsBlockHtml(place);

    $("#dealBackdrop").hidden = false;
    $("#dealBackdrop").classList.add("open");
    $("#dealSheet").classList.add("open");
    setSheetHidden($("#dealSheet"), false);
    document.body.style.overflow = "hidden";
  }

  function closeDealSheet() {
    $("#dealBackdrop").classList.remove("open");
    $("#dealSheet").classList.remove("open");
    setSheetHidden($("#dealSheet"), true);
    $("#dealBackdrop").hidden = true;
    if (!$("#aboutSheet").classList.contains("open")) {
      document.body.style.overflow = "";
    }
  }

  /* ---------- forge 20261003: Gavel disclaimer slots (text lives in disclaimers.js) ---------- */

  function disclaimerText(key, fallback) {
    const d = window.RB_DISCLAIMERS;
    const v = d && typeof d[key] === "string" ? d[key].trim() : "";
    return v || fallback || "";
  }

  function disclaimerLinesHtml(p) {
    const lines = [];
    if (p && p.freeFood) {
      lines.push(`<div class="card-disclaimer pantry-caveat">${escapeHtml(disclaimerText("pantryCard", "Hours, eligibility & supply vary · call the pantry first"))}</div>`);
    } else if (p && p.deal) {
      lines.push(`<div class="card-disclaimer">${escapeHtml(disclaimerText("dealCard", "Promo from the listing · confirm before you order"))}</div>`);
    } else {
      const t = disclaimerText("placeCard", "");
      if (t) lines.push(`<div class="card-disclaimer">${escapeHtml(t)}</div>`);
    }
    return lines.join("");
  }

  const NOTICE_KEY = "rb_notice_seen";
  function maybeShowFirstSearchNotice() {
    const el = $("#firstSearchNotice");
    if (!el) return;
    let seen = false;
    try { seen = localStorage.getItem(NOTICE_KEY) === "1"; } catch (_) {}
    if (seen) { el.hidden = true; return; }
    const txt = $("#firstSearchNoticeText");
    if (txt && window.RB_DISCLAIMERS && window.RB_DISCLAIMERS.firstSearchNoticeHtml) {
      txt.innerHTML = window.RB_DISCLAIMERS.firstSearchNoticeHtml; // static string from our own file, not data
    }
    el.hidden = false;
  }
  function dismissFirstSearchNotice() {
    const el = $("#firstSearchNotice");
    if (el) el.hidden = true;
    try { localStorage.setItem(NOTICE_KEY, "1"); } catch (_) {}
    const list = $("#placeList");
    if (list) { try { list.focus({ preventScroll: true }); } catch (_) {} }
  }

  /* ---------- forge 20261003: resolved-place line (shows what the geocoder picked) ---------- */

  function normWord(s) {
    return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  /** True when the geocoder's place name does not match what was typed (likely a typo or wrong match). No network. */
  function geocodeLooksDifferent(typed, hit) {
    const t = normWord(String(typed || "").split(",")[0]);
    const name = normWord(hit && (hit.name || String(hit.display_name || "").split(",")[0]));
    if (!t || !name || looksLikePostal(typed)) return false;
    const tFirst = t.replace(/\b(va|virginia|usa|us)\b/g, "").trim();
    if (!tFirst) return false;
    return !(name === tFirst || name.indexOf(tFirst) === 0 || tFirst.indexOf(name) === 0);
  }
  function setNearLine(text, warn) {
    const el = $("#nearLine");
    if (!el) return;
    if (!text) { el.hidden = true; el.textContent = ""; el.classList.remove("is-warn"); return; }
    el.textContent = text;
    el.classList.toggle("is-warn", !!warn);
    el.hidden = false;
  }

  /** forge 20261003 (QA #1): a new area starts with no food/cuisine/diet chip carried over. */
  function resetFoodChipsForNewArea() {
    let changed = false;
    if (state.filters.foodCategory) { state.filters.foodCategory = null; changed = true; }
    if (state.filters.cuisine) { state.filters.cuisine = null; changed = true; }
    const d = state.filters.diet || {};
    Object.keys(d).forEach((k) => { if (d[k]) { d[k] = false; changed = true; } });
    if (changed) persistUiPrefs();
    return changed;
  }

  /* ---------- Search / locate ---------- */

  function applyPlaces(places, { live, statusMsg, fetchedRadius } = {}) {
    state.places = places || [];
    if (atpIndex) applyAtpHours(state.places);
    else {
      const batch = state.places;
      loadAtpHours().then(() => {
        if (state.places === batch && applyAtpHours(batch)) {
          renderList();
          try { renderMarkers(filteredPlaces()); } catch (_) {}
        }
      });
    }
    if (live && state.places.length) {
      // "Devices that found food": once per device, only after real results. Sends {"kind":"found"} only (no code, no coords).
      try { if (window.RangeBitesMetrics && window.RangeBitesMetrics.markHelped) window.RangeBitesMetrics.markHelped(); } catch (_) {}
    }
    state.loading = false;
    if (fetchedRadius != null) state.fetchedRadiusMiles = fetchedRadius;
    try {
      document.documentElement.classList.toggle("has-places", !!(state.places && state.places.length));
    } catch (_) {}
    maybeShowA2hs();
    hideHeroTip(true);
    if (live && state.places.length) maybeShowFirstSearchNotice();
    // Paint list immediately. Map tiles/pins are independent and must not delay cards.
    renderList();
    const shown = filteredPlaces().length;
    const deals = filteredPlaces().filter((p) => !!p.deal).length;
    const dealsHint = deals > 0 ? " · Promo text up top" : "";
    const aSearch = analytics();
    if (aSearch) aSearch.searchCompleted(state.radiusMiles, shown);
    if (statusMsg) {
      setStatus(statusMsg + (statusMsg.includes("Promo text up top") ? "" : dealsHint));
      return;
    }
    if (live) {
      if (!shown && places.length) {
        setStatus(state.filters.openNow
          ? "None tagged open. They show when OSM hours say open — verify."
          : "No tagged food in this range.");
      } else if (!shown) {
        setStatus("No tagged food in this range.");
      } else {
        setStatus(
          shown + (state.filters.openNow ? " tagged open" : " nearby") +
            (places.length >= MAX_RESULTS ? " · nearest " + MAX_RESULTS : "") +
            dealsHint
        );
      }
    } else {
      setStatus("Couldn’t reach OpenStreetMap. Try again.");
    }
  }

  function stillActiveSearch(gen, lat, lng) {
    // Superseded by a newer search, or wiped after loading finished
    if (gen !== state.searchGen) return false;
    if (state.lat == null || state.lng == null) return false;
    // Coords should still match this search origin
    if (state.lat !== lat || state.lng !== lng) return false;
    return true;
  }

  const LOCATE_DEFAULT_LABEL = "Locate Me";

  function setLocateBusy(phase) {
    const btn = $("#locateBtn");
    const label = $("#locateBtnLabel");
    if (btn) {
      btn.disabled = !!phase;
      btn.classList.toggle("busy", !!phase);
      btn.setAttribute("aria-busy", phase ? "true" : "false");
    }
    const searchBtn = $("#placeSearchBtn");
    if (searchBtn) searchBtn.disabled = !!phase;
    if (label) {
      if (phase === "locating") label.textContent = "Locating…";
      else if (phase === "searching") label.textContent = "Searching…";
      else label.textContent = LOCATE_DEFAULT_LABEL;
    }
  }

  async function runSearch(lat, lng, { glow, placeLabel } = {}) {
    const gen = ++state.searchGen;
    state.lat = lat;
    state.lng = lng;
    state.loading = true;
    showBanner("#privacyBanner", true);
    updateMapCenter(lat, lng, state.radiusMiles);
    if (glow) triggerLocateGlow();
    renderList();
    setStatus("Searching…");

    setLocateBusy("searching");
    state.searchError = null;

    const slowTimer = setTimeout(() => {
      if (stillActiveSearch(gen, lat, lng) && state.loading) {
        setStatus("OpenStreetMap is slow… still searching");
      }
    }, OVERPASS_SLOW_MS);

    // Mobile failsafe: never leave "Finding food…" skeleton if fetch hangs past abort.
    const failSafe = setTimeout(() => {
      if (gen !== state.searchGen) return;
      if (!state.loading) return;
      state.loading = false;
      setLocateBusy(null);
      if (state.places && state.places.length) {
        setStatus(filteredPlaces().length + " nearby");
        renderList();
        return;
      }
      state.searchError = "OpenStreetMap timed out. Try again.";
      setStatus(state.searchError);
      renderList();
    }, OVERPASS_CLIENT_ABORT_MS + 4000); // fast and full now run in parallel

    const fetchMi = state.radiusMiles;

    try {
      // Progressive: inner ring and full radius start together (forge 20261003, Chip). The inner ring
      // usually lands first and paints cards; the full pass replaces it. Worst case is one full abort
      // (~22 s) instead of fast abort + full abort in series (~34 s). Same two POSTs per search.
      let fullSettled = false;
      let fastP = Promise.resolve([]);
      if (fetchMi > FAST_RING_MILES) {
        fastP = fetchPlaces(lat, lng, FAST_RING_MILES, { mode: "fast" }).catch(() => []);
        fastP.then((near) => {
          if (fullSettled || !stillActiveSearch(gen, lat, lng) || !near.length) return;
          applyPlaces(near, { live: true, fetchedRadius: FAST_RING_MILES });
          setStatus(filteredPlaces().length + " nearby · widening to " + formatRadiusChipLabel(fetchMi) + "…");
        });
      }
      let places;
      try {
        places = await fetchPlaces(lat, lng, fetchMi, { mode: "full" });
      } finally {
        fullSettled = true;
      }
      if (!stillActiveSearch(gen, lat, lng)) return;
      state.searchError = null;
      state.fetchedRadiusMiles = fetchMi;
      if (!places.length) {
        if (state.places && state.places.length) {
          state.loading = false;
          setStatus(filteredPlaces().length + " nearby");
          return;
        }
        applyPlaces([], {
          live: true,
          fetchedRadius: fetchMi,
          statusMsg: "No tagged food in this range.",
        });
        return;
      }
      applyPlaces(places, { live: true, fetchedRadius: fetchMi });
    } catch (err) {
      if (!stillActiveSearch(gen, lat, lng)) return;
      // Full pass failed. If the inner ring is still in flight, give it its own (<= 12 s) chance.
      if (!(state.places && state.places.length)) {
        const near = await fastP;
        if (!stillActiveSearch(gen, lat, lng)) return;
        if (near && near.length) applyPlaces(near, { live: true, fetchedRadius: FAST_RING_MILES });
      }
      if (state.places && state.places.length) {
        state.loading = false;
        state.fetchedRadiusMiles = FAST_RING_MILES;
        setStatus(filteredPlaces().length + " within " + formatRadiusChipLabel(FAST_RING_MILES) +
          " · couldn’t load the full " + formatRadiusChipLabel(fetchMi) + ". Try again.");
        return;
      }
      const why = overpassErrorMessage(err);
      state.searchError = why;
      applyPlaces([], { live: false, statusMsg: why });
      console.warn("Search failed; no fallback places", err && err.name);
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(failSafe);
      if (state.searchGen === gen) {
        setLocateBusy(null);
        // Never stick on skeleton after this search ends (iOS hang / early return).
        if (state.loading) {
          state.loading = false;
          try { renderList(); } catch (_) {}
        }
      }
    }
  }

  let cityInFlight = null; // forge 20261003: ignore a repeat submit of the same text while it runs
  async function searchCityOrZip(raw) {
    cancelPlaceSuggest();
    const q = sanitizePlaceQuery(raw);
    if (!q) {
      setStatus("Type any city.");
      return;
    }
    if (cityInFlight && cityInFlight.q.toLowerCase() === q.toLowerCase() && cityInFlight.gen === state.searchGen) return;
    const gen = ++state.searchGen;
    cityInFlight = { q, gen };
    // forge 20261003 (Gate G1): chips, the near line and the map stay as they are until the lookup succeeds.
    metricsHit("place-search");
    state.loading = true;
    state.searchError = null;
    renderList();
    setLocateBusy("searching");
    setStatus("Looking up that city…");
    try {
      const hit = await geocodePlace(q);
      if (gen !== state.searchGen) return;
      if (!hit) {
        cityInFlight = null;
        state.loading = false;
        state.searchError = "No match for that city.";
        setLocateBusy(null);
        setStatus(state.searchError);
        renderList();
        return;
      }
      resetFoodChipsForNewArea();
      applyUnitsFromGeocode(hit);
      const near = hit.alternates && hit.alternates.length
        ? geocodeShortLabel(hit)
        : shortPlaceLabel(hit.label || hit.display_name, q);
      uiPrefs.lastPlaceQuery = q;
      persistUiPrefs();
      syncLastPlaceControl();
      // forge 20261003 (Shade): the city is no longer written into the address bar (?q=).
      // Inbound shared links with ?q= still work; Share still builds its own link.
      const off = geocodeLooksDifferent(q, hit);
      setNearLine(off
        ? "Showing results near " + near + " · not what you meant? Check the spelling or add the state."
        : "Showing results near " + near, off);
      renderPlaceAlternates(hit.alternates, Object.assign({}, hit, { shortLabel: near }));
      setStatus("Searching near " + near + "…");
      cityInFlight = null;
      await runSearch(hit.lat, hit.lng, { glow: false, placeLabel: near });
    } catch (err) {
      cityInFlight = null;
      if (gen !== state.searchGen) return;
      state.loading = false;
      const why = cityLookupErrorMessage(err);
      // forge 20261003 (Gate G1): keep the current map and cards. Only show the error in the list when
      // there is nothing else to show.
      state.searchError = state.places && state.places.length ? null : why;
      setLocateBusy(null);
      setStatus(why);
      renderList();
    }
  }

  function cityLookupErrorMessage(err) {
    if (err && err.busy) return "OpenStreetMap is busy. Try again in a moment.";
    if (err && err.name === "AbortError") return "OpenStreetMap is busy (city lookup timed out). Try again in a moment.";
    return "Couldn’t look up that city. Try again.";
  }

  /** forge 20261003 (Gate G2): "Also: Bristol, TN · …" buttons. Picking one searches its coordinates
   * directly from the earlier response, so it makes no Nominatim call. */
  let placeAlternates = [];
  let placeAltCurrent = null; // the place the alternates were offered against, so it can be picked back
  function renderPlaceAlternates(list, current) {
    placeAltCurrent = current || null;
    placeAlternates = Array.isArray(list) ? list.slice() : [];
    const el = $("#placeAlts");
    if (!el) return;
    if (!placeAlternates.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.innerHTML = `<span class="place-alts-label">Other places with this name:</span> ` + placeAlternates
      .map((a, i) => `<button type="button" class="place-alt" data-alt="${i}">${escapeHtml(a.shortLabel || a.label)}</button>`)
      .join(" ");
    el.hidden = false;
  }
  function pickPlaceAlternate(i) {
    const alt = placeAlternates[i];
    if (!alt) return;
    const rest = placeAlternates.filter((_, k) => k !== i);
    if (placeAltCurrent) rest.unshift(placeAltCurrent);
    state.searchGen++;
    resetFoodChipsForNewArea();
    applyUnitsFromGeocode(alt);
    const near = alt.shortLabel || shortPlaceLabel(alt.label, "");
    uiPrefs.lastPlaceQuery = near;
    persistUiPrefs();
    syncLastPlaceControl();
    const input = $("#placeSearch");
    if (input) input.value = near;
    setNearLine("Showing results near " + near, false);
    renderPlaceAlternates(rest, alt);
    setStatus("Searching near " + near + "…");
    runSearch(alt.lat, alt.lng, { glow: false, placeLabel: near });
  }

  function geoErrorMessage(err) {
    const code = err && err.code;
    if (code === 1) return "Location is blocked for this site. Allow it in your browser or phone settings, or search any city.";
    if (code === 2) return "Your device couldn’t find a location right now. Try again, or search any city.";
    if (code === 3) return "Location timed out. Try again, or search any city.";
    return "Couldn’t get your location. Try again, or search any city.";
  }

  function canUseGeolocation() {
    if (!navigator.geolocation) return false;
    // Browsers require a secure context (https or localhost). Don't pretend GPS works.
    if (!window.isSecureContext) return false;
    return true;
  }

  function isLocalhostHost() {
    const h = (location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function maybeShowInsecureBanner() {
    // Secure contexts (incl. localhost http) are fine; warn only when geo cannot work.
    if (!window.isSecureContext && !isLocalhostHost()) {
      showBanner("#insecureBanner", true);
    }
  }

  function locateMe() {
    const btn = $("#locateBtn");
    if (btn && btn.disabled) return; // prevent double-taps while busy

    metricsHit("locate");
    const aReq = analytics();
    if (aReq) aReq.locateMeRequested("button");

    state.loading = true;
    renderList();
    setLocateBusy("locating");
    setStatus("Locating…");

    if (!canUseGeolocation()) {
      if (!navigator.geolocation) {
        setStatus("Geolocation not supported on this device.");
      } else {
        setStatus("Location needs https or localhost.");
        maybeShowInsecureBanner();
      }
      const aErr = analytics();
      if (aErr) aErr.locateMeResult("error");
      setLocateBusy(null);
      state.loading = false;
      renderList();
      return;
    }

    const locateGen = ++state.searchGen;
    resetFoodChipsForNewArea();
    setNearLine("");
    renderPlaceAlternates([]);
    setStatus("Asking for location (when-in-use only)…");
    const locateSlow = setTimeout(() => {
      if (locateGen === state.searchGen) setStatus("Location is taking a moment…");
    }, 4000);
    // forge 20261003: an unanswered permission prompt never calls back; don't leave the button stuck.
    const locateFailsafe = setTimeout(() => {
      if (locateGen !== state.searchGen || !state.loading) return;
      state.searchGen += 1; // ignore a late callback
      setStatus("No answer from location yet. Tap Locate Me again, or search any city.");
      setLocateBusy(null);
      state.loading = false;
      renderList();
    }, 30000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (locateGen !== state.searchGen) return;
        clearTimeout(locateSlow);
        clearTimeout(locateFailsafe);
        setNearLine("Showing results near your location");
        const aOk = analytics();
        if (aOk) aOk.locateMeResult("granted");
        try {
          const u = new URL(window.location.href);
          if (u.searchParams.has("q")) {
            u.searchParams.delete("q");
            u.hash = "";
            history.replaceState({}, "", u);
          }
        } catch (_) {}
        runSearch(pos.coords.latitude, pos.coords.longitude, { glow: true });
      },
      (err) => {
        if (locateGen !== state.searchGen) return;
        clearTimeout(locateSlow);
        clearTimeout(locateFailsafe);
        // Do not log position details that might include coords
        console.warn("Geolocation unavailable", err && err.code);
        const aFail = analytics();
        if (aFail) aFail.locateMeResult(err && err.code === 1 ? "denied" : "error");
        setStatus(geoErrorMessage(err));
        setLocateBusy(null);
        state.loading = false;
        renderList();
      },
      {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 60000,
      }
    );
  }

  /* ---------- Privacy: wipe in-memory location ---------- */

  function wipeLocationState() {
    state.searchGen += 1; // invalidate in-flight Overpass upgrades
    state.lat = null;
    state.lng = null;
    state.places = [];
    state.loading = false;
    state.searchError = null;
    state.fetchedRadiusMiles = null;
    // Wipe GPS + places only. Keep UI prefs (range, filters, city/zip text).
    clearMapLayers();
    if (typeof markerById !== "undefined") markerById.clear();
    if (typeof clearCardSelection === "function") clearCardSelection();
    showBanner("#privacyBanner", false);
    closeDealSheet();
    setLocateBusy(null);
    syncDietChipsUI();
    syncTrustStrip();
    const railWrap = $("#dealRailWrap");
    if (railWrap) {
      railWrap.hidden = true;
      const rail = $("#dealRail");
      if (rail) rail.innerHTML = "";
    }
    if (typeof renderList === "function") {
      try {
        renderList();
      } catch (_) {
        /* map may already be gone */
      }
    }
    setNearLine("");
    renderPlaceAlternates([]);
    setStatus("Cleared · tap Locate Me");
  }

  /* ---------- About ---------- */

  function openAbout() {
    $("#aboutBackdrop").hidden = false;
    $("#aboutBackdrop").classList.add("open");
    $("#aboutSheet").classList.add("open");
    setSheetHidden($("#aboutSheet"), false);
    document.body.style.overflow = "hidden";
  }

  function closeAbout() {
    $("#aboutBackdrop").classList.remove("open");
    $("#aboutSheet").classList.remove("open");
    setSheetHidden($("#aboutSheet"), true);
    $("#aboutBackdrop").hidden = true;
    if (!$("#dealSheet").classList.contains("open")) {
      document.body.style.overflow = "";
    }
  }

  /* ---------- Onboarding (UI pref on this device; no location) ---------- */

  function onboardDismissed() {
    return !!uiPrefs.onboardDismissed;
  }

  function setOnboardDismissed() {
    uiPrefs.onboardDismissed = true;
    persistUiPrefs();
  }

  function hideOnboarding() {
    const el = $("#onboarding");
    if (!el) return;
    el.classList.remove("show");
    el.hidden = true;
  }

  function showOnboarding() {
    hideOnboarding();
  }

  /* ---------- Bind ---------- */

  /* 20260830d-units: city typeahead + km/mi */
  let suggestTimer = null;
  let suggestAbort = null;

  const PLACE_HINT_CITIES = [
    "Tokyo", "London", "Osaka", "Austin", "Cincinnati", "Nairobi",
    "Paris", "Seoul", "Sydney", "Berlin", "Bangkok", "Madrid",
    "Toronto", "Chicago", "Rome", "Lisbon", "Dublin", "Singapore",
    "Mumbai", "Cape Town", "Buenos Aires", "Mexico City", "Kyoto",
    "Amsterdam", "Barcelona", "Denver", "Miami", "Honolulu",
    "Atlanta", "Seattle", "New Orleans", "Montreal", "Taipei"
  ];

  function pickPlaceHint() {
    const pool = PLACE_HINT_CITIES.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[k];
      pool[k] = tmp;
    }
    // forge 20261003 (Lens): one short hint so it fits the phone field (was three cities, cut off).
    return "City or ZIP, e.g. " + pool[0];
  }

  function applyPlaceHint() {
    const input = document.getElementById("placeSearch");
    if (!input) return;
    const hint = pickPlaceHint();
    // Very narrow fields get the shortest hint.
    input.placeholder = input.clientWidth && input.clientWidth < 200 ? "City or ZIP" : hint;
  }

  function hidePlaceSuggest() {
    const ul = $("#placeSuggest");
    if (!ul) return;
    ul.hidden = true;
    ul.innerHTML = "";
  }

  /** Search submitted: drop pending/in-flight suggestions so the dropdown never reopens over results. */
  function cancelPlaceSuggest() {
    if (suggestTimer) {
      clearTimeout(suggestTimer);
      suggestTimer = null;
    }
    if (suggestAbort) {
      try { suggestAbort.abort(); } catch (_) {}
      suggestAbort = null;
    }
    hidePlaceSuggest();
  }

  function shortenSuggestName(displayName) {
    const parts = String(displayName || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!parts.length) return "";
    if (parts.length <= 3) return parts.join(", ");
    return [parts[0], parts[1], parts[parts.length - 1]].join(", ");
  }

  function renderPlaceSuggest(hits) {
    const ul = $("#placeSuggest");
    if (!ul) return;
    const list = Array.isArray(hits) ? hits.slice(0, 5) : [];
    if (!list.length) {
      hidePlaceSuggest();
      return;
    }
    ul.innerHTML = list
      .map((h) => {
        const label = shortenSuggestName(h.display_name) || String(h.display_name || "").slice(0, 80);
        const q = sanitizePlaceQuery(label) || sanitizePlaceQuery(h.display_name);
        return `<li role="option"><button type="button" class="place-suggest-item" data-q="${escapeHtml(q)}">${escapeHtml(label)}</button></li>`;
      })
      .join("");
    ul.hidden = false;
  }

  async function fetchPlaceSuggest(q) {
    const t = String(q || "").trim();
    if (t.length < 3) {
      hidePlaceSuggest();
      return;
    }
    if (suggestAbort) {
      try { suggestAbort.abort(); } catch (_) {}
    }
    const ac = new AbortController();
    suggestAbort = ac;
    const params = new URLSearchParams();
    params.set("format", "jsonv2");
    params.set("limit", "5");
    params.set("addressdetails", "1");
    if (!looksLikePostal(t)) params.set("featureType", "settlement");
    params.set("q", t);
    try {
      const res = await fetch(NOMINATIM_URL + "?" + params.toString(), {
        headers: { Accept: "application/json" },
        referrerPolicy: "origin",
        signal: ac.signal,
      });
      if (!res.ok) {
        hidePlaceSuggest();
        return;
      }
      const data = await res.json();
      if (suggestAbort !== ac) return;
      if (!data || !data.length) {
        hidePlaceSuggest();
        return;
      }
      renderPlaceSuggest(data);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      hidePlaceSuggest();
    }
  }

  function schedulePlaceSuggest(q) {
    if (suggestTimer) {
      clearTimeout(suggestTimer);
      suggestTimer = null;
    }
    // forge 20261003 (Snitch/Shade): no Nominatim autocomplete. The OSMF usage policy forbids
    // search-as-you-type, so the geocoder is called only on Search / Enter. fetchPlaceSuggest is unused.
    void q;
    hidePlaceSuggest();
  }

  function syncPlaceClear() {
    const input = $("#placeSearch");
    const btn = $("#placeSearchClear");
    if (!btn || !input) return;
    btn.hidden = !String(input.value || "").length;
  }

  function clearPlaceSearch() {
    const input = $("#placeSearch");
    if (input) {
      input.value = "";
      input.focus();
    }
    hidePlaceSuggest();
    syncPlaceClear();
  }

  function bindPlaceAlternates() {
    const el = $("#placeAlts");
    if (!el || el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", (e) => {
      const b = e.target.closest(".place-alt");
      if (!b) return;
      pickPlaceAlternate(parseInt(b.getAttribute("data-alt"), 10));
    });
  }

  function bindPlaceSuggest() {
    const input = $("#placeSearch");
    const ul = $("#placeSuggest");
    const clearBtn = $("#placeSearchClear");
    if (!input) return;
    applyPlaceHint();
    syncPlaceClear();
    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearPlaceSearch();
      });
    }
    input.addEventListener("input", () => {
      syncPlaceClear();
      schedulePlaceSuggest(input.value);
    });
    input.addEventListener("search", () => {
      syncPlaceClear();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hidePlaceSuggest();
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      setTimeout(hidePlaceSuggest, 180);
    });
    if (ul) {
      ul.addEventListener("mousedown", (e) => {
        const btn = e.target.closest(".place-suggest-item");
        if (!btn) return;
        e.preventDefault();
        const q = btn.getAttribute("data-q") || btn.textContent || "";
        input.value = q;
        hidePlaceSuggest();
        syncPlaceClear();
        searchCityOrZip(q);
      });
    }
  }

  function bindUI() {
    $("#locateBtn").addEventListener("click", () => {
      cancelPlaceSuggest();
      locateMe();
    });
    bindPlaceSuggest();
    bindPlaceAlternates();


    const placeForm = $("#placeSearchForm");
    if (placeForm) {
      placeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        hidePlaceSuggest();
        const input = $("#placeSearch");
        searchCityOrZip(input && input.value);
      });
    }
    const lastPlaceBtn = $("#lastPlaceBtn");
    if (lastPlaceBtn) {
      lastPlaceBtn.addEventListener("click", () => {
        const q = sanitizePlaceQuery(lastPlaceBtn.getAttribute("data-query") || uiPrefs.lastPlaceQuery);
        if (!q) return;
        const input = $("#placeSearch");
        if (input) input.value = q;
        syncPlaceClear();
        searchCityOrZip(q);
      });
    }
    $("#aboutBtn").addEventListener("click", openAbout);
    const privacyAbout = $("#privacyAboutBtn");
    if (privacyAbout) privacyAbout.addEventListener("click", openAbout);
    const footerAbout = $("#footerAbout");
    if (footerAbout) {
      footerAbout.addEventListener("click", (e) => {
        e.preventDefault();
        openAbout();
      });
    }
    $("#aboutClose").addEventListener("click", closeAbout);
    $("#aboutBackdrop").addEventListener("click", closeAbout);
    $("#dealClose").addEventListener("click", closeDealSheet);
    $("#dealBackdrop").addEventListener("click", closeDealSheet);

    const clearBtn = $("#clearNowBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        wipeLocationState();
        setStatus("Cleared · still on page · tap Locate Me");
      });
    }

    function applyRadiusLocally(mi, opts) {
      setRadiusMiles(mi, opts);
      syncFiltersLaunch();
      const fetched = state.fetchedRadiusMiles;
      const have = state.lat != null && fetched != null && mi <= fetched + 0.001;
      if (state.lat != null && !have) {
        runSearch(state.lat, state.lng, { glow: false });
        return;
      }
      if (state.lat != null && state.lng != null) updateMapCenter(state.lat, state.lng, mi);
      renderList();
      const n = filteredPlaces().length;
      setStatus(state.lat != null ? n + " restaurants after filters" : "Searching within " + formatRadiusChipLabel(state.radiusMiles) + ".");
    }

    $$(".chip[data-radius]").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        applyRadiusLocally(Number(chip.dataset.radius), { fromWalk: false });
      });
    });

    $$(".chip[data-units]").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        setDistanceUnits(chip.getAttribute("data-units"), { persist: true, rerender: true });
      });
    });

    $$(".chip-walk").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const mins = Number(chip.dataset.walkMin);
        const mi = WALK_MIN_TO_MILES[mins];
        if (mi == null) return;
        applyRadiusLocally(mi, { fromWalk: true, walkMin: mins });
      });
    });

    const dietWrap = $("#dietChips");
    if (dietWrap) {
      dietWrap.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-diet]");
        if (!chip) return;
        e.stopPropagation();
        const key = chip.getAttribute("data-diet");
        if (!UI_PREFS_DIET_OSM[key]) return;
        if (!state.filters.diet) state.filters.diet = { vegan: false, vegetarian: false, gluten_free: false, halal: false };
        state.filters.diet[key] = !state.filters.diet[key];
        persistUiPrefs();
        syncDietChipsUI();
        syncFiltersLaunch();
        renderList();
        setStatus(filteredPlaces().length + " restaurants after filters");
      });
    }

    $("#filterDeal").addEventListener("click", () => {
      state.filters.hasDeal = !state.filters.hasDeal;
      $("#filterDeal").classList.toggle("active", state.filters.hasDeal);
      persistUiPrefs();
      renderList();
      setStatus(filteredPlaces().length + " restaurants after filters");
    });

    const savedBtn = $("#filterSaved");
    if (savedBtn) {
      savedBtn.addEventListener("click", () => {
        state.filters.saved = !state.filters.saved;
        setToggleState(savedBtn, state.filters.saved);
        persistUiPrefs();
        renderList();
        setStatus(
          state.filters.saved
            ? filteredPlaces().length + " saved in this list"
            : filteredPlaces().length + " restaurants after filters"
        );
      });
    }

    const nameSearch = $("#nameSearch");
    if (nameSearch) {
      nameSearch.addEventListener("input", () => {
        state.nameQuery = String(nameSearch.value || "").slice(0, 80);
        renderList();
      });
      nameSearch.addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.preventDefault();
      });
    }

    const a2hsDismiss = $("#a2hsDismiss");
    if (a2hsDismiss) a2hsDismiss.addEventListener("click", dismissA2hs);

    const filtersBtn = $("#filtersBtn");
    if (filtersBtn) filtersBtn.addEventListener("click", openFilters);
    const filtersClose = $("#filtersClose");
    if (filtersClose) filtersClose.addEventListener("click", closeFilters);
    const filtersDone = $("#filtersDone");
    if (filtersDone) filtersDone.addEventListener("click", closeFilters);
    const forgetBtn = $("#lastPlaceForget");
    if (forgetBtn) {
      forgetBtn.addEventListener("click", () => {
        uiPrefs.lastPlaceQuery = "";
        persistUiPrefs();
        syncLastPlaceControl();
        setStatus("Last city forgotten on this device.");
        const input = $("#placeSearch");
        if (input) { try { input.focus({ preventScroll: true }); } catch (_) {} }
      });
    }
    const pantryBtn = $("#filterPantries");
    if (pantryBtn) {
      pantryBtn.addEventListener("click", () => {
        state.dietaryFilter = state.dietaryFilter === "freefood" ? null : "freefood";
        const on = state.dietaryFilter === "freefood";
        pantryBtn.classList.toggle("active", on);
        pantryBtn.setAttribute("aria-pressed", on ? "true" : "false");
        renderList();
        if (typeof syncFiltersLaunch === "function") syncFiltersLaunch();
      });
    }
    const noticeBtn = $("#firstSearchNoticeOk");
    if (noticeBtn) noticeBtn.addEventListener("click", dismissFirstSearchNotice);

    const filtersClear = $("#filtersClear");
    if (filtersClear) {
      filtersClear.addEventListener("click", () => {
        state.walkMinutes = null;
        state.radiusMiles = 10;
        state.dietaryFilter = null;
        const pBtn = $("#filterPantries");
        if (pBtn) { pBtn.classList.remove("active"); pBtn.setAttribute("aria-pressed", "false"); }
        state.filters.openNow = false;
        state.filters.hasDeal = false;
        state.filters.saved = false;
        state.filters.type = "all";
        state.filters.takeaway = false;
        state.filters.delivery = false;
        state.filters.driveThrough = false;
        state.filters.wheelchair = false;
        state.filters.outdoorSeating = false;
        state.filters.restroom = false;
        state.filters.dogsOk = false;
        state.filters.airConditioning = false;
        state.filters.changingTable = false;
        state.filters.smokeFree = false;
        state.filters.kidsArea = false;
        state.filters.lateNight = false;
        state.filters.cuisine = null;
        state.filters.foodCategory = null;
        state.filters.diet = { vegan: false, vegetarian: false, gluten_free: false, halal: false };
        persistUiPrefs();
        syncRadiusChipsUI();
        syncDietChipsUI();
        const dealBtn = $("#filterDeal");
        if (dealBtn) dealBtn.classList.remove("active");
        const openBtn = $("#filterOpen");
        if (openBtn) {
          openBtn.classList.add("active");
          openBtn.setAttribute("aria-pressed", "true");
        }
        const openFirst = $("#openNowFirst");
        if (openFirst) {
          openFirst.classList.add("active");
          openFirst.setAttribute("aria-pressed", "true");
        }
        setToggleState($("#filterSaved"), false);
        setToggleState($("#filterLateNight"), false);
        const typeSel = $("#filterType");
        if (typeSel) typeSel.value = "all";
        $$("[data-tag]").forEach((btn) => btn.classList.remove("active"));
        syncFiltersLaunch();
        renderList();
        setStatus(filteredPlaces().length + " restaurants after filters");
      });
    }
    const filtersBack = $("#filtersBackdrop");
    if (filtersBack) filtersBack.addEventListener("click", closeFilters);
    const clearSavedBtn = $("#clearSavedBtn");
    if (clearSavedBtn) clearSavedBtn.addEventListener("click", clearSavedPlaces);
    const lateBtn = $("#filterLateNight");
    if (lateBtn) {
      lateBtn.addEventListener("click", () => {
        state.filters.lateNight = !state.filters.lateNight;
        setToggleState(lateBtn, state.filters.lateNight);
        persistUiPrefs();
        renderList();
        setStatus(filteredPlaces().length + " restaurants after filters");
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && filtersAreOpen()) closeFilters();
    });

    function syncOpenNowUI() {
      const on = !!state.filters.openNow;
      ["#filterOpen", "#openNowFirst"].forEach((sel) => {
        const el = $(sel);
        if (!el) return;
        el.classList.toggle("active", on);
        el.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    function toggleOpenNow() {
      state.filters.openNow = !state.filters.openNow;
      persistUiPrefs();
      syncOpenNowUI();
      renderList();
      setStatus(state.filters.openNow
        ? (filteredPlaces().length + " tagged open")
        : (filteredPlaces().length + " nearby"));
    }
    const filterOpen = $("#filterOpen");
    if (filterOpen) filterOpen.addEventListener("click", toggleOpenNow);
    const openNowFirst = $("#openNowFirst");
    if (openNowFirst) openNowFirst.addEventListener("click", toggleOpenNow);
    syncOpenNowUI();

    const filterType = $("#filterType");
    if (filterType) {
      filterType.addEventListener("change", (e) => {
        state.filters.type = e.target.value;
        if (state.filters.type !== "all") state.filters.foodCategory = null;
        persistUiPrefs();
        renderList();
        setStatus(filteredPlaces().length + " restaurants after filters");
      });
    }

    $$("[data-tag]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.getAttribute("data-tag");
        if (!UI_PREFS_TAGS[key]) return;
        state.filters[key] = !state.filters[key];
        btn.classList.toggle("active", !!state.filters[key]);
        persistUiPrefs();
        renderList();
        setStatus(filteredPlaces().length + " restaurants after filters");
      });
    });

    $$("[data-food-cats]").forEach((wrap) => {
      wrap.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-food-cat]");
        if (!chip || !wrap.contains(chip)) return;
        e.stopPropagation();
        setFoodCategory(chip.getAttribute("data-food-cat"));
      });
    });

    const cuisineWrap = $("#cuisineChips");
    if (cuisineWrap) {
      cuisineWrap.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-cuisine]");
        if (!chip) return;
        e.stopPropagation();
        const c = chip.getAttribute("data-cuisine");
        state.filters.cuisine = canonCuisine(state.filters.cuisine) === c ? null : c;
        if (state.filters.cuisine) state.filters.foodCategory = null;
        persistUiPrefs();
        renderList();
        setStatus(filteredPlaces().length + " restaurants after filters");
      });
    }

    function trackNav(el) {
      if (!el) return;
      const aNav = analytics();
      if (aNav) {
        aNav.navHandoff(
          el.getAttribute("data-nav-deal"),
          el.getAttribute("data-maps-app"),
          state.radiusMiles
        );
      }
    }

    const dealRail = $("#dealRail");
    if (dealRail) {
      dealRail.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-deal-open]");
        if (!btn) return;
        const place = findPlaceById(btn.getAttribute("data-deal-open"));
        if (place) {
          highlightPlace(place.id, { openPopup: false, scrollCard: true, pan: true });
          openDealSheet(place, { startDirections: true });
        }
      });
    }

    const openTrack = $("#openStripTrack");
    if (openTrack) {
      openTrack.addEventListener("click", (e) => {
        const pill = e.target.closest(".open-pill[data-id]");
        if (!pill) return;
        const place = findPlaceById(pill.getAttribute("data-id"));
        if (place) openDealSheet(place, { startDirections: true });
      });
    }
    const soonTrack = $("#opensSoonTrack");
    if (soonTrack) {
      soonTrack.addEventListener("click", (e) => {
        const pill = e.target.closest(".open-pill[data-id]");
        if (!pill) return;
        const place = findPlaceById(pill.getAttribute("data-id"));
        if (place) openDealSheet(place, { startDirections: true });
      });
    }

    $("#placeList").addEventListener("click", (e) => {
      const emptyAct = e.target.closest("[data-empty-action]");
      if (emptyAct) {
        const act = emptyAct.getAttribute("data-empty-action");
        if (act === "locate") locateMe();
        if (act === "cityzip") {
          const inp = document.getElementById("placeSearch");
          if (inp) { inp.focus(); inp.scrollIntoView({ behavior: "smooth", block: "center" }); }
        }
        return;
      }
      const heartBtn = e.target.closest("[data-heart]");
      if (heartBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = heartBtn.getAttribute("data-heart");
        const place = findPlaceById(id) || readSaved().find((s) => s.id === id);
        if (place) {
          toggleSavedPlace(place);
          if (state.filters.saved) renderList();
          else syncHeartButtons(id);
        }
        return;
      }
      const copyAddrBtn = e.target.closest("[data-copy-addr]");
      if (copyAddrBtn) {
        e.preventDefault();
        e.stopPropagation();
        const place = findPlaceById(copyAddrBtn.getAttribute("data-copy-addr"));
        if (place) copyAddress(place, copyAddrBtn);
        return;
      }
      const shareBtn = e.target.closest("[data-share]");
      if (shareBtn) {
        e.preventDefault();
        const place = findPlaceById(shareBtn.getAttribute("data-share"));
        if (place) sharePlace(place);
        return;
      }
      const navLink = e.target.closest("a[data-nav-deal][data-maps-app]");
      if (navLink) trackNav(navLink);
      if (e.target.closest("a")) return;
      const dealBtn = e.target.closest("[data-deal-open]");
      if (dealBtn) {
        e.preventDefault();
        const place = findPlaceById(dealBtn.getAttribute("data-deal-open"));
        if (place) {
          highlightPlace(place.id, { openPopup: false, scrollCard: false, pan: true });
          openDealSheet(place, { startDirections: true });
        }
        return;
      }
      const card = e.target.closest(".place-card[data-id]");
      if (!card) return;
      const place = findPlaceById(card.getAttribute("data-id"));
      if (!place) return;
      highlightPlace(place.id, { openPopup: false, scrollCard: false, pan: true });
      openDealSheet(place, { startDirections: true });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDealSheet();
        closeAbout();
      }
    });

    const dealBody = $("#dealSheetBody");
    if (dealBody) {
      dealBody.addEventListener("click", (e) => {
        const heartBtn = e.target.closest("[data-heart]");
        if (heartBtn) {
          e.preventDefault();
          const id = heartBtn.getAttribute("data-heart");
          const place = findPlaceById(id);
          if (place) {
            toggleSavedPlace(place);
            if (state.filters.saved) renderList();
            else syncHeartButtons(id);
          }
          return;
        }
        const useBtn = e.target.closest("[data-use-special]");
        if (useBtn) {
          e.preventDefault();
          const place = findPlaceById(useBtn.getAttribute("data-use-special"));
          if (place) useThisSpecial(place);
          return;
        }
        const nav = e.target.closest("a[data-nav-deal][data-maps-app]");
        if (!nav) return;
        trackNav(nav);
      });
    }

    let resizeTimer = null;
    function onResizeLayout() {
      detectDevice();
      if (state.map) state.map.invalidateSize();
    }
    window.addEventListener("resize", () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResizeLayout, 100);
    });
    window.addEventListener("orientationchange", () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResizeLayout, 100);
    });

    // Do not wipe on pagehide/beforeunload. iOS Safari fires pagehide on the
    // GPS permission sheet, app switch, and Maps, which killed Locate Me.

    const agreeBtn = $("#agreeContinue");
    if (agreeBtn) {
      agreeBtn.addEventListener("click", () => {
        uiPrefs.termsAccepted = true;
        persistUiPrefs();
        hideAgree();
      });
    }
    syncDietChipsUI();
    syncRadiusChipsUI();
  }


  function openAgree() {
    const sheet = $("#agreeSheet");
    const back = $("#agreeBackdrop");
    if (!sheet) return;
    sheet.classList.add("open");
    setSheetHidden(sheet, false);
    if (back) {
      back.hidden = false;
      back.classList.add("open");
    }
  }

  function hideAgree() {
    const sheet = $("#agreeSheet");
    const back = $("#agreeBackdrop");
    if (sheet) {
      sheet.classList.remove("open");
      setSheetHidden(sheet, true);
    }
    if (back) {
      back.hidden = true;
      back.classList.remove("open");
    }
  }

  /* forge 20261003 (Snitch): one switch in config.js -> window.RB_CONFIG.ASSENT_MODE
   *   "current"    (default) today's behaviour: Continue sheet stays hidden, no extra line.
   *   "continue"   show the existing Continue sheet once per device until tapped.
   *   "browsewrap" show "By using RangeBites you agree to the Terms and Privacy Policy" under search. */
  function assentMode() {
    const m = window.RB_CONFIG && window.RB_CONFIG.ASSENT_MODE;
    return m === "continue" || m === "browsewrap" ? m : "current";
  }

  function maybeShowAgree() {
    const mode = assentMode();
    const line = $("#assentLine");
    if (line) line.hidden = mode !== "browsewrap";
    if (mode === "continue" && !uiPrefs.termsAccepted) {
      openAgree();
      return;
    }
    // First screen is Locate / search. Terms stay in the footer and About.
    hideAgree();
  }


  function refreshOpenStatuses() {
    if (!state.places || !state.places.length) return;
    const at = placeNow(state.lng);
    let changed = false;
    for (let i = 0; i < state.places.length; i++) {
      const p = state.places[i];
      if (!p.hours) continue;
      const next = parseOpeningHours(p.hours, at, p.lat, p.lng);
      const untilClose = next === "open" ? minutesUntilClose(p.hours, at, p.lat, p.lng) : null;
      const untilOpen = next === "closed" ? minutesUntilOpen(p.hours, at, p.lat, p.lng) : null;
      const closesSoon = next === "open" && untilClose != null && untilClose <= 60;
      const opensSoon = next === "closed" && untilOpen != null && untilOpen > 0 && untilOpen <= 90;
      if (next !== p.openStatus || closesSoon !== p.closesSoon || opensSoon !== p.opensSoon) changed = true;
      p.openStatus = next;
      p.closesSoon = closesSoon;
      p.opensSoon = opensSoon;
      p.untilOpen = untilOpen;
    }
    if (!changed) return;
    renderList();
    renderMarkers(filteredPlaces());
  }

  function boot() {
    detectDevice();
    const aBoot = analytics();
    if (aBoot) aBoot.appOpened();
    initMap();
    applyUiPrefs(); // chips/filters/input only — do not auto-run Overpass/Nominatim
    bindUI();
    syncLastPlaceControl();
    renderList();
    maybeShowInsecureBanner();
    setStatus("Tap Locate Me, or search any city. Any type of food.");
    syncHeroTipVisibility();
    syncTrustStrip();
    hideOnboarding();
    maybeShowAgree();
    maybeShowA2hs();
    uiPrefs.filtersOpen = false;
    closeFilters();

    setTimeout(() => state.map && state.map.invalidateSize(), 100);
    // Screenshot / QA: ?shot=1 skips onboard only — no fake places
    let shot = false;
    try {
      shot = new URLSearchParams(location.search).get("shot") === "1";
    } catch (_) {}
    if (shot) {
      uiPrefs.onboardDismissed = true;
      uiPrefs.heroTipHidden = true;
      uiPrefs.a2hsDismissed = true;
      uiPrefs.termsAccepted = true;
      persistUiPrefs();
      hideOnboarding();
      hideHeroTip(false);
      const a2 = $("#a2hsHint");
      if (a2) a2.hidden = true;
      return;
    }
    let openAboutHash = false;
    try {
      openAboutHash = location.hash === "#about";
    } catch (_) {}
    if (openAboutHash) {
      hideOnboarding();
      openAbout();
    } else {
      hideOnboarding();
    }
    let startQ = "";
    try {
      startQ = String(new URLSearchParams(location.search).get("q") || "").trim();
    } catch (_) {}
    if (startQ && !shot) {
      const inp = $("#placeSearch");
      if (inp) inp.value = startQ;
      searchCityOrZip(startQ);
    }
    setInterval(refreshOpenStatuses, 60000);
    // Do not register a service worker. Old SWs on phones kept stale app.js
    // and left Search stuck on Finding food… / OSM timeout.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }).then(function () {
        return caches.keys();
      }).then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }).catch(function () {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
