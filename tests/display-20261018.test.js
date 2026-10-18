"use strict";
// 20261018a: walk-time contrast, search hint that fits, map pin size, clusters.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./extract");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const css = read("styles.css");
const src = read("app.js");
const M = load("app.js", ["placeHintCandidates", "pickFittingHint", "clusterByPixel", "spiderOffsets"]);

function lin(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const L1 = lum(a),
    L2 = lum(b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

const chip = "#3d301c";
const walk = "#c4b09a";
const ratio = contrast(walk, chip);
assert.ok(ratio >= 4.5, "walk text on opaque chip is " + ratio.toFixed(2));
assert.ok(css.includes("background-color: #3d301c !important"), "opaque distance chip");
assert.ok(/\.place-distance \.dist-walk \{\s*color: #c4b09a !important;/.test(css), "walk color");
assert.ok(!read("themes/holiday.css").includes(".dist-walk"));
assert.ok(!read("themes/holiday.css").includes(".place-distance"));

const hints = Array.from(M.placeHintCandidates("Buenos Aires"));
assert.deepStrictEqual(hints, ["City or ZIP, e.g. Buenos Aires", "e.g. Buenos Aires", "City or ZIP"]);
assert.strictEqual(
  M.pickFittingHint(hints, (t) => t.length < 40),
  "City or ZIP, e.g. Buenos Aires",
);
assert.strictEqual(
  M.pickFittingHint(hints, (t) => t.length < 20),
  "e.g. Buenos Aires",
);
assert.strictEqual(
  M.pickFittingHint(hints, () => false),
  "City or ZIP",
);
assert.ok(!src.includes("clientWidth < 200"), "no hard cutoff that drops the example");
const ellip = css.lastIndexOf("text-overflow: ellipsis");
const clip = css.lastIndexOf("text-overflow: clip");
assert.ok(clip > ellip, "placeholder ellipsis is overridden");

assert.ok(/const PIN_VISIBLE_PX = 26;/.test(src));
assert.ok(/const PIN_HIT_PX = 44;/.test(src));
assert.ok(/const USER_PIN_PX = 15;/.test(src));
assert.ok(src.includes("const iconW = PIN_HIT_PX"));
assert.ok(src.includes("const iconH = PIN_HIT_PX"));
assert.ok(!src.includes("isSponsored ? 88"));
assert.ok(!src.includes("isSponsored ? 76"));
assert.ok(src.includes("iconSize: [USER_PIN_PX, USER_PIN_PX]"));
assert.ok(src.includes("html: '<div class=\"user-location-marker\"></div>'"));
assert.ok(/width: var\(--pin-dot, 26px\);\s*height: var\(--pin-dot, 26px\);/.test(css));
assert.ok(src.includes('style="--pin-dot:${PIN_VISIBLE_PX}px"'));
assert.ok(/@media \(min-width: 1100px\) \{[\s\S]*width: 24px;\s*height: 24px;/.test(css));
assert.ok(/\.user-location-marker \{\s*width: 15px;\s*height: 15px;/.test(css));
assert.ok(css.includes(".place-card .badge"));
assert.ok(css.includes("overflow-wrap: break-word"));
assert.ok(css.includes("flex-direction: column-reverse"));
assert.ok(css.includes("min-width: 0"));
assert.ok(/\.pin-cluster \{[\s\S]*width: 44px;\s*height: 44px;/.test(css));
assert.ok(css.includes("pointer-events: none"));

const far = Array.from(
  M.clusterByPixel(
    [
      { x: 0, y: 0, id: "a" },
      { x: 80, y: 0, id: "b" },
    ],
    44,
  ),
);
assert.strictEqual(far.length, 2, "pins 80px apart stay separate");
const near = Array.from(
  M.clusterByPixel(
    [
      { x: 0, y: 0, id: "a" },
      { x: 20, y: 0, id: "b" },
      { x: 40, y: 0, id: "c" },
    ],
    44,
  ),
);
assert.strictEqual(near.length, 1, "a chain of overlapping 44px boxes is one cluster");
assert.strictEqual(near[0].length, 3);

const pair = Array.from(M.spiderOffsets(2, 44));
const dx = pair[0].x - pair[1].x;
const dy = pair[0].y - pair[1].y;
assert.ok(Math.hypot(dx, dy) >= 44, "spiderfied pins stay at least 44px apart");

assert.ok(css.includes(".site-footer-nav a"), "footer tap targets stay");
assert.ok(/min-height:\s*44px/.test(css));
assert.ok(src.includes('sheet.setAttribute("inert", "")'), "closed sheets stay inert");
assert.ok(read("index.html").includes("rb-build 20261018a"));
assert.ok(read("sw.js").includes('const CACHE = "rb-static-v20261018a"'));
assert.ok(read("config.js").includes('const BUILD_ID = "20261018a"'));

console.log("ok - display-20261018: contrast " + ratio.toFixed(2) + ":1, hint fit, 26/44 pins, clusters");
