"use strict";
/* Attached closed-places check, pointed at this repo's app.js (the patch used b/app.js). */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./extract");

const root = path.join(__dirname, "..");
const s = fs.readFileSync(path.join(root, "app.js"), "utf8");
const a = s.indexOf("  const CLOSED_URL");
const b = s.indexOf("  /* ---------- AllThePlaces chain hours");
assert.ok(a >= 0 && b > a, "loadClosedPlaces sits before the AllThePlaces block");

const file = JSON.parse(fs.readFileSync(path.join(root, "data", "closed-places.json"), "utf8"));
assert.deepStrictEqual(Object.keys(file.places), [
  "way/580777677",
  "way/312160515",
  "node/10202814796",
  "way/1023825062",
]);
assert.ok(/^https:\/\//.test(file.places["node/10202814796"].source || ""), "Out of Town Café carries its source URL");
assert.strictEqual(file.places["way/580777677"].closed, "2026-01-01");
assert.strictEqual(file.places["way/312160515"].closed, "2019-08-04");

const H = load("app.js", ["isPermanentlyClosed"]);
assert.strictEqual(H.isPermanentlyClosed({ opening_hours: "07:00-22:00", name: "Wendy's" }), false);
assert.strictEqual(H.isPermanentlyClosed({ disused: "yes", opening_hours: "07:00-22:00" }), true);
assert.strictEqual(H.isPermanentlyClosed({ end_date: "2019-08-04" }), true);
assert.strictEqual(H.isPermanentlyClosed({}), false);

global.fetch = async () => ({
  ok: true,
  json: async () => JSON.parse(fs.readFileSync(path.join(root, "data", "closed-places.json"), "utf8")),
});
eval(s.slice(a, b) + ";globalThis.L=loadClosedPlaces;globalThis.C=isCuratedClosed;");
globalThis
  .L()
  .then(() => {
    // 20261004b: a merged node+way pair is hidden when either id is listed (mergedIds).
    const ps = [
      { id: "way/580777677" },
      { id: "way/312160515" },
      { id: "node/3179956141" },
      { id: "node/1", mergedIds: ["node/1", "way/1023825062"] },
      { id: "node/10202814796" },
    ];
    const kept = ps.filter((p) => !globalThis.C(p)).map((p) => p.id);
    console.log(kept);
    assert.deepStrictEqual(kept, ["node/3179956141"]);
    console.log("ok - curated closed places (4 ids; merged pairs match either id; lifecycle tags unchanged)");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
