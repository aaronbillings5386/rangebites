"use strict";
/* Curated closed-places override. Hides only the two owner-confirmed ids. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./extract");

const root = path.join(__dirname, "..");
const rows = JSON.parse(fs.readFileSync(path.join(root, "data", "closed-places.json"), "utf8"));
assert.ok(Array.isArray(rows));
assert.strictEqual(rows.length, 2);
const ids = rows.map((row) => row && row.id);
assert.deepStrictEqual(ids, ["way/580777677", "way/312160515"]);
assert.strictEqual(rows[0].closed, "2026-01-01");
assert.strictEqual(rows[1].closed, "2019");

const H = load("app.js", ["isPermanentlyClosed"]);
assert.strictEqual(H.isPermanentlyClosed({ opening_hours: "07:00-22:00", name: "Wendy's" }), false);
assert.strictEqual(H.isPermanentlyClosed({ opening_hours: "07:00-22:00", amenity: "fast_food" }), false);
assert.strictEqual(H.isPermanentlyClosed({ disused: "yes", opening_hours: "07:00-22:00" }), true);
assert.strictEqual(H.isPermanentlyClosed({ end_date: "2019" }), true);
assert.strictEqual(H.isPermanentlyClosed({}), false);

const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const closedAt = app.indexOf("function loadClosedPlaces(");
const curatedAt = app.indexOf("function isCuratedClosed(");
const atpAt = app.indexOf("const ATP_URL");
assert.ok(closedAt >= 0 && curatedAt > closedAt && atpAt > curatedAt);
assert.ok(/function isPermanentlyClosed\(/.test(app));
assert.ok(/dropCuratedClosedInPlace\(state\.places\)/.test(app));
assert.ok(/function applyPlaces\(/.test(app));

const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
assert.ok(!/closed-places\.json/.test(sw.split("\n").filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("/*")).join("\n")));
assert.ok(/\/icons\//.test(sw));
assert.ok(!/data\//.test(sw.replace(/\/\*[\s\S]*?\*\//g, "")));

const set = new Set(ids);
function curated(p) { return !!(p && set.has(String(p.id || ""))); }
const sample = [
  { id: "way/580777677", name: "Wendy's", hours: "07:00-22:00" },
  { id: "way/312160515", name: "Applebee's" },
  { id: "way/111", name: "Wendy's" },
  { id: "node/580777677", name: "Wendy's" },
];
const kept = sample.filter((p) => !curated(p));
assert.deepStrictEqual(kept.map((p) => p.id), ["way/111", "node/580777677"]);

console.log("ok - curated closed places (2 ids only; lifecycle tags unchanged)");
