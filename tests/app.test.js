"use strict";
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const { load } = require("./extract");
let pass = 0;
function t(name, f) { f(); pass++; console.log("ok -", name); }

const A = load("app.js", [
  "haversineMiles", "roundCoord3", "buildOverpassQuery", "mergeDuplicateElements", "sortNearestFirst",
  "isFakeDemoPhone", "telHref", "formatPhoneDisplay", "prettyOsmValue", "prettyCuisineList",
  "geoErrorMessage", "normWord", "geocodeLooksDifferent", "looksLikePostal", "milesToMeters",
  "hoursTimeZone", "placeNow", "friendlyHoursLine", "hoursOriginLabel",
], ["OVERPASS_TIMEOUT_S", "OVERPASS_FAST_TIMEOUT_S", "OSM_VALUE_LABELS"]);

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
  assert.ok(q.startsWith("[out:json][timeout:25]"));
  assert.ok(A.buildOverpassQuery(1, 2, 100, "fast").startsWith("[out:json][timeout:10]"));
  assert.strictEqual(A.roundCoord3(-0.0004), -0);
});
t("dedupe: node + way same name nearby merge; two nodes (chain branches) stay", () => {
  const els = [
    { type: "way", id: 2, center: { lat: 37.27, lon: -81.22 }, tags: { name: "Joe's Diner", phone: "+1 276 555 1234" } },
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
  const s = A.sortNearestFirst([{ miles: 3, name: "c" }, { miles: 0.5, name: "a" }, { miles: 1, name: "b" }]);
  assert.deepStrictEqual(s.map((p) => p.name), ["a", "b", "c"]);
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
  const abroad = [[51.5, -0.12, "London"], [48.86, 2.35, "Paris"], [35.68, 139.65, "Tokyo"], [22.3, 114.2, "Hong Kong"]];
  for (const [lat, lng, name] of abroad) {
    const zone = A.hoursTimeZone(lat, lng);
    assert.ok(zone !== "America/New_York" && zone !== "America/Chicago", name + " got " + zone);
  }
  const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "numeric" }).format(new Date()));
  const chiHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23", hour: "numeric" }).format(new Date()));
  assert.strictEqual(A.placeNow(-81.22, 37.27).getHours(), nyHour);
  assert.strictEqual(A.placeNow(-87.63, 41.88).getHours(), chiHour);
  const tokyoZone = A.hoursTimeZone(35.68, 139.65);
  const tokyoNow = A.placeNow(139.65, 35.68);
  if (tokyoZone === "") {
    assert.strictEqual(tokyoNow, null);
    assert.strictEqual(A.friendlyHoursLine({ hours: "Mo-Su 09:00-17:00", lat: 35.68, lng: 139.65 }), "Hours tagged · verify");
  } else {
    assert.strictEqual(tokyoZone, "device");
    assert.notStrictEqual(tokyoNow.getHours(), nyHour);
  }
  assert.strictEqual(A.friendlyHoursLine({ hours: "Mo-Su 09:00-17:00", lat: 48.86, lng: 2.35 }, null), "Hours tagged · verify");
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
  assert.strictEqual(A.geocodeLooksDifferent("Lebannon VA", { name: "Lebanon Church", display_name: "Lebanon Church, Virginia" }), true);
  assert.strictEqual(A.geocodeLooksDifferent("Bluefield", { name: "Bluefield", display_name: "Bluefield, West Virginia" }), false);
  assert.strictEqual(A.geocodeLooksDifferent("lebanon, va", { name: "Lebanon", display_name: "Lebanon, Russell County, Virginia" }), false);
  assert.strictEqual(A.geocodeLooksDifferent("24266", { name: "24266" }), false);
});

// forge 20261003 (Gate G1/G2/G5/G6)
const G = load("app.js", [
  "normWord", "haversineMiles", "looksLikePostal", "pickGeocodeHit", "geocodeHitToPlace", "geocodeShortLabel",
  "geocodeAlternates", "cityLookupErrorMessage", "osmStreetLine", "escapeHtml",
  "expandOsmDays", "ohParseTime", "ohParseSelectorAndTimes", "ohParse", "nthWeekday", "isUsFederalHoliday",
  "ohIsHoliday", "ohDaySpans", "isLateNightHours",
], ["OH_DAY_IDX", "ohCache"], 'let hoursCountry = "us"; const state = { lng: -82 }; function placeNow() { return new Date(); }');
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
  assert.strictEqual(G.osmStreetLine({ "addr:housenumber": "123", "addr:street": "Main St", "addr:city": "Lebanon" }), "123 Main St, Lebanon");
  assert.strictEqual(G.osmStreetLine({ "addr:street": "Main St" }), "Main St");
  assert.strictEqual(G.osmStreetLine({ "addr:housenumber": "123", "addr:city": "Lebanon" }), "");
  assert.strictEqual(G.osmStreetLine({}), "");
  assert.strictEqual(G.escapeHtml(G.osmStreetLine({ "addr:street": "<img src=x onerror=alert(1)>" })), "&lt;img src=x onerror=alert(1)&gt;");
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
      if (f.isDirectory()) walk(fp); else if (f.name.endsWith(".html")) pages.push(fp);
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

// No as-you-type geocoding: schedulePlaceSuggest must never call fetchPlaceSuggest.
t("no Nominatim autocomplete path", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const m = /function schedulePlaceSuggest\([^)]*\)\s*\{([\s\S]*?)\n  \}/.exec(src);
  assert.ok(m && !/fetchPlaceSuggest\(/.test(m[1]));
  const calls = src.match(/fetchPlaceSuggest\(/g) || [];
  assert.strictEqual(calls.length, 1, "only the (unused) definition may remain");
});
t("metrics.js: no device code in the counter body", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "metrics.js"), "utf8");
  assert.ok(/JSON\.stringify\(\{ kind: "found" \}\)/.test(src));
  assert.ok(!/device:\s*id/.test(src));
});
const T = load("app.js", [
  "termsAcceptedForVersion", "termsNoticePending", "screenshotBypassPrefs", "overpassUpstreamHeaders",
]);
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
  const shot = /if \(shot\) \{[\s\S]*?\n    \}/.exec(src);
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
  assert.ok(/TERMS_VERSION:\s*"2026-10-03"/.test(cfg));
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes("Terms updated October 3, 2026"));
  assert.ok(html.includes('href="/terms"'));
  assert.ok(/By using RangeBites you agree to the <a href="\/terms">Terms<\/a> and <a href="\/privacy">Privacy<\/a>/.test(html));
  for (const page of ["index.html", "about.html", "about/index.html", "privacy.html", "privacy/index.html"]) {
    const pageSrc = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const bits = pageSrc.split("rounded to 3 decimal places");
    assert.ok(bits.length > 1, page);
    for (let i = 1; i < bits.length; i++) {
      assert.ok(!/anonymous/i.test(bits[i].slice(0, 120)), page);
    }
  }
});
const M = load("metrics.js", ["uuid", "foundRetryKey"], [], "var FOUND_RETRY_MS = 24 * 60 * 60 * 1000;\n");
t("found retry key is per event, not a stored device id", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = 1_700_000_000_000;
  const a = M.foundRetryKey(null, now);
  const b = M.foundRetryKey(null, now);
  assert.notStrictEqual(a.key, b.key);
  assert.strictEqual(a.fresh, true);
  assert.strictEqual(a.exp - now, day);
  const again = M.foundRetryKey({ key: a.key, exp: a.exp }, now + 1000);
  assert.strictEqual(again.key, a.key);
  assert.strictEqual(again.fresh, false);
  const expired = M.foundRetryKey({ key: a.key, exp: a.exp }, a.exp);
  assert.notStrictEqual(expired.key, a.key);
  assert.strictEqual(expired.fresh, true);
  const tooLong = M.foundRetryKey({ key: a.key, exp: now + day + 1 }, now);
  assert.notStrictEqual(tooLong.key, a.key);
  const src = fs.readFileSync(path.join(__dirname, "..", "metrics.js"), "utf8");
  assert.ok(!/lsSet\(PENDING_KEY/.test(src));
  assert.ok(!/localStorage\.setItem\(PENDING_KEY/.test(src));
  assert.ok(/sessionStorage\.setItem\(PENDING_KEY/.test(src));
  assert.ok(/localStorage\.removeItem\(PENDING_KEY\)/.test(src));
  const headers = T.overpassUpstreamHeaders();
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tools", "overpass-proxy.headers.json"), "utf8"));
  assert.strictEqual(headers.Referer, "https://rangebites.com");
  assert.strictEqual(headers["User-Agent"], file["User-Agent"]);
  assert.strictEqual(headers.Referer, file.Referer);
  assert.ok(/rangebites@agentmail\.to/.test(headers["User-Agent"]));
});
t("data.json: device-code + page-open lists are owner-read; found is kind-only", () => {
  const p = path.join(__dirname, "..", ".herenow", "data.json");
  if (!fs.existsSync(p)) { console.log("   (skipped: .herenow/ is gitignored; checked on the publish tree)"); return; }
  const dj = JSON.parse(fs.readFileSync(p, "utf8")).collections;
  ["hits", "helped", "helped_selftest"].forEach((k) => assert.strictEqual(dj[k].access.read, "owner"));
  ["helped", "helped_selftest"].forEach((k) => assert.strictEqual(dj[k].access.insert, "none"));
  assert.deepStrictEqual(Object.keys(dj.found.fields), ["kind"]);
});
console.log(`\n${pass} passed`);
