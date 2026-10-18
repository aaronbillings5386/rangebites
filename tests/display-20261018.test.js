"use strict";
// 20261018a: walk-time contrast, search hint that fits, map pin size.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./extract");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const css = read("styles.css");
const src = read("app.js");
const M = load("app.js", ["placeHintCandidates", "pickFittingHint"]);

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
  "full hint when it fits",
);
assert.strictEqual(
  M.pickFittingHint(hints, (t) => t.length < 20),
  "e.g. Buenos Aires",
  "shorter complete hint when the full one does not fit",
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
assert.ok(src.includes("const iconW = isSponsored ? 88 : PIN_HIT_PX"));
assert.ok(src.includes("const iconH = isSponsored ? PIN_VISIBLE_PX + 18 : PIN_HIT_PX"));
assert.ok(src.includes("iconSize: [iconW, iconH]"));
assert.ok(src.includes("iconSize: [PIN_VISIBLE_PX, PIN_VISIBLE_PX]"));
assert.ok(/width: 26px;\s*height: 26px;/.test(css));
assert.ok(/@media \(min-width: 1100px\) \{[\s\S]*width: 24px;\s*height: 24px;/.test(css));

assert.ok(css.includes(".site-footer-nav a"), "footer tap targets stay");
assert.ok(/min-height:\s*44px/.test(css));
assert.ok(src.includes('sheet.setAttribute("inert", "")'), "closed sheets stay inert");
assert.ok(read("index.html").includes("rb-build 20261018a"));
assert.ok(read("sw.js").includes('const CACHE = "rb-static-v20261018a"'));

console.log("ok - display-20261018: contrast " + ratio.toFixed(2) + ":1, hint fit, 26/44 pins");
