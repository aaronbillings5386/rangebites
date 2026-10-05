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
      const r = script[url];
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
      "overpassCacheGet",
      "overpassCachePut",
      "overpassBusyMs",
      "fetchPlaces",
      "overpassErrorMessage",
    ],
    [
      "OVERPASS_MIRRORS",
      "OVERPASS_TIMEOUT_S",
      "OVERPASS_MIRROR_ABORT_MS",
      "OVERPASS_TOTAL_CAP_MS",
      "OVERPASS_MIN_TRY_MS",
      "OVERPASS_BUSY_MS",
      "OVERPASS_BUSY_MAX_MS",
      "OVERPASS_CACHE_TTL_MS",
      "OVERPASS_CACHE_MAX",
      "MILES_TO_METERS",
      "overpassCache",
      "overpassBusyUntil",
    ],
    "const statuses = []; function setStatus(s) { statuses.push(s); } function normalizeElements(els, lat, lng) { return els.map((e) => ({ id: e.type + '/' + e.id, origin: [lat, lng] })); }",
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
  const fp = (lat, lng, mi) => F.fetchPlaces(lat, lng, mi, { now: () => clock });
  return {
    F,
    fp,
    log,
    run,
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

t("mirrors: two same-origin routes, Private.coffee then OSM France; no overpass-api.de anywhere (Gavel gate 1)", () => {
  const src = read("app.js");
  const proxy = JSON.parse(read(".herenow/proxy.json"));
  const urls = [...src.matchAll(/\{ url: "(\/api\/overpass[^"]*)", operator: "([^"]+)" \}/g)].map((m) => [m[1], m[2]]);
  assert.deepStrictEqual(urls, [
    ["/api/overpass", "Private.coffee"],
    ["/api/overpass-fr", "OpenStreetMap France"],
  ]);
  const routes = JSON.stringify(proxy);
  for (const [u] of urls) assert.ok(routes.includes('"' + u + '"'), u);
  assert.ok(routes.includes("overpass.private.coffee") && routes.includes("overpass.openstreetmap.fr"));
  assert.deepStrictEqual(Object.keys(proxy.proxies).sort(), ["/api/nominatim", "/api/overpass", "/api/overpass-fr"]);
  for (const f of [
    "app.js",
    ".herenow/proxy.json",
    "privacy.html",
    "privacy/index.html",
    "about.html",
    "about/index.html",
    "index.html",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    assert.ok(!/overpass-api\.de|overpass-de/.test(read(f)), f);
  }
  assert.ok(!/mail\.ru/.test(routes), "never the mail.ru mirror");
});
t("mirrors: first hangs, second answers; tried one at a time, never in parallel", async () => {
  const h = makeFetchPlaces({ "/api/overpass": "hang", "/api/overpass-fr": OK(3) });
  const places = await h.run(h.fp(36.9009, -82.0801, 10));
  assert.strictEqual(places.length, 3);
  assert.deepStrictEqual(
    h.log.map((x) => x.url),
    ["/api/overpass", "/api/overpass-fr"],
  );
  assert.strictEqual(h.log[1].at, 11000, "second mirror starts when the first aborts at 11 s");
  assert.strictEqual(h.maxInFlight(), 1);
  assert.ok(decodeURIComponent(h.log[0].body).includes("[timeout:10]"));
});
t("mirrors: all hang -> clear timeout error under the 25 s cap (well under 40 s)", async () => {
  const h = makeFetchPlaces({ "/api/overpass": "hang", "/api/overpass-fr": "hang" });
  let err;
  try {
    await h.run(h.fp(37.2698, -81.2223, 10));
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.timedOut, String(err));
  assert.ok(h.now() <= 25000, "gave up at " + h.now());
  assert.strictEqual(h.F.overpassErrorMessage(err), "OpenStreetMap didn’t answer in time. Try again in a minute.");
  // 11 s per mirror, both tried: the error lands at 22 s, under the 25 s cap.
  assert.strictEqual(h.now(), 22000);
  assert.deepStrictEqual(
    h.log.map((x) => x.url),
    ["/api/overpass", "/api/overpass-fr"],
  );
});
t("mirrors: 429 moves on and cools that mirror for 30 s (Retry-After honoured, capped)", async () => {
  const h = makeFetchPlaces({
    "/api/overpass": { status: 429, json: {} },
    "/api/overpass-fr": OK(2),
  });
  assert.strictEqual((await h.run(h.fp(36.9, -82.08, 10))).length, 2);
  // Different area (no cache hit) 5 s later: the busy mirror is skipped.
  h.advance(5000);
  await h.run(h.fp(37.27, -81.22, 10));
  assert.deepStrictEqual(
    h.log.map((x) => x.url),
    ["/api/overpass", "/api/overpass-fr", "/api/overpass-fr"],
  );
  assert.strictEqual(h.F.overpassBusyMs({ headers: { get: () => "90" } }), 90000);
  assert.strictEqual(h.F.overpassBusyMs({ headers: { get: () => "9999" } }), 120000);
  assert.strictEqual(h.F.overpassBusyMs({ headers: { get: () => null } }), 30000);
});
t("mirrors: every mirror busy -> 'servers are busy' message", async () => {
  const busy = { status: 429, json: {} };
  const h = makeFetchPlaces({
    "/api/overpass": busy,
    "/api/overpass-fr": { status: 406, json: {} },
  });
  let err;
  try {
    await h.run(h.fp(36.9, -82.08, 10));
  } catch (e) {
    err = e;
  }
  assert.ok(err && err.allBusy);
  assert.strictEqual(h.F.overpassErrorMessage(err), "OpenStreetMap servers are busy right now. Try again in a minute.");
});
t("mirrors: a healthy empty answer is a real empty list; Overpass timeout remark moves on", async () => {
  const h = makeFetchPlaces({
    "/api/overpass": { status: 200, json: { elements: [], remark: "runtime error: Query timed out" } },
    "/api/overpass-fr": { status: 200, json: { elements: [] } },
  });
  assert.deepStrictEqual(await h.run(h.fp(36.9, -82.08, 10)), []);
  assert.strictEqual(h.log.length, 2);
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
    "The proxy asks one server at a time, in this order, until one answers: Private.coffee (overpass.private.coffee) and OpenStreetMap France (overpass.openstreetmap.fr).",
    "Our host sees your IP address when it passes the search along. Because the request goes through our host, the Overpass and Nominatim servers see our host's address, not yours.",
    "The host may keep its own connection log. The host also briefly counts requests from each IP address to stop overuse; RangeBites cannot see or keep those counts.",
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
    assert.ok(/Private\.coffee/.test(s) && /OpenStreetMap France/.test(s), f + " names both Overpass operators");
    assert.ok(!/FOSSGIS e\.V\. \(overpass/.test(s), f + " FOSSGIS named only for tiles");
  }
  const about =
    "Our host sees the search and your IP address; the Overpass and Nominatim servers see the search and our host's address.";
  for (const f of ["about.html", "about/index.html", "index.html"]) {
    assert.ok(read(f).includes(about), f);
    assert.ok(!read(f).includes("The host and those services see the search and your IP."), f);
  }
  for (const f of ["index.html", "about.html", "about/index.html", "privacy.html", "privacy/index.html"]) {
    assert.ok(!read(f).includes("does not store any information about you"), f + " has the old sentence");
  }
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
