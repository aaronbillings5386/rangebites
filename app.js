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
 * - Same-origin Overpass/Nominatim proxies only (/api/overpass, /api/nominatim). Never mail.ru Overpass (hangs). We do not invent restaurants.
 */
(function () {
  "use strict";

  /** Neutral map view until Locate Me — not a fake city of places */
  const MAP_DEFAULT = { lat: 20, lng: 0, zoom: 2 };
  const MAX_RESULTS = 120;
  /** Same-origin Overpass only. Primary = overpass.openstreetmap.fr via /api/overpass; backup = lz4. */
  const OVERPASS_URLS = [
    "/api/overpass",
    "/api/overpass-lz4",
  ];
  /** Server-side Overpass [timeout:N]; client abort is a little longer. */
  const OVERPASS_TIMEOUT_S = 25;
  const OVERPASS_CLIENT_ABORT_MS = 35000;
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
    const savedBtn = $("#filterSaved");
    if (savedBtn) savedBtn.classList.toggle("active", state.filters.saved);
    const lateBtn = $("#filterLateNight");
    if (lateBtn) lateBtn.classList.toggle("active", !!state.filters.lateNight);
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
    setDistanceUnits(milesCountryFromHit(hit) ? "mi" : "km", { persist: true, rerender: false });
  }

  /** Deals first, then nearer. Quiet Precision: savings surface before distance. */
  function sortDealsFirst(list) {
    return list.slice().sort((a, b) => {
      const da = a.deal ? 0 : 1;
      const db = b.deal ? 0 : 1;
      if (da !== db) return da - db;
      return a.miles - b.miles;
    });
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
    return String(token || "").replace(/_/g, " ");
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

  function isLateNightHours(hours) {
    if (!hours || typeof hours !== "string") return false;
    const h = hours.trim();
    if (!h) return false;
    if (/^24\/7$/i.test(h)) return true;
    const NINE = 21 * 60;
    const rules = h.split(";").map((r) => r.trim()).filter(Boolean);
    for (const rule of rules) {
      if (/^(PH|SH)\b/i.test(rule)) continue;
      if (/^.+?\s+off$/i.test(rule)) continue;
      const m = rule.match(/^((?:[A-Za-z]{2}(?:-[A-Za-z]{2})?(?:\s*,\s*[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)\s+)?(.+)$/);
      if (!m) continue;
      const timeSpec = m[2].trim();
      for (const span of timeSpec.split(",")) {
        const tm = span.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
        if (!tm) continue;
        const start = parseMinutes(tm[1]);
        const end = parseMinutes(tm[2]);
        if (start == null || end == null) continue;
        if (end > start) {
          if (end > NINE || start >= NINE) return true;
        } else if (end !== start) {
          return true;
        }
      }
    }
    return false;
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
    const sf = String(tags.social_facility || "").toLowerCase();
    const amenity = String(tags.amenity || "").toLowerCase();
    const office = String(tags.office || "").toLowerCase();
    const foodSf = { food_bank: 1, soup_kitchen: 1, food_pantry: 1 };
    if (foodSf[sf]) return true;
    if (amenity === "food_bank" || amenity === "soup_kitchen" || amenity === "food_pantry") return true;
    if (office === "food_bank") return true;
    return false;
  }

  const OSM_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];


  /** Permanently closed OSM tags only. Missing hours is not closed. */
  function isPermanentlyClosed(tags) {
    if (!tags) return false;
    const oh = String(tags.opening_hours || "").trim().toLowerCase();
    if (oh === "closed") return true;
    const yes = (v) => String(v || "").toLowerCase() === "yes";
    if (yes(tags.disused) || yes(tags.abandoned) || yes(tags.closed) || yes(tags.permanently_closed)) return true;
    for (const k of Object.keys(tags)) {
      if (/^(disused|abandoned|razed|demolished|destroyed):/i.test(k)) return true;
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

  /** OSM opening_hours when tagged. Returns "open" | "closed" | null. Never invents. */
  function parseOpeningHours(hours, now) {
    if (!hours || typeof hours !== "string") return null;
    const h = hours.trim();
    if (!h) return null;
    if (/^24\/7$/i.test(h)) return "open";
    now = now || new Date();
    const day = OSM_DAYS[now.getDay()];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const rules = h.split(";").map((r) => r.trim()).filter(Boolean);
    if (!rules.length) return null;
    let parsedAny = false;
    let matched = false;
    let isOpen = false;
    for (const rule of rules) {
      if (/^(PH|SH)\b/i.test(rule)) {
        continue;
      }
      const off = rule.match(/^(.+?)\s+off$/i);
      if (off) {
        const days = expandOsmDays(off[1]);
        if (!days.size) continue;
        parsedAny = true;
        if (days.has(day)) {
          matched = true;
          isOpen = false;
        }
        continue;
      }
      const m = rule.match(/^((?:[A-Za-z]{2}(?:-[A-Za-z]{2})?(?:\s*,\s*[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)\s+)?(.+)$/);
      if (!m) continue;
      const daySpec = (m[1] || "").trim();
      const timeSpec = m[2].trim();
      const days = daySpec ? expandOsmDays(daySpec) : /^\d/.test(timeSpec) ? new Set(OSM_DAYS) : new Set();
      if (!days.size) continue;
      parsedAny = true;
      if (!days.has(day)) continue;
      const spans = timeSpec.split(",").map((s) => s.trim()).filter(Boolean);
      let timesOk = false;
      let dayOpen = false;
      for (const span of spans) {
        const tm = span.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
        if (!tm) continue;
        const start = parseMinutes(tm[1]);
        const end = parseMinutes(tm[2]);
        if (start == null || end == null) continue;
        timesOk = true;
        if (minutesInSpan(nowMin, start, end)) dayOpen = true;
      }
      if (timesOk) {
        matched = true;
        isOpen = dayOpen;
      }
    }
    if (!parsedAny || !matched) return null;
    return isOpen ? "open" : "closed";
  }


  function clockFromMinutes(min) {
    let m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
    let h = Math.floor(m / 60);
    const mm = m % 60;
    const am = h < 12;
    const h12 = h % 12 || 12;
    return h12 + (mm ? ":" + String(mm).padStart(2, "0") : "") + (am ? "am" : "pm");
  }

  /** Plain hours for cards. Never invents; only formats tagged OSM hours. */
  function friendlyHoursLine(p, now) {
    const raw = String(p.hours || "").trim();
    if (!raw) return "";
    if (/^24\/7$/i.test(raw)) return "Open all day";
    now = now || nowAtLng(state.lng);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (p.openStatus === "open" && p.closesSoon && p.untilOpen == null) {
      const until = minutesUntilClose(raw, now);
      if (until != null) return "Closes soon · until " + clockFromMinutes(nowMin + until);
      return "Closes soon";
    }
    if (p.openStatus === "open") {
      const until = minutesUntilClose(raw, now);
      if (until != null) return "Open now, until " + clockFromMinutes(nowMin + until);
      return "Open now";
    }
    if (p.openStatus === "closed") return "Closed";
    return "";
  }

  function openIshStatus(hours) {
    return parseOpeningHours(hours);
  }

  /** Minutes until the current OSM span ends. Null if unknown or 24/7. Never invents. */
  function minutesUntilClose(hours, now) {
    if (!hours || typeof hours !== "string") return null;
    const h = hours.trim();
    if (!h || /^24\/7$/i.test(h)) return null;
    now = now || new Date();
    const day = OSM_DAYS[now.getDay()];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const rules = h.split(";").map((r) => r.trim()).filter(Boolean);
    let closeMin = null;
    for (const rule of rules) {
      if (/^(PH|SH)\b/i.test(rule)) continue;
      if (/^.+?\s+off$/i.test(rule)) continue;
      const m = rule.match(/^((?:[A-Za-z]{2}(?:-[A-Za-z]{2})?(?:\s*,\s*[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)\s+)?(.+)$/);
      if (!m) continue;
      const daySpec = (m[1] || "").trim();
      const timeSpec = m[2].trim();
      const days = daySpec ? expandOsmDays(daySpec) : /^\d/.test(timeSpec) ? new Set(OSM_DAYS) : new Set();
      if (!days.size || !days.has(day)) continue;
      for (const span of timeSpec.split(",")) {
        const tm = span.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
        if (!tm) continue;
        const start = parseMinutes(tm[1]);
        const end = parseMinutes(tm[2]);
        if (start == null || end == null) continue;
        if (!minutesInSpan(nowMin, start, end)) continue;
        let until;
        if (end > start) until = end - nowMin;
        else if (nowMin >= start) until = 24 * 60 - nowMin + end;
        else until = end - nowMin;
        if (until > 0 && (closeMin == null || until < closeMin)) closeMin = until;
      }
    }
    return closeMin;
  }

  /** Minutes until the next OSM span starts. Null if open, 24/7, or unknown. Never invents. */
  function minutesUntilOpen(hours, now) {
    if (!hours || typeof hours !== "string") return null;
    const h = hours.trim();
    if (!h || /^24\/7$/i.test(h)) return null;
    now = now || new Date();
    const nowDayIdx = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const rules = h.split(";").map((r) => r.trim()).filter(Boolean);

    function spansForDay(dayName) {
      const spans = [];
      let off = false;
      for (const rule of rules) {
        if (/^(PH|SH)\b/i.test(rule)) continue;
        const offM = rule.match(/^(.+?)\s+off$/i);
        if (offM) {
          const days = expandOsmDays(offM[1]);
          if (days.has(dayName)) off = true;
          continue;
        }
        const m = rule.match(/^((?:[A-Za-z]{2}(?:-[A-Za-z]{2})?(?:\s*,\s*[A-Za-z]{2}(?:-[A-Za-z]{2})?)*)\s+)?(.+)$/);
        if (!m) continue;
        const daySpec = (m[1] || "").trim();
        const timeSpec = m[2].trim();
        const days = daySpec ? expandOsmDays(daySpec) : /^\d/.test(timeSpec) ? new Set(OSM_DAYS) : new Set();
        if (!days.size || !days.has(dayName)) continue;
        for (const span of timeSpec.split(",")) {
          const tm = span.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
          if (!tm) continue;
          const start = parseMinutes(tm[1]);
          const end = parseMinutes(tm[2]);
          if (start == null || end == null || start === end) continue;
          spans.push({ start, end });
        }
      }
      if (off) return [];
      return spans;
    }

    const today = OSM_DAYS[nowDayIdx];
    for (const span of spansForDay(today)) {
      if (minutesInSpan(nowMin, span.start, span.end)) return null;
    }
    let best = null;
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const dayName = OSM_DAYS[(nowDayIdx + dayOffset) % 7];
      for (const span of spansForDay(dayName)) {
        const until = dayOffset * 24 * 60 + span.start - nowMin;
        if (until > 0 && (best == null || until < best)) best = until;
      }
    }
    return best;
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

  function openFilters() {
    const sheet = $("#filtersSheet");
    const back = $("#filtersBackdrop");
    if (!sheet) return;
    if (back) {
      back.hidden = false;
      back.classList.add("open");
    }
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
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
      sheet.setAttribute("aria-hidden", "true");
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
        '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer">OpenStreetMap</a>',
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
      const iconW = isSponsored ? 76 : size;
      const iconH = isSponsored ? size + 14 : size;
      const pinClass = `radar-marker${isDeal ? " deal" : ""}${isSponsored ? " sponsored" : ""}`;
      const pinHtml = `<div class="${pinClass}"></div>` +
        (isSponsored ? `<span class="pin-sponsored">Sponsored</span>` : "");
      const icon = L.divIcon({
        className: isSponsored ? "sponsored-pin-icon" : "",
        html: pinHtml,
        iconSize: [iconW, iconH],
        iconAnchor: [iconW / 2, size / 2],
      });
      const m = L.marker([p.lat, p.lng], { icon });
      const sponsoredPopup = isSponsored
        ? `<br><span class="popup-sponsored">Sponsored</span>`
        : "";
      m.bindPopup(
        `<strong>${escapeHtml(p.name)}</strong><br>${formatMiles(p.miles)} · ${escapeHtml(amenityLabel(p.amenity))}` +
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

  function buildOverpassQuery(lat, lng, radiusM, mode) {
    const r = Math.round(radiusM);
    const t = OVERPASS_TIMEOUT_S;
    const around = `(around:${r},${lat},${lng})`;
    const named = '["name"]';
    // Lean query — same food types, fewer unions so phones finish before timeout.
    // Pantries: amenity=food_bank|soup_kitchen only. Copy must not claim social_facility/office/worldwide.
    const food = "restaurant|fast_food|cafe|bar|pub|ice_cream|food_court|biergarten|food_bank|soup_kitchen";
    return `[out:json][timeout:${t}];(` +
      `node["amenity"~"^(` + food + `)$"]${named}${around};` +
      `way["amenity"~"^(` + food + `)$"]${named}${around};` +
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
    const abortMs = OVERPASS_CLIENT_ABORT_MS;
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
        // empty on primary → try backup; empty on all → real empty list
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
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    try {
      const res = await fetch(NOMINATIM_URL + "?" + params.toString(), {
        headers: { Accept: "application/json" },
        referrerPolicy: "origin",
        signal: ac.signal,
      });
      if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
      let data = await res.json();
      if ((!data || !data.length) && !looksLikePostal(lookup)) {
        const p2 = new URLSearchParams();
        p2.set("format", "jsonv2");
        p2.set("limit", "8");
        p2.set("addressdetails", "1");
        p2.set("q", lookup);
        const res2 = await fetch(NOMINATIM_URL + "?" + p2.toString(), {
          headers: { Accept: "application/json" },
          referrerPolicy: "origin",
          signal: ac.signal,
        });
        if (res2.ok) data = await res2.json();
      }
      if (!data || !data.length) return null;
      const hit = pickGeocodeHit(data);
      if (!hit) return null;
      const lat = parseFloat(hit.lat);
      const lng = parseFloat(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        lat,
        lng,
        label: hit.display_name || t,
        display_name: hit.display_name || t,
        country_code: (hit.address && hit.address.country_code) || "",
        address: hit.address || null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeElements(elements, originLat, originLng) {
    const seen = new Set();
    const places = [];

    for (const el of elements) {
      const tags = el.tags || {};
      const name = tags.name;
      if (!name) continue;
      if (isPermanentlyClosed(tags)) continue;

      let lat = el.lat;
      let lng = el.lon;
      if (lat == null && el.center) {
        lat = el.center.lat;
        lng = el.center.lon;
      }
      if (lat == null || lng == null) continue;

      const key = `${name.toLowerCase()}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      let dup = false;
      for (let i = 0; i < places.length; i++) {
        const prev = places[i];
        if (prev.name.toLowerCase() !== name.toLowerCase()) continue;
        if (haversineMiles(prev.lat, prev.lng, lat, lng) < 0.08) { dup = true; break; }
      }
      if (dup) continue;
      seen.add(key);

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
      const atPlace = nowAtLng(originLng);
      const openStatus = parseOpeningHours(hours, atPlace);
      const kitchenStatus = kitchenHours ? parseOpeningHours(kitchenHours, atPlace) : null;
      const untilClose = openStatus === "open" ? minutesUntilClose(hours, atPlace) : null;
      const untilOpen = openStatus === "closed" ? minutesUntilOpen(hours, atPlace) : null;
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
        kitchenHours,
        kitchenClosedDoorsOpen: openStatus === "open" && kitchenHours && kitchenStatus === "closed",
        phone: tags.phone || tags["contact:phone"] || "",
        website: tags.website || tags["contact:website"] || tags.url || "",
        menuUrl: tags["website:menu"] || tags.menu || tags["contact:menu"] || "",
        osmRating: parseOsmRating(tags),
        address: osmAddress(tags),
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
        lateNight: isLateNightHours(hours),
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

    return sortDealsFirst(places).slice(0, 400);
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
    if (state.filters.lateNight) list = list.filter((p) => !!p.lateNight);
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
    list = sortDealsFirst(list).slice(0, MAX_RESULTS);

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
    const raw = String(phone || "").trim();
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
    return /555/.test(String(phone || "").replace(/\D/g, ""));
  }

  function contactBlockHtml(p) {
    const rows = [];
    const tel = isFakeDemoPhone(p.phone) ? "" : telHref(p.phone);
    if (tel) {
      rows.push(
        `<a class="contact-link" href="${escapeHtml(tel)}">Call <span class="contact-value">${escapeHtml(p.phone)}</span></a>`
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
        `<a class="contact-link" href="${escapeHtml(web)}" target="_blank" rel="noopener noreferrer">Website</a>`
      );
    }
    if (p.hours) {
      rows.push(
        `<div class="contact-hours"><span class="contact-label">Hours</span> ${escapeHtml(p.hours)}</div>`
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
  <p class="reviews-note">Live reviews on Maps</p>
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
    el.innerHTML = `See the deal. Then go. <span class="deal-rail-sub">From listing text</span>`;
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
          `<button type="button" class="open-pill" role="listitem" data-id="${escapeHtml(p.id)}"><span class="open-name">${escapeHtml(p.name)}</span><span class="open-mark">OSM hours</span></button>`
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
          dealCount === 1 ? "1 deal" : `${dealCount} deals`;
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
          ? `<li class="empty"><strong>No listed deals here.</strong> Widen the range, or clear the deal filter.</li>`
          : (state.filters.openNow && state.places && state.places.length
          ? `<li class="empty"><strong>None open now.</strong> They show when hours say open.</li>`
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
        if (p.hours && p.openStatus === "open" && p.closesSoon) openBadge = `<span class="badge badge-soon">Closes soon</span>`;
        else if (p.hours && p.openStatus === "open") openBadge = `<span class="badge badge-open">Open now</span>`;
        else if (p.hours && p.openStatus === "closed") openBadge = `<span class="badge badge-closed">Closed</span>`;
        else if (p.hours && p.opensSoon) openBadge = "";
        const kitchenBadge = p.kitchenClosedDoorsOpen
          ? `<span class="badge badge-kitchen">Kitchen closed · OSM</span>`
          : "";
        const outdoorBadge = p.outdoorSeating ? `<span class="badge badge-tag">Outdoor seating</span>` : "";
        const wheelchairBadge = p.wheelchair ? `<span class="badge badge-tag">Wheelchair</span>` : "";
        const takeoutBadge = p.takeout ? `<span class="badge badge-tag">Takeout</span>` : "";
        const deliveryBadge = p.delivery ? `<span class="badge badge-tag">Delivery</span>` : "";
        const driveBadge = p.driveThru ? `<span class="badge badge-tag">Drive-thru</span>` : "";
        const restroomBadge = p.restroom ? `<span class="badge badge-tag">${escapeHtml("Restroom")}</span>` : "";
        const dogsBadge = p.dogsOk ? `<span class="badge badge-tag">${escapeHtml("Dogs OK")}</span>` : "";
        const acBadge = p.airConditioning ? `<span class="badge badge-tag">${escapeHtml("A/C")}</span>` : "";
        const changingBadge = p.changingTable ? `<span class="badge badge-tag">${escapeHtml("Changing table")}</span>` : "";
        const smokeBadge = p.smokeFree ? `<span class="badge badge-tag">${escapeHtml("No smoking")}</span>` : "";
        const kidsBadge = p.kidsArea ? `<span class="badge badge-tag">${escapeHtml("Kids area")}</span>` : "";
        const cuisine = p.cuisine
          ? escapeHtml(p.cuisine.replace(/;/g, ", "))
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
        const tel = isFakeDemoPhone(p.phone) ? "" : telHref(p.phone);
        const callCta = tel
          ? `<a class="nav-btn" href="${escapeHtml(tel)}">Call</a>`
          : "";
        const menuHref = /example\.com/i.test(p.menuUrl || "") ? "" : absoluteUrl(p.menuUrl);
        const menuCta = menuHref
          ? `<a class="nav-btn" href="${escapeHtml(menuHref)}" target="_blank" rel="noopener noreferrer">Menu</a>`
          : "";
        const webHref = /example\.com/i.test(p.website || "") ? "" : absoluteUrl(p.website);
        const webCta = webHref
          ? `<a class="nav-btn" href="${escapeHtml(webHref)}" target="_blank" rel="noopener noreferrer">Website</a>`
          : "";
        const addrCta = (p.address && String(p.address).trim())
          ? `<button type="button" class="nav-btn" data-copy-addr="${pid}">Copy address</button>`
          : "";
        let hoursLine = "";
        if (p.hours && p.openStatus === "open") {
          hoursLine = `<div class="place-hours is-open">${escapeHtml(friendlyHoursLine(p))}</div>`;
        } else if (p.hours && p.openStatus === "closed") {
          const closedLine = friendlyHoursLine(p);
          if (closedLine) hoursLine = `<div class="place-hours is-closed">${escapeHtml(closedLine)}</div>`;
        }

        return `
<li class="${cardClass}" data-id="${escapeHtml(p.id)}" ${p.deal ? `data-has-deal="1"` : ""} ${stagger}>
  <div class="place-top">
    <div class="place-main">
      <h3 class="place-name">${escapeHtml(p.name)}</h3>
      <div class="place-meta">${cuisine}</div>
      ${hoursLine}
      <div class="badge-row">${dealBadge}${sponsoredBadge}${typeBadge}${openBadge}${kitchenBadge}${outdoorBadge}${wheelchairBadge}${takeoutBadge}${deliveryBadge}${driveBadge}${restroomBadge}${dogsBadge}${acBadge}${changingBadge}${smokeBadge}${kidsBadge}</div>
    </div>
    <div class="place-side">
      ${heartBtnHtml(p)}
      <div class="place-distance" title="Straight-line at 3 mph. Not a routed walk."><span class="dist-mi">${formatMiles(p.miles)}</span><span class="dist-walk">${escapeHtml(walkLabel(p.miles))}</span></div>
    </div>
  </div>
  ${dealCallout}
  ${contactHtml}
  <div class="nav-row">
    ${primaryCta}
    ${secondaryCta}
    ${callCta}
    ${menuCta}
    ${webCta}
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
    if (title) title.textContent = place.deal ? "Deal" : "Place";
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
    if (place.wheelchair) tagBits.push("Wheelchair");
    if (place.takeout) tagBits.push("Takeaway");
    if (place.delivery) tagBits.push("Delivery");
    if (place.driveThru) tagBits.push("Drive-through");
    if (place.restroom) tagBits.push("Restroom");
    if (place.dogsOk) tagBits.push("Dogs OK");
    if (place.airConditioning) tagBits.push("A/C");
    if (place.changingTable) tagBits.push("Changing table");
    if (place.smokeFree) tagBits.push("No smoking");
    if (place.kidsArea) tagBits.push("Kids area");
    if (place.hours && place.openStatus === "open" && place.closesSoon) tagBits.push("Closes soon · OSM hours");
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
    $("#dealSheet").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeDealSheet() {
    $("#dealBackdrop").classList.remove("open");
    $("#dealSheet").classList.remove("open");
    $("#dealSheet").setAttribute("aria-hidden", "true");
    $("#dealBackdrop").hidden = true;
    if (!$("#aboutSheet").classList.contains("open")) {
      document.body.style.overflow = "";
    }
  }

  /* ---------- Search / locate ---------- */

  function applyPlaces(places, { live, statusMsg, fetchedRadius } = {}) {
    state.places = places || [];
    state.loading = false;
    if (fetchedRadius != null) state.fetchedRadiusMiles = fetchedRadius;
    try {
      document.documentElement.classList.toggle("has-places", !!(state.places && state.places.length));
    } catch (_) {}
    maybeShowA2hs();
    hideHeroTip(true);
    // Paint list immediately. Map tiles/pins are independent and must not delay cards.
    renderList();
    const shown = filteredPlaces().length;
    const deals = filteredPlaces().filter((p) => !!p.deal).length;
    const dealsHint = deals > 0 ? " · Deals up top" : "";
    const aSearch = analytics();
    if (aSearch) aSearch.searchCompleted(state.radiusMiles, shown);
    if (statusMsg) {
      setStatus(statusMsg + (statusMsg.includes("Deals up top") ? "" : dealsHint));
      return;
    }
    if (live) {
      if (!shown && places.length) {
        setStatus(state.filters.openNow
          ? "None open now. They show when hours say open."
          : "No tagged food in this range.");
      } else if (!shown) {
        setStatus("No tagged food in this range.");
      } else {
        setStatus(
          shown + (state.filters.openNow ? " open now" : " nearby") +
            (places.length >= MAX_RESULTS ? " · top " + MAX_RESULTS : "") +
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
    }, OVERPASS_CLIENT_ABORT_MS + 4000);

    const fetchMi = state.radiusMiles;

    try {
      // One Overpass only — fast-then-full doubled wait on flaky mobile and left Finding food… hanging.
      const places = await fetchPlaces(lat, lng, fetchMi, { mode: "full" });
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
      if (state.places && state.places.length) {
        state.loading = false;
        setStatus(filteredPlaces().length + " nearby · showing closest first");
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

  async function searchCityOrZip(raw) {
    const q = sanitizePlaceQuery(raw);
    if (!q) {
      setStatus("Type any city.");
      return;
    }
    const gen = ++state.searchGen;
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
        state.loading = false;
        state.searchError = "No match for that city.";
        setLocateBusy(null);
        setStatus(state.searchError);
        renderList();
        return;
      }
      applyUnitsFromGeocode(hit);
      const near = shortPlaceLabel(hit.label || hit.display_name, q);
      uiPrefs.lastPlaceQuery = q;
      persistUiPrefs();
      syncLastPlaceControl();
      rememberCityInUrl(q);
      setStatus("Searching near " + near + "…");
      await runSearch(hit.lat, hit.lng, { glow: false, placeLabel: near });
    } catch (err) {
      if (gen !== state.searchGen) return;
      state.loading = false;
      const why =
        err && err.name === "AbortError"
          ? "City lookup timed out. Try again."
          : "Couldn’t look up that city. Try again.";
      state.searchError = why;
      setLocateBusy(null);
      setStatus(why);
      renderList();
    }
  }

  function geoErrorMessage(err) {
    const code = err && err.code;
    if (code === 1) return "Couldn’t get your location. Try again, or search any city.";
    if (code === 2) return "Couldn’t get your location. Try again, or search any city.";
    if (code === 3) return "Couldn’t get your location. Try again, or search any city.";
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
    setStatus("Asking for location (when-in-use only)…");
    const locateSlow = setTimeout(() => {
      setStatus("Location is taking a moment…");
    }, 4000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (locateGen !== state.searchGen) return;
        clearTimeout(locateSlow);
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
    setStatus("Cleared · tap Locate Me");
  }

  /* ---------- About ---------- */

  function openAbout() {
    $("#aboutBackdrop").hidden = false;
    $("#aboutBackdrop").classList.add("open");
    $("#aboutSheet").classList.add("open");
    $("#aboutSheet").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeAbout() {
    $("#aboutBackdrop").classList.remove("open");
    $("#aboutSheet").classList.remove("open");
    $("#aboutSheet").setAttribute("aria-hidden", "true");
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
    return pool[0] + ", " + pool[1] + ", or " + pool[2];
  }

  function applyPlaceHint() {
    const input = document.getElementById("placeSearch");
    if (input) input.placeholder = pickPlaceHint();
  }

  function hidePlaceSuggest() {
    const ul = $("#placeSuggest");
    if (!ul) return;
    ul.hidden = true;
    ul.innerHTML = "";
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
    const t = String(q || "").trim();
    if (t.length < 3) {
      hidePlaceSuggest();
      return;
    }
    suggestTimer = setTimeout(() => fetchPlaceSuggest(t), 280);
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
      hidePlaceSuggest();
      locateMe();
    });
    bindPlaceSuggest();


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
        savedBtn.classList.toggle("active", state.filters.saved);
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
    const filtersClear = $("#filtersClear");
    if (filtersClear) {
      filtersClear.addEventListener("click", () => {
        state.walkMinutes = null;
        state.radiusMiles = 10;
        state.dietaryFilter = null;
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
        const savedBtn = $("#filterSaved");
        if (savedBtn) savedBtn.classList.remove("active");
        const lateBtn = $("#filterLateNight");
        if (lateBtn) lateBtn.classList.remove("active");
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
        lateBtn.classList.toggle("active", state.filters.lateNight);
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
        ? (filteredPlaces().length + " open now")
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
    sheet.setAttribute("aria-hidden", "false");
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
      sheet.setAttribute("aria-hidden", "true");
    }
    if (back) {
      back.hidden = true;
      back.classList.remove("open");
    }
  }

  function maybeShowAgree() {
    // First screen is Locate / search. Terms stay in the footer and About.
    hideAgree();
  }


  function refreshOpenStatuses() {
    if (!state.places || !state.places.length) return;
    const at = nowAtLng(state.lng);
    let changed = false;
    for (let i = 0; i < state.places.length; i++) {
      const p = state.places[i];
      const next = parseOpeningHours(p.hours, at);
      if (next !== p.openStatus) {
        p.openStatus = next;
        const untilClose = next === "open" ? minutesUntilClose(p.hours, at) : null;
        const untilOpen = next === "closed" ? minutesUntilOpen(p.hours, at) : null;
        p.closesSoon = next === "open" && untilClose != null && untilClose <= 60;
        p.opensSoon = next === "closed" && untilOpen != null && untilOpen > 0 && untilOpen <= 90;
        p.untilOpen = untilOpen;
        changed = true;
      }
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
