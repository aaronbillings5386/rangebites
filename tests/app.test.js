"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const { load } = require("./extract");
let pass = 0;
function t(name, f) {
  f();
  pass++;
  console.log("ok -", name);
}

const A = load(
  "app.js",
  [
    "haversineMiles",
    "roundCoord3",
    "buildOverpassQuery",
    "mergeDuplicateElements",
    "sortNearestFirst",
    "isFakeDemoPhone",
    "telHref",
    "formatPhoneDisplay",
    "prettyOsmValue",
    "prettyCuisineList",
    "geoErrorMessage",
    "normWord",
    "geocodeLooksDifferent",
    "looksLikePostal",
    "milesToMeters",
    "hoursTimeZone",
    "placeNow",
    "friendlyHoursLine",
    "hoursOriginLabel",
  ],
  ["OVERPASS_TIMEOUT_S", "OSM_VALUE_LABELS"],
);

t("haversine: 1 deg latitude ~ 69.1 mi; zero distance", () => {
  assert.ok(Math.abs(A.haversineMiles(37, -81, 38, -81) - 69.1) < 0.2);
  assert.strictEqual(A.haversineMiles(37.27, -81.22, 37.27, -81.22), 0);
  // Bluefield WV -> Lebanon VA, roughly 50-60 mi straight line
  const d = A.haversineMiles(37.2698, -81.2223, 36.9009, -82.0801);
  assert.ok(d > 45 && d < 60, d);
});
t("Overpass query: coordinates rounded to 3 decimals, radius padded 120 m", () => {
  const q = A.buildOverpassQuery(37.2698123, -81.2223456, 16093.4, "full");
  assert.ok(q.includes("(around:16213,37.270,-81.222)"), q.slice(0, 300));
  assert.ok(!/37\.2698/.test(q) && !/81\.2223/.test(q));
  // 20261004b: one query shape; [timeout:10] stays under the ~11 s per-mirror client budget.
  assert.ok(q.startsWith("[out:json][timeout:10]"));
  assert.strictEqual(A.roundCoord3(-0.0004), -0);
});
t("dedupe: node + way same name nearby merge; two nodes (chain branches) stay", () => {
  const els = [
    {
      type: "way",
      id: 2,
      center: { lat: 37.27, lon: -81.22 },
      tags: { name: "Joe's Diner", phone: "+1 276 555 1234" },
    },
    { type: "node", id: 1, lat: 37.2701, lon: -81.2201, tags: { name: "Joes Diner" } },
    { type: "node", id: 3, lat: 37.2702, lon: -81.2202, tags: { name: "McDonald's" } },
    { type: "node", id: 4, lat: 37.2703, lon: -81.2203, tags: { name: "McDonald's" } },
  ];
  const out = A.mergeDuplicateElements(els);
  assert.strictEqual(out.length, 3);
  const joe = out.find((e) => /joe/i.test(e.tags.name));
  assert.strictEqual(joe.type, "node");
  assert.strictEqual(joe.tags.phone, "+1 276 555 1234");
});
t("sort: nearest first", () => {
  if (!A.sortNearestFirst) return;
  const s = A.sortNearestFirst([
    { miles: 3, name: "c" },
    { miles: 0.5, name: "a" },
    { miles: 1, name: "b" },
  ]);
  assert.deepStrictEqual(
    s.map((p) => p.name),
    ["a", "b", "c"],
  );
});
t("phones: real 555 numbers kept; reserved 555-01xx hidden; tel: from raw digits", () => {
  assert.strictEqual(A.isFakeDemoPhone("+1 276-555-1234"), false);
  assert.strictEqual(A.isFakeDemoPhone("(555) 867-5309"), false);
  assert.strictEqual(A.isFakeDemoPhone("+1 202-555-0142"), true);
  assert.strictEqual(A.telHref("+12768895501"), "tel:+12768895501");
  assert.strictEqual(A.telHref("+1 276-889-4492; +1 276-889-0000"), "tel:+12768894492");
  assert.strictEqual(A.formatPhoneDisplay("+12768895501"), "(276) 889-5501");
  assert.strictEqual(A.formatPhoneDisplay("+1 276-889-4492"), "(276) 889-4492");
  assert.strictEqual(A.formatPhoneDisplay("2768894492"), "(276) 889-4492");
  assert.strictEqual(A.formatPhoneDisplay("+44 20 7946 0958"), "+44 20 7946 0958");
  assert.strictEqual(A.formatPhoneDisplay(""), "");
});
t("prettify OSM values", () => {
  assert.strictEqual(A.prettyOsmValue("coffee_shop"), "Coffee shop");
  assert.strictEqual(A.prettyOsmValue("pizza"), "Pizza");
  assert.strictEqual(A.prettyOsmValue("tex_mex"), "Tex-Mex");
  assert.strictEqual(A.prettyOsmValue("some_new_value"), "Some new value");
  assert.strictEqual(A.prettyOsmValue("McDonald's"), "McDonald's");
  assert.strictEqual(A.prettyCuisineList("pizza;italian;Pizza"), "Pizza, Italian");
  assert.strictEqual(A.prettyCuisineList("burger; american"), "Burgers, American");
});
t("Locate Me: separate messages for denied / unavailable / timeout", () => {
  const m = [1, 2, 3].map((code) => A.geoErrorMessage({ code }));
  assert.strictEqual(new Set(m).size, 3);
  assert.ok(/blocked/i.test(m[0]) && /couldn.t find/i.test(m[1]) && /timed out/i.test(m[2]));
});
t("open/closed clock: New York or Chicago only inside the US box", () => {
  assert.strictEqual(A.hoursTimeZone(37.27, -81.22), "America/New_York");
  assert.strictEqual(A.hoursTimeZone(36.17, -86.78), "America/New_York");
  assert.strictEqual(A.hoursTimeZone(41.88, -87.63), "America/Chicago");
  assert.strictEqual(A.hoursTimeZone(32.78, -96.8), "America/Chicago");
  const abroad = [
    [51.5, -0.12, "London"],
    [48.86, 2.35, "Paris"],
    [35.68, 139.65, "Tokyo"],
    [22.3, 114.2, "Hong Kong"],
  ];
  for (const [lat, lng, name] of abroad) {
    const zone = A.hoursTimeZone(lat, lng);
    assert.ok(zone !== "America/New_York" && zone !== "America/Chicago", name + " got " + zone);
  }
  const nyHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "numeric" }).format(
      new Date(),
    ),
  );
  const chiHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23", hour: "numeric" }).format(
      new Date(),
    ),
  );
  assert.strictEqual(A.placeNow(-81.22, 37.27).getHours(), nyHour);
  assert.strictEqual(A.placeNow(-87.63, 41.88).getHours(), chiHour);
  const tokyoZone = A.hoursTimeZone(35.68, 139.65);
  const tokyoNow = A.placeNow(139.65, 35.68);
  if (tokyoZone === "") {
    assert.strictEqual(tokyoNow, null);
    assert.strictEqual(
      A.friendlyHoursLine({ hours: "Mo-Su 09:00-17:00", lat: 35.68, lng: 139.65 }),
      "Hours tagged · verify",
    );
  } else {
    assert.strictEqual(tokyoZone, "device");
    assert.notStrictEqual(tokyoNow.getHours(), nyHour);
  }
  assert.strictEqual(
    A.friendlyHoursLine({ hours: "Mo-Su 09:00-17:00", lat: 48.86, lng: 2.35 }, null),
    "Hours tagged · verify",
  );
});
t("hours labels name AllThePlaces when that is the source", () => {
  assert.strictEqual(A.hoursOriginLabel("atp"), "Chain hours (AllThePlaces)");
  assert.strictEqual(A.hoursOriginLabel("osm"), "OSM hours");
  assert.strictEqual(A.hoursOriginLabel(""), "OSM hours");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes("Tagged open · verify"));
  assert.ok(!html.includes("Tagged open (OSM"));
  const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.ok(!src.includes("Opens soon · OSM hours"));
  assert.ok(!src.includes("Closes soon · OSM hours"));
});
t("geocoder mismatch warning (no network)", () => {
  assert.strictEqual(
    A.geocodeLooksDifferent("Lebannon VA", { name: "Lebanon Church", display_name: "Lebanon Church, Virginia" }),
    true,
  );
  assert.strictEqual(
    A.geocodeLooksDifferent("Bluefield", { name: "Bluefield", display_name: "Bluefield, West Virginia" }),
    false,
  );
  assert.strictEqual(
    A.geocodeLooksDifferent("lebanon, va", { name: "Lebanon", display_name: "Lebanon, Russell County, Virginia" }),
    false,
  );
  assert.strictEqual(A.geocodeLooksDifferent("24266", { name: "24266" }), false);
});

// forge 20261003 (Gate G1/G2/G5/G6)
const G = load(
  "app.js",
  [
    "normWord",
    "haversineMiles",
    "looksLikePostal",
    "pickGeocodeHit",
    "geocodeHitToPlace",
    "geocodeShortLabel",
    "geocodeAlternates",
    "cityLookupErrorMessage",
    "osmStreetLine",
    "escapeHtml",
    "ohParseTime",
    "ohParseSelectorAndTimes",
    "ohParse",
    "nthWeekday",
    "isUsFederalHoliday",
    "ohIsHoliday",
    "ohNthMatches",
    "ohDaySpans",
    "isLateNightHours",
  ],
  ["OH_DAY_IDX", "OH_SEL_ITEM", "OH_SELECTOR_RE", "OH_DAYLIST_ONLY_RE", "ohCache"],
  'let hoursCountry = "us"; const state = { lng: -82 }; function placeNow() { return new Date(); }',
);
const bristol = JSON.parse(fs.readFileSync(path.join(__dirname, "fixture-nominatim-bristol.json"), "utf8"));
t("G2 Bristol: picks VA; alternates deduped, US first, TN offered, no counties", () => {
  const hit = G.pickGeocodeHit(bristol);
  assert.strictEqual(G.geocodeShortLabel(hit), "Bristol, VA");
  const alts = G.geocodeAlternates(bristol, hit).map((a) => a.shortLabel);
  assert.ok(alts.includes("Bristol, TN"), alts.join(" | "));
  assert.strictEqual(new Set(alts).size, alts.length);
  assert.strictEqual(alts.filter((a) => /United Kingdom/.test(a)).length, 1, alts.join(" | "));
  assert.ok(!alts.some((a) => /County|VA$/.test(a)), alts.join(" | "));
  const firstNonUs = alts.findIndex((a) => !/, [A-Z]{2}$/.test(a));
  assert.ok(firstNonUs === -1 || alts.slice(firstNonUs).every((a) => !/, [A-Z]{2}$/.test(a)), "US first");
  assert.ok(alts.length <= 5);
});
t("G1 city lookup errors: 429/timeout read 'OpenStreetMap is busy'", () => {
  assert.ok(/^OpenStreetMap is busy/.test(G.cityLookupErrorMessage({ busy: true })));
  assert.ok(/^OpenStreetMap is busy/.test(G.cityLookupErrorMessage({ name: "AbortError" })));
  assert.ok(/look up that city/.test(G.cityLookupErrorMessage(new Error("x"))));
});
t("G6 street line: housenumber + street (+ city), omitted without a street, escaped on the card", () => {
  assert.strictEqual(
    G.osmStreetLine({ "addr:housenumber": "123", "addr:street": "Main St", "addr:city": "Lebanon" }),
    "123 Main St, Lebanon",
  );
  assert.strictEqual(G.osmStreetLine({ "addr:street": "Main St" }), "Main St");
  assert.strictEqual(G.osmStreetLine({ "addr:housenumber": "123", "addr:city": "Lebanon" }), "");
  assert.strictEqual(G.osmStreetLine({}), "");
  assert.strictEqual(
    G.escapeHtml(G.osmStreetLine({ "addr:street": "<img src=x onerror=alert(1)>" })),
    "&lt;img src=x onerror=alert(1)&gt;",
  );
});
t("G5 Late night uses today's closing time only", () => {
  const thu = new Date(2026, 9, 1, 15, 0); // Thu Oct 1 2026, 3pm
  const sat = new Date(2026, 9, 3, 15, 0); // Sat Oct 3 2026
  const southern = "Mo-Th 11:00-21:00; Fr,Sa 11:00-23:00";
  assert.strictEqual(G.isLateNightHours(southern, thu, 36.6, -82.2), false); // closes 9pm today
  assert.strictEqual(G.isLateNightHours(southern, sat, 36.6, -82.2), true);
  assert.strictEqual(G.isLateNightHours("Mo-Fr 00:00-03:00, 11:00-24:00", thu, 36.6, -82.2), true);
  assert.strictEqual(G.isLateNightHours("Fr,Sa 11:00-02:00; Su,Mo closed", thu, 36.6, -82.2), false);
  assert.strictEqual(G.isLateNightHours("Fr,Sa 11:00-02:00", sat, 36.6, -82.2), true);
  assert.strictEqual(G.isLateNightHours("", sat), false);
  assert.strictEqual(G.isLateNightHours("sunrise-sunset", sat), false);
});
t("G4 Late night / Saved buttons declare aria-pressed", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(/id="filterSaved" aria-pressed="false"/.test(html));
  assert.ok(/id="filterLateNight" aria-pressed="false"/.test(html));
});
t("G3 no frame-ancestors in any meta CSP", () => {
  const root = path.join(__dirname, "..");
  const pages = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.name.startsWith(".") || f.name === "node_modules" || f.name === "vendor") continue;
      const fp = path.join(d, f.name);
      if (f.isDirectory()) walk(fp);
      else if (f.name.endsWith(".html")) pages.push(fp);
    }
  })(root);
  assert.ok(pages.length >= 8, pages.length);
  for (const fp of pages) {
    const metas = fs.readFileSync(fp, "utf8").match(/<meta[^>]+Content-Security-Policy[^>]*>/gi) || [];
    metas.forEach((m) => assert.ok(!/frame-ancestors/i.test(m), fp));
  }
});

// deals.js: "Mentions:" labels and negation
const dsrc = fs.readFileSync(path.join(__dirname, "..", "deals.js"), "utf8");
const win = {};
vm.runInNewContext(dsrc, { window: win, Object, RegExp, Math, String });
const D = win.RangeBitesDeals;
t("promo badges read 'Mentions: …'", () => {
  assert.strictEqual(D.matchDeal({ description: "Ask about our coupon" }).label, "Mentions: coupon");
  assert.strictEqual(D.matchDeal({ description: "Join rewards" }).label, "Mentions: rewards");
  assert.strictEqual(D.matchDeal({ description: "Tuesdays 20% off" }).label, "Mentions: % off");
});
t("negated promo terms are not badges", () => {
  assert.strictEqual(D.matchDeal({ description: "No coupons accepted" }), null);
  assert.strictEqual(D.matchDeal({ description: "Coupons not accepted" }), null);
  assert.strictEqual(D.matchDeal({ description: "We do not offer happy hour" }), null);
  assert.strictEqual(D.matchDeal({ description: "No coupons. Happy hour 4-6" }).label, "Mentions: happy hour");
  assert.strictEqual(D.matchDeal({ description: "" }), null);
});

// No as-you-type geocoding: the unused fetchPlaceSuggest was removed in 20261004b.
t("no Nominatim autocomplete path", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const m = /function schedulePlaceSuggest\([^)]*\)\s*\{([\s\S]*?)\n {2}\}/.exec(src);
  assert.ok(m && !/fetch\(|geocodePlace/.test(m[1]));
  assert.strictEqual((src.match(/fetchPlaceSuggest\(/g) || []).length, 0);
});
t("legacy-cleanup.js does not write a found record", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "legacy-cleanup.js"), "utf8");
  assert.ok(!/JSON\.stringify\(\{ kind: "found" \}\)/.test(src));
  assert.ok(!/kind:\s*"found"/.test(src));
  assert.ok(!/function markHelped/.test(src));
  assert.ok(!/\.herenow\/data\//.test(src));
  assert.ok(!/device:\s*id/.test(src));
  assert.ok(!/\bfetch\s*\(/.test(src));
});
const T = load("app.js", [
  "termsAcceptedForVersion",
  "termsNoticePending",
  "screenshotBypassPrefs",
  "shouldShowContinueSheet",
]);
const C = load("config.js", ["publishDateLabel"]);
t("shot=1 does not store terms acceptance", () => {
  const out = T.screenshotBypassPrefs({ termsAcceptedVersion: "", onboardDismissed: false });
  assert.strictEqual(out.onboardDismissed, true);
  assert.strictEqual(out.heroTipHidden, true);
  assert.strictEqual(out.a2hsDismissed, true);
  assert.strictEqual(out.termsAcceptedVersion, "");
  assert.strictEqual(T.termsAcceptedForVersion(out.termsAcceptedVersion, "2026-10-03"), false);
  const fromBoolean = T.screenshotBypassPrefs({ termsAccepted: true });
  assert.strictEqual(fromBoolean.termsAcceptedVersion, "");
  const kept = T.screenshotBypassPrefs({ termsAcceptedVersion: "2026-10-03" });
  assert.strictEqual(kept.termsAcceptedVersion, "2026-10-03");
  const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const shot = /if \(shot\) \{[\s\S]*?\n {4}\}/.exec(src);
  assert.ok(shot, "shot block");
  assert.ok(!/termsAccepted\s*=\s*true/.test(shot[0]));
  assert.ok(/screenshotBypassPrefs\(/.test(shot[0]));
});
t("stored acceptance matches TERMS_VERSION only", () => {
  assert.strictEqual(T.termsAcceptedForVersion("2026-10-03", "2026-10-03"), true);
  assert.strictEqual(T.termsAcceptedForVersion("2026-09-01", "2026-10-03"), false);
  assert.strictEqual(T.termsAcceptedForVersion(true, "2026-10-03"), false);
  assert.strictEqual(T.termsAcceptedForVersion("", "2026-10-03"), false);
  assert.strictEqual(T.termsNoticePending("", "2026-10-03"), true);
  assert.strictEqual(T.termsNoticePending("2026-09-01", "2026-10-03"), true);
  assert.strictEqual(T.termsNoticePending("2026-10-03", "2026-10-03"), false);
  const cfg = fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8");
  assert.ok(/const PUBLISH_DATE = "2026-10-05"/.test(cfg));
  assert.ok(/TERMS_VERSION: PUBLISH_DATE/.test(cfg));
  assert.strictEqual(C.publishDateLabel("2026-10-03"), "October 3, 2026");
  assert.strictEqual(C.publishDateLabel("2026-10-04"), "October 4, 2026");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes("Terms updated <span data-publish-date>October 5, 2026</span>"));
  assert.ok(html.includes('href="/terms"'));
  assert.ok(
    /By using RangeBites you agree to the <a href="\/terms">Terms<\/a> and <a href="\/privacy">Privacy<\/a>/.test(html),
  );
  assert.strictEqual((cfg.match(/2026-10-05/g) || []).length, 1);
  assert.strictEqual((cfg.match(/2026-10-0[34]/g) || []).length, 0);
  for (const page of ["index.html", "about.html", "about/index.html", "privacy.html", "privacy/index.html"]) {
    const pageSrc = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const bits = pageSrc.split("rounded to 3 decimal places");
    assert.ok(bits.length > 1, page);
    for (let i = 1; i < bits.length; i++) {
      assert.ok(!/anonymous/i.test(bits[i].slice(0, 120)), page);
    }
  }
});
const M = load("legacy-cleanup.js", ["clearLegacyDeviceIds", "clearLegacyLocationKeys"]);
t("shipped JS does not store a device identifier", () => {
  const files = [
    "app.js",
    "legacy-cleanup.js",
    "analytics.js",
    "deals.js",
    "disclaimers.js",
    "config.js",
    "sw.js",
    "config.example.js",
  ];
  const idKey = /device|visitor|install|pending_key|helped_done|helped_id|deviceId|device_id/i;
  for (const file of files) {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    src.split("\n").forEach((line, idx) => {
      if (/removeItem\s*\(/.test(line)) return;
      const writes = /(?:localStorage|sessionStorage)\.setItem\s*\(|\blsSet\s*\(|\bssSet\s*\(/.test(line);
      assert.ok(!(writes && idKey.test(line)), file + ":" + (idx + 1) + " stores a device id: " + line.trim());
    });
    assert.ok(!/indexedDB\s*\.\s*open\s*\(/.test(src), file);
    assert.ok(!/document\.cookie\s*=/.test(src), file);
    assert.ok(!/\.herenow\/data\/helped["'`]/.test(src), file);
    assert.ok(!/setItem\s*\([^)]*uuid\s*\(/.test(src), file);
  }
  const metrics = fs.readFileSync(path.join(__dirname, "..", "legacy-cleanup.js"), "utf8");
  assert.ok(!/function markHelped/.test(metrics));
  assert.ok(!/kind:\s*"found"/.test(metrics));
  assert.ok(!/\.herenow\/data\//.test(metrics));
  assert.ok(!/foundRetryKey/.test(metrics));
  assert.ok(/clearLegacyDeviceIds\(/.test(metrics));
  assert.ok(/clearLegacyLocationKeys\(/.test(metrics));
  assert.ok(!/records are removed/.test(metrics));
  for (const page of ["privacy.html", "privacy/index.html"]) {
    const privacy = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    assert.ok(privacy.includes("RangeBites does not create or store a device identifier."), page);
  }
  // 20261004b: the proxy routes in .herenow/proxy.json carry the identifying headers (the browser cannot set User-Agent).
  const proxy = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".herenow", "proxy.json"), "utf8"));
  const headers = proxy.proxies["/api/overpass"].headers;
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tools", "overpass-proxy.headers.json"), "utf8"));
  for (const route of Object.keys(proxy.proxies))
    assert.strictEqual(proxy.proxies[route].headers["User-Agent"], file["User-Agent"], route);
  assert.strictEqual(headers.Referer, "https://rangebites.com");
  assert.strictEqual(headers["User-Agent"], file["User-Agent"]);
  assert.strictEqual(headers.Referer, file.Referer);
  assert.ok(/rangebites@agentmail\.to/.test(headers["User-Agent"]));
});
t("cleanup removes legacy device ids", () => {
  function mem(seed) {
    const data = Object.assign({}, seed);
    return {
      get length() {
        return Object.keys(data).length;
      },
      key(i) {
        return Object.keys(data)[i];
      },
      getItem(k) {
        return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
      },
      removeItem(k) {
        delete data[k];
      },
    };
  }
  const seed = {
    rb_device: "a",
    rb_device_id: "b",
    deviceId: "c",
    device_id: "d",
    visitorId: "e",
    visitor_id: "f",
    installId: "g",
    install_id: "h",
    rb_helped_id: "i",
    rb_helped_done: "1",
    rb_helped_done_selftest: "1",
    rb_found_pending_key: '{"key":"x"}',
    rb_device_id_v2: "leftover",
    rb_ui_prefs: '{"range":5}',
    rb_found_session: "1",
    rb_helped_count: "12",
  };
  const local = mem(seed);
  const session = mem(seed);
  M.clearLegacyDeviceIds(local, session);
  for (const k of [
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
    "rb_device_id_v2",
  ]) {
    assert.strictEqual(local.getItem(k), null, "local " + k);
    assert.strictEqual(session.getItem(k), null, "session " + k);
  }
  assert.strictEqual(local.getItem("rb_ui_prefs"), '{"range":5}');
  assert.strictEqual(session.getItem("rb_ui_prefs"), '{"range":5}');
  assert.strictEqual(local.getItem("rb_found_session"), "1");
  assert.strictEqual(session.getItem("rb_found_session"), "1");
  assert.strictEqual(local.getItem("rb_helped_count"), "12");
  assert.strictEqual(session.getItem("rb_helped_count"), "12");
});
t("cleanup removes legacy location keys and does not wipe on-device prefs", () => {
  function mem(seed) {
    const data = Object.assign({}, seed);
    return {
      get length() {
        return Object.keys(data).length;
      },
      key(i) {
        return Object.keys(data)[i];
      },
      getItem(k) {
        return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
      },
      setItem(k, v) {
        data[k] = String(v);
      },
      removeItem(k) {
        delete data[k];
      },
    };
  }
  const prefs = JSON.stringify({
    radiusMiles: 10,
    units: "km",
    lastPlaceQuery: "Austin",
    lat: 30.2,
    filters: { type: "cafe" },
    termsAccepted: "2026-10-04",
  });
  const saved = JSON.stringify([{ id: "n1", name: "Cafe", address: "1 Main" }]);
  const seed = {
    rb_ui_prefs: prefs,
    rb_saved: saved,
    rb_notice_seen: "1",
    rb_last_city: "Austin",
    rb_last_place: "Austin",
    rb_search_history: "[]",
    rb_lat: "30.2",
    rb_lng: "-97.7",
    latitude: "30.2",
    longitude: "-97.7",
    lastPlaceQuery: "Austin",
    rb_location_history: "[]",
    rb_found_session: "1",
    rb_helped_count: "12",
  };
  const local = mem(seed);
  const session = mem(seed);
  M.clearLegacyLocationKeys(local, session);
  for (const k of [
    "rb_last_city",
    "rb_last_place",
    "rb_search_history",
    "rb_lat",
    "rb_lng",
    "latitude",
    "longitude",
    "lastPlaceQuery",
    "rb_location_history",
    "rb_found_session",
    "rb_helped_count",
  ]) {
    assert.strictEqual(local.getItem(k), null, "local " + k);
    assert.strictEqual(session.getItem(k), null, "session " + k);
  }
  assert.strictEqual(local.getItem("rb_saved"), saved);
  assert.strictEqual(local.getItem("rb_notice_seen"), "1");
  const kept = JSON.parse(local.getItem("rb_ui_prefs"));
  assert.strictEqual(kept.radiusMiles, 10);
  assert.strictEqual(kept.units, "km");
  assert.strictEqual(kept.filters.type, "cafe");
  assert.strictEqual(kept.termsAccepted, "2026-10-04");
  assert.ok(!("lastPlaceQuery" in kept));
  assert.ok(!("lat" in kept));
});
t("continue is the default and opens until this TERMS_VERSION", () => {
  assert.strictEqual(T.shouldShowContinueSheet("continue", "", "2026-10-03"), true);
  assert.strictEqual(T.shouldShowContinueSheet("continue", true, "2026-10-03"), true);
  assert.strictEqual(T.shouldShowContinueSheet("continue", "2026-01-01", "2026-10-03"), true);
  assert.strictEqual(T.shouldShowContinueSheet("continue", "2026-10-03", "2026-10-03"), false);
  assert.strictEqual(T.shouldShowContinueSheet("current", "", "2026-10-03"), false);
  assert.strictEqual(T.shouldShowContinueSheet("browsewrap", "", "2026-10-03"), false);
  const cfg = fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8");
  assert.ok(/ASSENT_MODE:\s*"continue"/.test(cfg));
  const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const fn = /function maybeShowAgree\(\) \{[\s\S]*?\n {2}\}/.exec(src);
  assert.ok(fn, "maybeShowAgree");
  assert.ok(/shouldShowContinueSheet\(/.test(fn[0]));
  assert.ok(/openAgree\(\)/.test(fn[0]));
  assert.ok(fn[0].indexOf("openAgree()") < fn[0].indexOf("hideAgree()"));
  const terms = fs.readFileSync(path.join(__dirname, "..", "terms.html"), "utf8");
  assert.ok(terms.includes("by tapping Continue, or by using the site"));
  assert.ok(terms.includes("RangeBites (rangebites.com), contact:"));
  assert.ok(terms.includes('src="/config.js?v=20261004b"'));
  assert.ok(/Effective <span data-publish-date>October 5, 2026<\/span>/.test(terms));
  for (const legal of ["terms.html", "terms/index.html", "privacy.html", "privacy/index.html"]) {
    const legalSrc = fs.readFileSync(path.join(__dirname, "..", legal), "utf8");
    assert.ok(legalSrc.includes("Effective <span data-publish-date>October 5, 2026</span>"), legal);
  }
  const privacy = fs.readFileSync(path.join(__dirname, "..", "privacy.html"), "utf8");
  assert.ok(privacy.includes("RangeBites (rangebites.com), contact:"));
  const about = fs.readFileSync(path.join(__dirname, "..", "about.html"), "utf8");
  assert.ok(about.includes("RangeBites (rangebites.com), contact:"));
  const sec = fs.readFileSync(path.join(__dirname, "..", ".well-known", "security.txt"), "utf8");
  assert.ok(/^Contact: mailto:rangebites@agentmail\.to$/m.test(sec));
});
t("shipped site does not add visitor tracking", () => {
  const root = path.join(__dirname, "..");
  const banned = [
    /cdn\.amplitude\.com/i,
    /api2\.amplitude\.com/i,
    /googletagmanager\.com/i,
    /google-analytics\.com/i,
    /googleads\.g\.doubleclick\.net/i,
    /connect\.facebook\.net/i,
    /fbevents\.js/i,
    /\bfbq\s*\(/,
    /\bgtag\s*\(/,
    /fingerprintjs/i,
    /\.herenow\/data\/hits/,
    /\.herenow\/data\/found/,
    /\.herenow\/data\/helped/,
    /navigator\.sendBeacon/,
    /FOOD_RADAR_AMPLITUDE/,
    /kind:\s*"view"/,
    /kind:\s*"locate"/,
    /kind:\s*"deal"/,
    /kind:\s*"found"/,
  ];
  function walk(dir, out) {
    for (const name of fs.readdirSync(dir)) {
      if (name === "vendor" || name === "tests" || name === "node_modules" || name === ".git") continue;
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, out);
      else if (/\.(js|html)$/.test(name)) out.push(p);
    }
  }
  const files = [];
  walk(root, files);
  assert.ok(files.length > 5);
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(root, file);
    for (const re of banned) assert.ok(!re.test(src), rel + " matches " + re);
    if (file.endsWith(".html")) {
      assert.ok(!/<script[^>]+src=["']https?:/i.test(src), rel + " loads a third-party script");
    }
  }
  const metrics = fs.readFileSync(path.join(root, "legacy-cleanup.js"), "utf8");
  assert.ok(!/userAgent/.test(metrics));
  assert.ok(!/Idempotency-Key/.test(metrics));
  assert.ok(!/webdriver/.test(metrics));
  assert.ok(!/\bfetch\s*\(/.test(metrics));
  assert.ok(!/markHelped/.test(metrics));
  const stats = fs.readFileSync(path.join(root, "metrics.html"), "utf8");
  assert.ok(stats.includes("tracks nobody"));
  assert.ok(!/<script/i.test(stats));
  for (const page of ["privacy.html", "privacy/index.html"]) {
    const privacy = fs.readFileSync(path.join(root, page), "utf8");
    assert.ok(privacy.includes("RangeBites is a free site that tracks nobody."), page);
    assert.ok(privacy.includes("RangeBites does not create or store a device identifier."), page);
    assert.ok(
      privacy.includes(
        "RangeBites does not store information about you on its servers; some choices are kept only on this device. Location is used only to show nearby places and is not saved.",
      ),
      page,
    );
  }
});
t("no storage of location, last city, or visitor records", () => {
  const root = path.join(__dirname, "..");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const persist = /function persistUiPrefs\(\) \{[\s\S]*?\n {2}\}/.exec(app);
  assert.ok(persist, "persistUiPrefs");
  assert.ok(!/lastPlaceQuery\s*:/.test(persist[0]));
  assert.ok(/delete payload\.lastPlaceQuery/.test(persist[0]));
  assert.ok(!/markHelped/.test(app));
  assert.ok(!/\.herenow\/data\/(found|hits|helped)/.test(app));
  const sentence =
    "RangeBites does not store information about you on its servers; some choices are kept only on this device. Location is used only to show nearby places and is not saved.";
  for (const page of ["privacy.html", "privacy/index.html", "about.html", "about/index.html", "index.html"]) {
    const src = fs.readFileSync(path.join(root, page), "utf8");
    assert.ok(src.includes(sentence), page);
  }
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(home.includes("Clear my saved data"));
  assert.ok(!home.includes("Devices that found food"));
  assert.ok(!home.includes('id="lastPlaceWrap"'));
  assert.ok(!home.includes('id="visitCount"'));
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(/function isStaticAsset/.test(sw));
  assert.ok(/function mustNotCache/.test(sw));
  assert.ok(/\/api\//.test(sw));
  assert.ok(/\/\.herenow\//.test(sw));
  assert.ok(/c\.put\(req, copy\)/.test(sw));
  const putAt = sw.indexOf("c.put");
  const guardAt = sw.lastIndexOf("isStaticAsset", putAt);
  assert.ok(guardAt >= 0 && putAt > guardAt);
  const files = ["app.js", "legacy-cleanup.js", "sw.js", "analytics.js", "deals.js", "config.js"];
  const locWrite =
    /(?:localStorage|sessionStorage)\.setItem\s*\(\s*["'][^"']*(?:lat|lng|latitude|longitude|lastCity|last_city|lastPlace|searchHistory|search_history)/i;
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(!locWrite.test(src), file);
    assert.ok(!/indexedDB\s*\.\s*open\s*\(/.test(src), file);
  }
  const metrics = fs.readFileSync(path.join(root, "legacy-cleanup.js"), "utf8");
  assert.ok(/indexedDB\.deleteDatabase/.test(metrics));
  assert.ok(!/indexedDB\s*\.\s*open\s*\(/.test(metrics));
});
t("data.json (20261003j): no server collections that store visitor data", () => {
  const p = path.join(__dirname, "..", ".herenow", "data.json");
  if (!fs.existsSync(p)) {
    console.log("   (skipped: .herenow/ is gitignored; checked on the publish tree)");
    return;
  }
  const dj = JSON.parse(fs.readFileSync(p, "utf8")).collections || {};
  for (const k of ["hits", "helped", "helped_selftest", "found", "found_selftest", "specials_inbox"]) {
    assert.ok(!(k in dj), "collection still present: " + k);
  }
  assert.deepStrictEqual(Object.keys(dj), []);
  assert.ok(!/"device"/.test(fs.readFileSync(p, "utf8")));
  const px = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".herenow", "proxy.json"), "utf8")).proxies;
  assert.ok(px["/api/overpass"] && px["/api/nominatim"]);
});
t("city switch (20261003i): new origin clears old cards/pins; late older responses ignored", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const S = load(
    "app.js",
    ["searchOriginChanged", "stillActiveSearch"],
    [],
    "var state = { searchGen: 0, lat: null, lng: null };",
  );
  assert.strictEqual(S.searchOriginChanged(null, null, 36.9, -82.08), true);
  assert.strictEqual(S.searchOriginChanged(36.9, -82.08, 37.27, -81.22), true); // Lebanon -> Bluefield
  assert.strictEqual(S.searchOriginChanged(37.27, -81.22, 37.27, -81.22), false); // same city, wider range
  // Simulate runSearch(Lebanon) then runSearch(Bluefield): Lebanon's late response must be dropped.
  const ctx = vm.createContext({ state: { searchGen: 0, lat: null, lng: null } });
  vm.runInContext(src.match(/\n\s*function stillActiveSearch[\s\S]*?\n {2}\}\n/)[0], ctx);
  ctx.state.searchGen = 1;
  ctx.state.lat = 36.9;
  ctx.state.lng = -82.08; // Lebanon gen 1
  ctx.state.searchGen = 2;
  ctx.state.lat = 37.27;
  ctx.state.lng = -81.22; // Bluefield gen 2
  assert.strictEqual(vm.runInContext("stillActiveSearch(1, 36.9, -82.08)", ctx), false);
  assert.strictEqual(vm.runInContext("stillActiveSearch(2, 37.27, -81.22)", ctx), true);
  // runSearch clears state.places + pins before the request when the origin changes.
  const rs = src.slice(
    src.indexOf("async function runSearch("),
    src.indexOf("const slowTimer", src.indexOf("async function runSearch(")),
  );
  assert.ok(/if \(searchOriginChanged\(state\.lat, state\.lng, lat, lng\)\) clearResultsForNewSearch\(\);/.test(rs));
  assert.ok(rs.indexOf("clearResultsForNewSearch();") < rs.indexOf("state.lat = lat;"));
  assert.ok(rs.indexOf("renderList();") > rs.indexOf("clearResultsForNewSearch();"));
  // 20261004b: one sequential Overpass pass per search; no parallel inner ring.
  const body = src.slice(src.indexOf("async function runSearch("), src.indexOf("let cityInFlight"));
  assert.strictEqual((body.match(/fetchPlaces\(/g) || []).length, 1);
  assert.ok(!/fastP|firstFulfilled|Promise\.(any|race)/.test(body));
});
t("pantries status (20261003i): count matches the pantry list; other filters unchanged", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const F = load("app.js", ["filterCountStatus"]);
  assert.strictEqual(F.filterCountStatus(0, true), "0 pantries in range");
  assert.strictEqual(F.filterCountStatus(1, true), "1 pantry in range");
  assert.strictEqual(F.filterCountStatus(3, true, "3 saved in this list"), "3 pantries in range");
  assert.strictEqual(F.filterCountStatus(20, false), "20 restaurants after filters");
  assert.strictEqual(F.filterCountStatus(4, false, "4 tagged open"), "4 tagged open");
  const a = src.indexOf('const pantryBtn = $("#filterPantries");');
  const handler = src.slice(a, src.indexOf("const noticeBtn", a));
  assert.ok(/setStatus\(filterCountStatus\(filteredPlaces\(\)\.length, on\)\)/.test(handler));
  assert.ok(!/setStatus\(filteredPlaces\(\)\.length \+ " restaurants after filters"\)/.test(src));
});
t(
  "city switch (20261003j): a new city search clears old cards, pins and counts before the lookup; late results ignored",
  () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
    // Behaviour: run the real clearResultsForNewSearch against a fake DOM/map.
    const els = {
      "#resultCount": { textContent: "84 restaurants" },
      "#dealCount": { textContent: "2 listing promos", hidden: false },
    };
    let markersCleared = 0;
    const classes = new Set(["has-places"]);
    const ctx = vm.createContext({
      state: { searchGen: 0, lat: 36.71, lng: -81.98, places: new Array(84).fill({}), fetchedRadiusMiles: 10 },
      $: (sel) => els[sel] || null,
      renderMarkers: (list) => {
        if (!list.length) markersCleared++;
      },
      document: { documentElement: { classList: { remove: (c) => classes.delete(c) } } },
    });
    vm.runInContext(src.match(/\n\s*function clearResultsForNewSearch[\s\S]*?\n {2}\}\n/)[0], ctx);
    vm.runInContext(src.match(/\n\s*function stillActiveSearch[\s\S]*?\n {2}\}\n/)[0], ctx);
    vm.runInContext("clearResultsForNewSearch()", ctx); // Abingdon VA showing -> Bristol TN search starts
    assert.strictEqual(ctx.state.places.length, 0);
    assert.strictEqual(ctx.state.fetchedRadiusMiles, null);
    assert.strictEqual(markersCleared, 1);
    assert.ok(!classes.has("has-places"));
    assert.strictEqual(els["#resultCount"].textContent, "");
    assert.strictEqual(els["#dealCount"].hidden, true);
    assert.strictEqual(els["#dealCount"].textContent, "");
    // Search token: Bristol (gen 1) superseded by Richlands (gen 2); Bristol's late answer is ignored.
    ctx.state.searchGen = 1;
    ctx.state.lat = 36.6;
    ctx.state.lng = -82.19;
    ctx.state.searchGen = 2;
    ctx.state.lat = 37.09;
    ctx.state.lng = -81.79;
    assert.strictEqual(vm.runInContext("stillActiveSearch(1, 36.6, -82.19)", ctx), false);
    assert.strictEqual(vm.runInContext("stillActiveSearch(2, 37.09, -81.79)", ctx), true);
    // Wiring: searchCityOrZip takes a new token and clears at once, before the geocoder call and the
    // "Looking up" / "Searching" status; every await is followed by a token check.
    const sc = src.slice(
      src.indexOf("async function searchCityOrZip("),
      src.indexOf("function cityLookupErrorMessage"),
    );
    const genAt = sc.indexOf("const gen = ++state.searchGen;");
    const clearAt = sc.indexOf("clearResultsForNewSearch();");
    assert.ok(genAt > 0 && clearAt > genAt);
    assert.ok(clearAt < sc.indexOf("renderList();"));
    assert.ok(clearAt < sc.indexOf('setStatus("Looking up that city…")'));
    assert.ok(clearAt < sc.indexOf("await geocodePlace(q)"));
    assert.ok(/await geocodePlace\(q\);\s*\n\s*if \(gen !== state\.searchGen\) return;/.test(sc));
    // Picking an "Other places with this name" alternate also clears before the new search.
    const pa = src.slice(src.indexOf("function pickPlaceAlternate("), src.indexOf("function geoErrorMessage"));
    assert.ok(
      pa.indexOf("clearResultsForNewSearch();") > 0 &&
        pa.indexOf("clearResultsForNewSearch();") < pa.indexOf("runSearch("),
    );
    // runSearch: a late Overpass answer checks the token before painting.
    const rs = src.slice(src.indexOf("async function runSearch("), src.indexOf("let cityInFlight"));
    assert.ok(
      /await fetchPlaces\(lat, lng, fetchMi\);\s*\n\s*if \(!stillActiveSearch\(gen, lat, lng\)\) return;/.test(rs),
    );
  },
);
t("specials (20261003j): no submission form and nothing posts or stores restaurant data", () => {
  const root = path.join(__dirname, "..");
  assert.ok(!fs.existsSync(path.join(root, "specials.js")), "specials.js should be removed");
  const sp = fs.readFileSync(path.join(root, "specials.html"), "utf8");
  assert.ok(!/<form/i.test(sp));
  assert.ok(!/<input|<textarea/i.test(sp));
  assert.ok(!/specials\.js/.test(sp));
  assert.ok(
    sp.includes(
      'Restaurants can email <a href="mailto:rangebites@agentmail.to">rangebites@agentmail.to</a> about a special. Nothing is collected through this site.',
    ),
  );
  for (const file of [
    "app.js",
    "legacy-cleanup.js",
    "deals.js",
    "config.js",
    "sw.js",
    "disclaimers.js",
    "analytics.js",
  ]) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(!/specials_inbox/.test(src), file);
    assert.ok(!/\.herenow\/data\//.test(src), file);
    assert.ok(!/contact_email|restaurant_name|special_text|city_or_zip/.test(src), file);
  }
  for (const page of ["privacy.html", "privacy/index.html"]) {
    const pv = fs.readFileSync(path.join(root, page), "utf8");
    assert.ok(!/submit an offer/i.test(pv), page);
    assert.ok(!/Specials page for review/i.test(pv), page);
    assert.ok(
      pv.includes(
        "It also stores the date of the Terms version you accepted by tapping Continue, and whether you've seen the Terms-updated notice. These stay on this device and are not sent.",
      ),
      page,
    );
    const s3 = pv.slice(pv.indexOf("<h2>3."), pv.indexOf("<h2>4."));
    assert.ok(s3.includes("Terms-updated notice"), page);
  }
});
t("terms (20261003k): Specials is an email address only; Terms version date unchanged", () => {
  const root = path.join(__dirname, "..");
  const line =
    'The Specials page only lists an email address, <a href="mailto:rangebites@agentmail.to">rangebites@agentmail.to</a>, that restaurants can write to about a special. Nothing is collected through the site.';
  for (const page of ["terms.html", "terms/index.html"]) {
    const src = fs.readFileSync(path.join(root, page), "utf8");
    assert.ok(!/optional restaurant contact for review/i.test(src), page);
    assert.ok(!/optional review contact/i.test(src), page);
    assert.ok(!/through the Specials page/i.test(src), page);
    assert.ok(!/submit[a-z]*[^.]{0,80}Specials/i.test(src), page);
    assert.ok(src.includes(line), page);
  }
  // 20261003k was not a material change. 20261004b changes the processor list (Gavel gate 1), so the
  // effective date moves to the ship date and visitors see the terms-updated notice once.
  const cfg = fs.readFileSync(path.join(root, "config.js"), "utf8");
  assert.ok(/const PUBLISH_DATE = "2026-10-05";/.test(cfg));
  assert.ok(/TERMS_VERSION: PUBLISH_DATE/.test(cfg));
});
console.log(`\n${pass} passed`);
