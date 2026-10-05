"use strict";
/* 20261004b: Overpass mirror fallback, a11y names/lists, privacy copy, pantry tags, merged closed ids,
 * nth-weekday hours, share image. The holiday registry is covered in holiday-registry.test.js. Pure functions from app.js run in a sandbox (extract.js). */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./extract");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const tests = [];
function t(name, f) {
  tests.push([name, f]);
}

/* ---------- Overpass mirrors (fake fetch + fake clock, no network) ---------- */
function makeFetchPlaces(script) {
  // script: url -> "hang" | {status, json, retryAfter}
  const log = [];
  let clock = 0;
  const timers = [];
  let inFlight = 0,
    maxInFlight = 0;
  const g = {
    __hook: {},
    setTimeout: (fn, ms) => {
      const h = { at: clock + ms, fn };
      timers.push(h);
      return h;
    },
    clearTimeout: (h) => {
      const i = timers.indexOf(h);
      if (i >= 0) timers.splice(i, 1);
    },
    AbortController: class {
      constructor() {
        const s = { aborted: false, l: [] };
        this.signal = s;
      }
      abort() {
        this.signal.aborted = true;
        this.signal.l.forEach((f) => f());
      }
    },
    encodeURIComponent,
    fetch: (url, init) => {
      log.push({ url, at: clock, body: init.body });
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      let r = script[url];
      if (Array.isArray(r)) r = r.length > 1 ? r.shift() : r[0];
      return new Promise((resolve, reject) => {
        const done = () => {
          inFlight--;
        };
        init.signal.l.push(() => {
          done();
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
        if (r === "hang") return;
        done();
        resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          headers: { get: (h) => (h === "Retry-After" && r.retryAfter ? String(r.retryAfter) : null) },
          json: async () => r.json,
        });
      });
    },
  };
  const F = load(
    "app.js",
    [
      "roundCoord3",
      "milesToMeters",
      "buildOverpassQuery",
      "overpassCacheKey",
      "cacheSweep",
      "overpassCacheGet",
      "overpassCachePut",
      "overpassBusyMs",
      "bumpCacheGen",
      "sweepAllCaches",
      "fetchPlaces",
      "overpassErrorMessage",
    ],
    [
      "OVERPASS_SERVER",
      "OVERPASS_TIMEOUT_S",
      "OVERPASS_MIRROR_ABORT_MS",
      "OVERPASS_TOTAL_CAP_MS",
      "OVERPASS_RETRY_MIN_MS",
      "CACHE_SWEEP_INTERVAL_MS",
      "GEOCODE_CACHE_TTL_MS",
      "OVERPASS_BUSY_MS",
      "OVERPASS_BUSY_MAX_MS",
      "OVERPASS_CACHE_TTL_MS",
      "OVERPASS_CACHE_MAX",
      "MILES_TO_METERS",
      "overpassCache",
      "overpassBusyUntil",
    ],
    "let cacheGen = 0; const geocodeCache = new Map(); __hook.geo = function () { return geocodeCache.size; }; __hook.peek = function () { return overpassCache; }; const statuses = []; function setStatus(s) { statuses.push(s); } function normalizeElements(els, lat, lng) { return els.map((e) => ({ id: e.type + '/' + e.id, origin: [lat, lng] })); }",
    g,
  );
  // Drive the fake clock: run due timers until the promise settles.
  async function run(p) {
    let settled = false,
      val,
      err;
    p.then(
      (v) => {
        settled = true;
        val = v;
      },
      (e) => {
        settled = true;
        err = e;
      },
    );
    for (let guard = 0; guard < 1000 && !settled; guard++) {
      await new Promise((r) => setImmediate(r));
      if (settled) break;
      timers.sort((a, b) => a.at - b.at);
      const next = timers.shift();
      if (next) {
        clock = next.at;
        next.fn();
      }
    }
    if (err) throw err;
    return val;
  }
  // Default: a typed-city search (cacheable). Pass false to model a Locate Me search.
  const fp = (lat, lng, mi, cacheable = true) => F.fetchPlaces(lat, lng, mi, { now: () => clock, cacheable });
  return {
    F,
    fp,
    log,
    run,
    cache: () => g.__hook.peek(),
    geoSize: () => g.__hook.geo(),
    now: () => clock,
    maxInFlight: () => maxInFlight,
    advance: (ms) => {
      clock += ms;
    },
  };
}
const OK = (n) => ({
  status: 200,
  json: { elements: Array.from({ length: n }, (_, i) => ({ type: "node", id: i + 1 })) },
});

t("overpass: one same-origin route to Private.coffee only; no OSM France, no overpass-api.de anywhere (gate 3)", () => {
  const src = read("app.js");
  const proxy = JSON.parse(read(".herenow/proxy.json"));
  assert.ok(src.includes('const OVERPASS_SERVER = { url: "/api/overpass", operator: "Private.coffee" };'));
  assert.ok(!/OVERPASS_MIRRORS|overpass-fr/.test(src), "no mirror list or France route in app.js");
  assert.deepStrictEqual(Object.keys(proxy.proxies).sort(), ["/api/nominatim", "/api/overpass"]);
  assert.strictEqual(proxy.proxies["/api/overpass"].upstream, "https://overpass.private.coffee/api/interpreter");
  const routes = JSON.stringify(proxy);
  for (const f of [
    "app.js",
    ".herenow/proxy.json",
    "privacy.html",
    "privacy/index.html",
    "about.html",
    "about/index.html",
    "index.html",
    "terms.html",
    "terms/index.html",
    "THIRD_PARTY_NOTICES.md",
    "README.md",
    "PRIVACY_GUARDRAILS.md",
    "docs/ARCHITECTURE.md",
  ]) {
    const s = read(f);
    assert.ok(!/overpass-api\.de|overpass-de/.test(s), f);
    assert.ok(
      !/openstreetmap\.fr|OpenStreetMap France|OSM France|overpass-fr/.test(
        s.replace(/[^.\n]*whitelist-only[^.\n]*\./g, ""),
      ),
      f + " still names OSM France",
    );
  }
  for (const f of ["THIRD_PARTY_NOTICES.md", "README.md", "PRIVACY_GUARDRAILS.md", "docs/ARCHITECTURE.md"]) {
    assert.ok(
      /Private\.coffee/.test(read(f)) && /overpass\.private\.coffee|\/api\/overpass/.test(read(f)),
      f + " names Private.coffee",
    );
  }
  assert.ok(!/mail\.ru/.test(routes), "never the mail.ru server");
});
t("overpass: first attempt hangs, one retry on the same server answers; never in parallel", async () => {
  const h = makeFetchPlaces({ "/api/overpass": ["hang", OK(3)] });
  const places = await h.run(h.fp(36.9009, -82.0801, 10));
  assert.strictEqual(places.length, 3);
  assert.deepStrictEqual(
    h.log.map((x) => x.url),
    ["/api/overpass", "/api/overpass"],
  );
  assert.strictEqual(h.log[1].at, 11000, "retry starts when the first attempt aborts at 11 s");
  assert.strictEqual(h.maxInFlight(), 1);
  assert.ok(decodeURIComponent(h.log[0].body).includes("[timeout:10]"));
});
t("overpass: a 5xx gets one retry; a second 5xx shows the clear error", async () => {
  const h = makeFetchPlaces({ "/api/overpass": [{ status: 503, json: {} }, OK(2)] });
  assert.strictEqual((await h.run(h.fp(36.9, -82.08, 10))).length, 2);
  assert.strictEqual(h.log.length, 2);
  const h2 = makeFetchPlaces({ "/api/overpass": { status: 502, json: {} } });
  let err;
  try {
    await h2.run(h2.fp(36.9, -82.08, 10));
  } catch (e) {
    err = e;
  }
  assert.strictEqual(h2.log.length, 2, "exactly one retry");
  assert.strictEqual(h2.F.overpassErrorMessage(err), "OpenStreetMap is down. Try again.");
  // A plain 4xx is not retried.
  const h3 = makeFetchPlaces({ "/api/overpass": { status: 400, json: {} } });
  try {
    await h3.run(h3.fp(36.9, -82.08, 10));
  } catch (_) {}
  assert.strictEqual(h3.log.length, 1);
});
t("overpass: both attempts hang -> clear timeout error at 22 s, under the 25 s cap", async () => {
  const h = makeFetchPlaces({ "/api/overpass": "hang" });
  let err;
  try {
    await h.run(h.fp(37.2698, -81.2223, 10));
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.timedOut, String(err));
  assert.strictEqual(h.F.overpassErrorMessage(err), "OpenStreetMap didn’t answer in time. Try again in a minute.");
  assert.strictEqual(h.now(), 22000, "11 s + one 11 s retry");
  assert.ok(h.now() <= 25000);
  assert.strictEqual(h.log.length, 2, "one attempt plus one retry, no more");
});
t("overpass: no retry when less than 8 s of the cap is left", async () => {
  const h = makeFetchPlaces({ "/api/overpass": "hang" });
  let err;
  try {
    await h.run(h.F.fetchPlaces(36.9, -82.08, 10, { now: h.now, capMs: 18000 })); // 18 - 11 = 7 s left
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.timedOut);
  assert.strictEqual(h.log.length, 1);
  assert.strictEqual(h.now(), 11000);
  assert.ok(/const OVERPASS_RETRY_MIN_MS = 8000;/.test(read("app.js")));
  assert.ok(/const OVERPASS_TOTAL_CAP_MS = 25000;/.test(read("app.js")));
});
t("overpass: 429 shows the busy message at once (no retry) and cools the server for 30 s", async () => {
  const h = makeFetchPlaces({ "/api/overpass": [{ status: 429, json: {} }, OK(2)] });
  let err;
  try {
    await h.run(h.fp(36.9, -82.08, 10));
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.allBusy);
  assert.strictEqual(h.log.length, 1, "a 429 is not retried");
  assert.strictEqual(
    h.F.overpassErrorMessage(err),
    "The OpenStreetMap server is busy right now. Try again in a minute.",
  );
  // 5 s later, still cooling: busy at once, no request sent.
  h.advance(5000);
  let err2;
  try {
    await h.run(h.fp(37.27, -81.22, 10));
  } catch (e) {
    err2 = e;
  }
  assert.ok(err2 && err2.allBusy);
  assert.strictEqual(h.log.length, 1);
  // After the 30 s cooldown it asks again.
  h.advance(30000);
  assert.strictEqual((await h.run(h.fp(37.27, -81.22, 10))).length, 2);
  assert.strictEqual(h.log.length, 2);
  assert.strictEqual(h.F.overpassBusyMs({ headers: { get: () => "90" } }), 90000);
  assert.strictEqual(h.F.overpassBusyMs({ headers: { get: () => "9999" } }), 120000);
  assert.strictEqual(h.F.overpassBusyMs({ headers: { get: () => null } }), 30000);
});
t("overpass: a 406 is also 'busy' (all-busy message)", async () => {
  const h = makeFetchPlaces({ "/api/overpass": { status: 406, json: {} } });
  let err;
  try {
    await h.run(h.fp(36.9, -82.08, 10));
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.allBusy);
  assert.strictEqual(h.log.length, 1);
  assert.strictEqual(
    h.F.overpassErrorMessage(err),
    "The OpenStreetMap server is busy right now. Try again in a minute.",
  );
});
t("overpass: a healthy empty answer is a real empty list; an Overpass timeout remark gets the one retry", async () => {
  const h = makeFetchPlaces({
    "/api/overpass": [
      { status: 200, json: { elements: [], remark: "runtime error: Query timed out" } },
      { status: 200, json: { elements: [] } },
    ],
  });
  assert.deepStrictEqual(await h.run(h.fp(36.9, -82.08, 10)), []);
  assert.strictEqual(h.log.length, 2);
  const h2 = makeFetchPlaces({ "/api/overpass": { status: 200, json: { elements: [] } } });
  assert.deepStrictEqual(await h2.run(h2.fp(36.9, -82.08, 10)), []);
  assert.strictEqual(h2.log.length, 1, "empty is not an error, no retry");
});
t("cache: same rounded area within 10 min reuses the answer, distances use the new origin", async () => {
  const h = makeFetchPlaces({ "/api/overpass": OK(4) });
  await h.run(h.fp(36.90091, -82.08012, 10));
  const again = await h.run(h.fp(36.90094, -82.08014, 10));
  assert.strictEqual(h.log.length, 1);
  assert.strictEqual(JSON.stringify(again[0].origin), "[36.90094,-82.08014]");
  assert.strictEqual(h.F.overpassCacheKey(36.90091, -82.08012, 10), "36.901,-82.080,10");
  h.advance(10 * 60 * 1000 + 1);
  await h.run(h.fp(36.90091, -82.08012, 10));
  assert.strictEqual(h.log.length, 2, "expired after 10 min");
  const src = read("app.js");
  const block = src.slice(src.indexOf("const overpassCache = new Map()"), src.indexOf("async function fetchPlaces("));
  assert.ok(!/localStorage|sessionStorage|indexedDB|caches\./.test(block), "memory only");
});
t("Shade R2: the 10-minute TTL is enforced on every write and read, not only when the same key is read", async () => {
  const h = makeFetchPlaces({ "/api/overpass": OK(2) });
  await h.run(h.fp(36.9, -82.08, 10)); // Lebanon at t=0
  assert.strictEqual(h.cache().size, 1);
  h.advance(10 * 60 * 1000); // exactly 10 min later
  await h.run(h.fp(37.27, -81.22, 10)); // Bluefield write sweeps the stale Lebanon entry
  assert.strictEqual(JSON.stringify([...h.cache().keys()]), '["37.270,-81.220,10"]', "unrelated stale key is gone");
  h.advance(10 * 60 * 1000);
  assert.strictEqual(h.F.overpassCacheGet("nope", h.now()), null);
  assert.strictEqual(h.cache().size, 0, "a read sweeps too");
  const m = new Map([
    ["a", { at: 0 }],
    ["b", { at: 500 }],
  ]);
  h.F.cacheSweep(m, 1000, 1000);
  assert.deepStrictEqual([...m.keys()], ["b"]);
  const src = read("app.js");
  const geo = src.slice(
    src.indexOf("async function geocodePlace("),
    src.indexOf("async function geocodePlaceFromNetwork("),
  );
  assert.strictEqual(
    (geo.match(/cacheSweep\(geocodeCache, GEOCODE_CACHE_TTL_MS, Date\.now\(\)\)/g) || []).length,
    2,
    "geocode read + write sweep",
  );
  assert.ok(/const GEOCODE_CACHE_TTL_MS = 10 \* 60 \* 1000;/.test(src));
});
t("Shade R3: Locate Me (device) searches are never cached; only typed-city searches are", async () => {
  const h = makeFetchPlaces({ "/api/overpass": OK(3) });
  await h.run(h.fp(36.90091, -82.08012, 10, false));
  await h.run(h.fp(36.90091, -82.08012, 10, false));
  assert.strictEqual(h.cache().size, 0, "no device-derived key in overpassCache");
  assert.strictEqual(h.log.length, 2, "each device search asks the server");
  const g2 = makeFetchPlaces({ "/api/overpass": OK(3) });
  await g2.run(g2.F.fetchPlaces(36.9, -82.08, 10, { now: g2.now })); // no flag -> not cached (safe default)
  assert.strictEqual(g2.cache().size, 0);
  const src = read("app.js");
  assert.ok(src.includes("runSearch(pos.coords.latitude, pos.coords.longitude, { glow: true, cacheable: false });"));
  assert.ok(src.includes("await runSearch(hit.lat, hit.lng, { glow: false, placeLabel: near, cacheable: true });"));
  assert.ok(src.includes("runSearch(alt.lat, alt.lng, { glow: false, placeLabel: near, cacheable: true });"));
  assert.ok(
    src.includes("runSearch(state.lat, state.lng, { glow: false, cacheable: state.searchCacheable });"),
    "radius re-search keeps the origin kind",
  );
  assert.ok(src.includes("const places = await fetchPlaces(lat, lng, fetchMi, { cacheable: state.searchCacheable });"));
  const rs = src.slice(src.indexOf("async function runSearch("), src.indexOf("let cityInFlight"));
  assert.ok(/state\.searchCacheable = cacheable === true;/.test(rs));
  const calls = src.match(/\brunSearch\([^)]*\)/g).filter((c) => !/^runSearch\(lat, lng/.test(c));
  assert.ok(calls.length >= 4);
  for (const c of calls) assert.ok(/cacheable:/.test(c), "every call site states its origin kind: " + c);
});
t("Shade R1: Clear location empties both in-page caches", () => {
  const src = read("app.js");
  const wipe = src.slice(src.indexOf("function wipeLocationState("), src.indexOf("/* ---------- About ---------- */"));
  assert.ok(/overpassCache\.clear\(\);/.test(wipe) && /geocodeCache\.clear\(\);/.test(wipe));
  const vm = require("vm");
  const overpassCache = new Map([["36.901,-82.080,10", { at: 0, elements: [] }]]);
  const geocodeCache = new Map([["lebanon va", { at: 0, value: { lat: 36.9, lng: -82.08 } }]]);
  const noop = () => {};
  const ctx = vm.createContext({
    state: { searchGen: 1, lat: 36.9, lng: -82.08, places: [{}], searchCacheable: true },
    overpassCache,
    geocodeCache,
    clearMapLayers: noop,
    showBanner: noop,
    closeDealSheet: noop,
    setLocateBusy: noop,
    syncDietChipsUI: noop,
    syncTrustStrip: noop,
    $: () => null,
    setListRole: noop,
    renderList: noop,
    setNearLine: noop,
    renderPlaceAlternates: noop,
    bumpCacheGen: noop,
    setStatus: noop,
  });
  vm.runInContext(
    src.match(/\n\s*function wipeLocationState\(\)[\s\S]*?\n {2}\}\n/)[0] + "; wipeLocationState();",
    ctx,
  );
  assert.strictEqual(overpassCache.size, 0);
  assert.strictEqual(geocodeCache.size, 0);
  assert.strictEqual(ctx.state.lat, null);
  assert.strictEqual(ctx.state.searchCacheable, false);
});
t("Shade B2: a search that started before Clear location never writes to either cache", async () => {
  const h = makeFetchPlaces({ "/api/overpass": ["hang", OK(2)] });
  const p = h.fp(36.9, -82.08, 10); // typed-city search, first attempt in flight
  h.F.bumpCacheGen(); // Clear location while it is in flight
  const places = await h.run(p);
  assert.strictEqual(places.length, 2, "the answer is still returned to its (stale) caller");
  assert.strictEqual(h.cache().size, 0, "but it is not cached");
  await h.run(h.fp(36.9, -82.08, 10));
  assert.strictEqual(h.cache().size, 1, "a new search after the clear caches normally");
  const src = read("app.js");
  const wipe = src.slice(src.indexOf("function wipeLocationState("), src.indexOf("/* ---------- About ---------- */"));
  assert.ok(/bumpCacheGen\(\);/.test(wipe));
  const geo = src.slice(
    src.indexOf("async function geocodePlace("),
    src.indexOf("async function geocodePlaceFromNetwork("),
  );
  assert.ok(
    /const gen = cacheGen;\s*\n\s*const value = await geocodePlaceFromNetwork\(q\);\s*\n\s*if \(gen !== cacheGen\) return value;/.test(
      geo,
    ),
  );
  assert.ok(/if \(cacheable && gen === cacheGen\) overpassCachePut\(key, elements, now\(\)\);/.test(src));
});
t("Shade B1: both caches are also swept every 60 s while the page is open", () => {
  const h = makeFetchPlaces({});
  const src = read("app.js");
  assert.ok(/const CACHE_SWEEP_INTERVAL_MS = 60 \* 1000;/.test(src));
  assert.ok(
    /setInterval\(function \(\) \{\s*\n\s*sweepAllCaches\(Date\.now\(\)\);\s*\n\s*\}, CACHE_SWEEP_INTERVAL_MS\);/.test(
      src,
    ),
  );
  h.F.overpassCachePut("a", [], 0);
  h.F.overpassCachePut("b", [], 9 * 60 * 1000);
  h.F.sweepAllCaches(10 * 60 * 1000);
  assert.deepStrictEqual([...h.cache().keys()], ["b"]);
  assert.strictEqual(h.geoSize(), 0);
});
t("operator line: the approved wording (no personal name) on every page (Navi, reverting gate 3 R1)", () => {
  const terms =
    "The Service is designed, published, and operated by an individual website developer (the “Operator”), not by a restaurant, franchise, or food-service company.";
  for (const f of ["terms.html", "terms/index.html"]) assert.ok(read(f).includes(terms), f);
  const privacy =
    "RangeBites is an information-only food app at rangebites.com, designed, published, and operated by an individual website developer (the “Operator”).";
  for (const f of ["privacy.html", "privacy/index.html"]) assert.ok(read(f).includes(privacy), f);
  const about =
    "RangeBites is designed, published, and operated by an individual website developer in Virginia, USA (the “Operator”), not a restaurant.";
  for (const f of ["index.html", "about.html", "about/index.html"]) assert.ok(read(f).includes(about), f);
});
t("no personal surname in any shipped or docs file (Navi)", () => {
  const surname = ["Bill", "ings"].join(""); // built at runtime so this test file never contains it
  const hits = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (/^(node_modules|\.git)$/.test(e.name)) continue;
      const rel = dir ? dir + "/" + e.name : e.name;
      if (e.isDirectory()) walk(rel);
      else if (
        /\.(html|js|mjs|css|json|txt|md|xml|webmanifest|svg|py|yml|yaml)$/i.test(e.name) &&
        read(rel).includes(surname)
      )
        hits.push(rel);
    }
  })("");
  assert.deepStrictEqual(hits, [], "surname found in: " + hits.join(", "));
});
t("assent wording: Continue line and 'Use of RangeBites is subject to' (Gavel polish)", () => {
  const idx = read("index.html");
  assert.ok(
    idx.includes(
      'By tapping Continue you agree to the <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Policy</a>.',
    ),
  );
  assert.ok(
    idx.includes('<p class="site-footer-assent">Use of RangeBites is subject to the <a href="/terms">Terms</a>'),
  );
  for (const f of ["terms.html", "terms/index.html", "privacy.html", "privacy/index.html"])
    assert.ok(read(f).includes("Use of RangeBites is subject to the Terms of Use."), f);
  for (const f of ["index.html", "about.html", "about/index.html"])
    assert.ok(
      read(f).includes('not a restaurant. Use of RangeBites is subject to the <a href="/terms">Terms of Use</a>'),
      f,
    );
  for (const f of [
    "index.html",
    "about.html",
    "about/index.html",
    "terms.html",
    "terms/index.html",
    "privacy.html",
    "privacy/index.html",
  ])
    assert.ok(!/By using (RangeBites|it) you agree/.test(read(f)), f);
});
t("gate 3 nits: Terms 'never saved' and Continue assent; Privacy Share-link exception", () => {
  for (const f of ["terms.html", "terms/index.html"]) {
    const s = read(f);
    assert.ok(
      s.includes("Location, if you choose to share it, is used only for the current search and is never saved."),
      f,
    );
    assert.ok(!s.includes("location history"), f);
    assert.ok(
      s.includes(
        "You agree to these Terms by tapping Continue. If you keep using the site after seeing the notice, that also means you agree.",
      ),
      f,
    );
  }
  for (const f of ["privacy.html", "privacy/index.html"]) {
    assert.ok(
      read(f).includes(
        "The city is not added to the page address. If you tap Share, the shared link includes the city you searched. The city is not saved on this device or on the host.",
      ),
      f,
    );
  }
});
t("runSearch failsafe fires after the total cap, not after 40 s+", () => {
  const src = read("app.js");
  const rs = src.slice(src.indexOf("async function runSearch("), src.indexOf("let cityInFlight"));
  assert.ok(/\}, OVERPASS_TOTAL_CAP_MS \+ 2000\);/.test(rs));
});

/* ---------- a11y ---------- */
t("markers: user pin and place pins get accessible names", () => {
  const M = load("app.js", ["markerOptions"]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(M.markerOptions("Joe's Diner"))), {
    title: "Joe's Diner",
    alt: "Joe's Diner",
    keyboard: true,
  });
  assert.strictEqual(M.markerOptions("  ").title, "Place");
  assert.strictEqual(M.markerOptions("x".repeat(300)).title.length, 120);
  const src = read("app.js");
  assert.ok(src.includes('markerOptions("Search center", { icon, zIndexOffset: 1000 })'));
  assert.ok(/L\.marker\(\[p\.lat, p\.lng\], markerOptions\(p\.name/.test(src));
});
t("lists: role=list only while items exist; items are role=listitem wrappers", () => {
  const attrs = {};
  const el = {
    setAttribute: (k, v) => {
      attrs[k] = v;
    },
    removeAttribute: (k) => {
      delete attrs[k];
    },
  };
  const L = load("app.js", ["setListRole", "listItemHtml"]);
  L.setListRole(el, "Deals", true);
  assert.deepStrictEqual(attrs, { role: "list", "aria-label": "Deals" });
  L.setListRole(el, "Deals", false);
  assert.deepStrictEqual(attrs, {});
  assert.strictEqual(
    L.listItemHtml("<button>x</button>"),
    '<div class="rb-li" role="listitem"><button>x</button></div>',
  );
  const html = read("index.html");
  assert.ok(!/id="openStripTrack"[^>]*role="list"/.test(html) && !/id="dealRail"[^>]*role="list"/.test(html));
  assert.ok(
    !/role="listitem"/.test(read("app.js").replace(/function listItemHtml[\s\S]*?\n {2}\}/, "")),
    "buttons no longer carry role=listitem",
  );
  assert.ok(/\.rb-li\s*\{\s*display:\s*contents;\s*\}/.test(read("styles.css")));
});

/* ---------- copy ---------- */
t("privacy: §1 Operator / §1a Non-tracking in the right places; new storage sentence; NEL disclosed", () => {
  const sentence = "does not store information about you on its servers; some choices are kept only on this device.";
  // Gavel gate 1 (gavel/gate1-20261004b.md), verbatim.
  const nel =
    "Files are hosted on here.now, which runs on Cloudflare. If a page fails to load, your browser may send Cloudflare a network-error report; RangeBites does not receive or keep it.";
  const gavel = [
    "Places are found by the Overpass API server run by Private.coffee (overpass.private.coffee).",
    "Our host sees your IP address when it passes the search along. Because the request goes through our host, the Overpass and Nominatim servers receive the request from our host, not from your device.",
    "Your browser’s language preference (Accept-Language) is passed along; it only affects place-name lookups (Nominatim), which use it to choose the language of place names.",
    "Locate Me searches are never cached. Cached answers are dropped after about 10 minutes, when you tap Clear location, or when the page closes, and are never written to this device or to our host.",
    "The host may keep its own connection log. The host also counts requests from each IP address for up to about an hour to stop overuse; RangeBites cannot see or keep those counts.",
    "A city you type is looked up by the Nominatim geocoder run by the OpenStreetMap Foundation (nominatim.openstreetmap.org).",
    "Restaurant names, hours, and maps come from OpenStreetMap (ODbL), and some chain hours come from AllThePlaces store-locator data (CC0). Both are used as-is and may be wrong.",
    "which sees your IP address and the map area you view",
  ];
  const gone = [
    "The host and those services also see your IP address.",
    "The host sees the connection’s IP address on the proxied request.",
    "which looks up a city you type",
    "Hours combine OpenStreetMap (ODbL) with AllThePlaces (CC0).",
  ];
  for (const f of ["privacy.html", "privacy/index.html"]) {
    const s = read(f);
    assert.ok(s.includes(sentence), f);
    assert.ok(s.includes(nel), f);
    for (const g of gavel) assert.ok(s.includes(g), f + ": " + g.slice(0, 50));
    for (const g of gone) assert.ok(!s.includes(g), f + " still has: " + g.slice(0, 50));
    assert.ok(s.includes("Effective <span data-publish-date>October 5, 2026</span>"), f + " effective date");
    const op = s.indexOf("1. Operator"),
      nt = s.indexOf("1a.");
    assert.ok(op > 0 && nt > op, f + " heading order");
    const opBody = s.slice(op, nt);
    assert.ok(
      !/does not track|no tracking|tracking/i.test(opBody.replace(/<h2[^>]*>.*?<\/h2>/, "")) || /operat/i.test(opBody),
      f,
    );
    assert.ok(
      /Private\.coffee/.test(s) && !/OpenStreetMap France/.test(s),
      f + " names only Private.coffee for Overpass",
    );
    assert.ok(!/FOSSGIS e\.V\. \(overpass/.test(s), f + " FOSSGIS named only for tiles");
  }
  const about =
    "Our host sees the search and your IP address; the Overpass and Nominatim servers receive the request from our host, not from your device.";
  for (const f of ["about.html", "about/index.html", "index.html"]) {
    assert.ok(read(f).includes(about), f);
    assert.ok(!read(f).includes("The host and those services see the search and your IP."), f);
  }
  // Proof: every HTML page, not just a fixed list. Any "does not store (any) information about you" must
  // go on with "on its servers" (the device does keep some choices).
  const htmlFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (/^(node_modules|\.git|vendor|shot|tests)$/.test(e.name)) continue;
      const rel = dir ? dir + "/" + e.name : e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".html")) htmlFiles.push(rel);
    }
  })("");
  assert.ok(htmlFiles.length >= 20, "found " + htmlFiles.length + " pages");
  for (const f of htmlFiles) {
    const text = read(f)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    const re = /does not store (?:any )?information about you(?! on its servers)/g;
    assert.ok(!re.test(text), f + ": storage sentence must say 'on its servers'");
  }
  for (const f of ["terms.html", "terms/index.html"]) {
    assert.ok(
      read(f).includes(
        "It does not store information about you on its servers; some choices are kept only on this device.",
      ),
      f,
    );
  }
  for (const f of htmlFiles)
    assert.ok(/<meta name="referrer" content="[a-z-]+"/.test(read(f)), f + " has a meta referrer");
});
t("pantries: query and filter accept social_facility food_bank/soup_kitchen", () => {
  const A = load("app.js", ["roundCoord3", "buildOverpassQuery"], ["OVERPASS_TIMEOUT_S"]);
  const q = A.buildOverpassQuery(36.9, -82.08, 16093);
  assert.ok(
    q.includes(
      'nwr["amenity"="social_facility"]["social_facility"~"^(food_bank|soup_kitchen)$"]["name"](around:16213,36.900,-82.080);',
    ),
  );
  const P = load("app.js", ["isTaggedFreeFood"]);
  assert.ok(P.isTaggedFreeFood({ amenity: "food_bank" }));
  assert.ok(P.isTaggedFreeFood({ amenity: "social_facility", social_facility: "food_bank" }));
  assert.ok(P.isTaggedFreeFood({ amenity: "social_facility", social_facility: "soup_kitchen" }));
  assert.ok(!P.isTaggedFreeFood({ amenity: "social_facility", social_facility: "group_home" }));
  assert.ok(!P.isTaggedFreeFood({ amenity: "restaurant" }));
});
t("dedupe: a merged node+way pair keeps both ids in mergedIds", () => {
  const A = load("app.js", ["haversineMiles", "normWord", "mergeDuplicateElements"]);
  const input = [
    {
      type: "way",
      id: 1023825062,
      center: { lat: 36.9, lon: -82.08 },
      tags: { name: "Out of Town Café", cuisine: "american" },
    },
    { type: "node", id: 10202814796, lat: 36.9001, lon: -82.0801, tags: { name: "Out of Town Cafe" } },
  ];
  const before = JSON.stringify(input);
  const out = A.mergeDuplicateElements(input);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type + "/" + out[0].id, "node/10202814796", "node is the keeper");
  assert.strictEqual(JSON.stringify(out[0].mergedIds), '["way/1023825062"]');
  assert.strictEqual(out[0].tags.cuisine, "american", "gaps filled from the way");
  assert.strictEqual(JSON.stringify(input), before, "input (the in-page cache) is not mutated");
  assert.strictEqual(A.mergeDuplicateElements(input)[0].mergedIds.length, 1, "re-merging does not pile up ids");
});

/* ---------- hours: nth weekday ---------- */
t("hours: Sa[4], Su[-1], Mo[1,3] match only those weeks (Oct 2026)", () => {
  const H = load(
    "app.js",
    [
      "ohParseTime",
      "ohParseSelectorAndTimes",
      "ohParse",
      "nthWeekday",
      "isUsFederalHoliday",
      "ohIsHoliday",
      "ohNthMatches",
      "ohDaySpans",
    ],
    ["OH_DAY_IDX", "OH_SEL_ITEM", "OH_SELECTOR_RE", "OH_DAYLIST_ONLY_RE", "ohCache"],
    'let hoursCountry = "us";',
  );
  const spans = (s, y, m, d) => H.ohDaySpans(H.ohParse(s), new Date(y, m, d, 12), 36.9, -82.08).spans.length;
  assert.strictEqual(spans("Sa[4] 09:00-11:00", 2026, 9, 24), 1, "4th Saturday");
  assert.strictEqual(spans("Sa[4] 09:00-11:00", 2026, 9, 17), 0);
  assert.strictEqual(spans("Su[-1] 12:00-14:00", 2026, 9, 25), 1, "last Sunday");
  assert.strictEqual(spans("Su[-1] 12:00-14:00", 2026, 9, 18), 0);
  assert.strictEqual(spans("Mo[1,3] 10:00-12:00", 2026, 9, 5), 1);
  assert.strictEqual(spans("Mo[1,3] 10:00-12:00", 2026, 9, 19), 1);
  assert.strictEqual(spans("Mo[1,3] 10:00-12:00", 2026, 9, 12), 0);
  assert.strictEqual(spans("Th 10:00-17:00; Sa[4] 09:00-11:00", 2026, 9, 22), 1, "plain rules still work beside nth");
  assert.strictEqual(spans("Mo-Fr 09:00-17:00", 2026, 9, 5), 1);
  assert.strictEqual(H.ohParse("[1] 09:00-10:00"), null, "a bare bracket is still unknown");
});

/* ---------- polish ---------- */
t("hours ranges stay on one line; text is still escaped", () => {
  const H = load("app.js", ["escapeHtml", "hoursRangeHtml"]);
  assert.strictEqual(
    H.hoursRangeHtml("Open now · Today 4:30am–11pm, 12pm–6pm"),
    'Open now · Today <span class="rb-nowrap">4:30am–11pm</span>, <span class="rb-nowrap">12pm–6pm</span>',
  );
  assert.strictEqual(
    H.hoursRangeHtml("<b>Mo 9am–5pm</b>"),
    '&lt;b&gt;Mo <span class="rb-nowrap">9am–5pm</span>&lt;/b&gt;',
  );
  assert.ok(/\.rb-nowrap\s*\{\s*white-space:\s*nowrap;/.test(read("styles.css")));
  assert.ok(
    /\.nav-btn,\s*\n\.place-card button,\s*\n\.place-card \.chip\s*\{\s*overflow-wrap:\s*normal;/.test(
      read("styles.css"),
    ),
  );
});

/* ---------- assets ---------- */
t("share image and favicons exist at the declared sizes", () => {
  const png = (f) => {
    const b = fs.readFileSync(path.join(root, f));
    assert.strictEqual(b.toString("ascii", 1, 4), "PNG", f);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };
  assert.deepStrictEqual(png("og-image.png"), [1200, 630]);
  assert.deepStrictEqual(png("favicon-32.png"), [32, 32]);
  assert.deepStrictEqual(png("favicon-16.png"), [16, 16]);
  const html = read("index.html");
  assert.ok(html.includes('content="https://rangebites.com/og-image.png"'));
  assert.ok(
    html.includes('<meta property="og:image:width" content="1200"') &&
      html.includes('<meta property="og:image:height" content="630"'),
  );
});

(async () => {
  let pass = 0;
  for (const [name, f] of tests) {
    try {
      await f();
      pass++;
      console.log("ok -", name);
    } catch (e) {
      console.error("FAIL -", name);
      console.error(e);
      process.exitCode = 1;
    }
  }
  console.log(pass + " passed, " + (tests.length - pass) + " failed");
})();
