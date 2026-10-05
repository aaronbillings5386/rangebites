"use strict";
/* 20261004b: Ink's 13-theme registry (PR #13). Windows come from docs/HOLIDAY_THEMES.md; every theme has
 * a painter and a sample date; overlaps resolve by registry order (first match wins). */
const assert = require("assert");
const themes = require("../themes/holiday-themes");
let pass = 0;
function t(name, f) { f(); pass++; console.log("ok -", name); }
const D = (y, m, d) => new Date(y, m - 1, d, 12);
const add = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n, 12);

// [id, 2026 first, 2026 last, 2027 first, 2027 last] as [m, d] — the table in docs/HOLIDAY_THEMES.md.
const WINDOWS = [
  ["mlk", [1, 17], [1, 19], [1, 16], [1, 18]],
  ["valentines", [2, 1], [2, 14], [2, 1], [2, 14]],
  ["presidents", [2, 14], [2, 16], [2, 13], [2, 15]],
  ["st-patricks", [3, 10], [3, 17], [3, 10], [3, 17]],
  ["easter", [3, 29], [4, 5], [3, 21], [3, 28]],
  ["memorial", [5, 23], [5, 25], [5, 29], [5, 31]],
  ["independence", [7, 1], [7, 4], [7, 1], [7, 4]],
  ["labor", [9, 5], [9, 7], [9, 4], [9, 6]],
  ["halloween", [10, 1], [10, 31], [10, 1], [10, 31]],
  ["veterans", [11, 11], [11, 11], [11, 11], [11, 11]],
  ["thanksgiving", [11, 12], [11, 26], [11, 11], [11, 25]],
  ["christmas", [12, 1], [12, 26], [12, 1], [12, 26]],
];

t("13 themes, all built, each with a painter", () => {
  assert.strictEqual(themes.HOLIDAYS.length, 13);
  for (const h of themes.HOLIDAYS) {
    assert.ok(h.built, h.id);
    assert.ok(themes.painterIds.includes(h.id), h.id + " has a painter");
  }
});
t("date windows match docs/HOLIDAY_THEMES.md for 2026 and 2027 (window contains first..last)", () => {
  for (const [id, a26, b26, a27, b27] of WINDOWS) {
    for (const [y, a, b] of [[2026, a26, b26], [2027, a27, b27]]) {
      const first = D(y, a[0], a[1]), last = D(y, b[0], b[1]);
      for (let d = first; d <= last; d = add(d, 1)) assert.ok(themes.matchingHolidayIds(d).includes(id), id + " " + d.toDateString());
      assert.ok(!themes.matchingHolidayIds(add(first, -1)).includes(id), id + " starts " + first.toDateString());
      assert.ok(!themes.matchingHolidayIds(add(last, 1)).includes(id), id + " ends " + last.toDateString());
    }
  }
  // New Year's wraps the year end: Dec 27 - Jan 1.
  assert.ok(themes.matchingHolidayIds(D(2026, 12, 27)).includes("new-year"));
  assert.ok(themes.matchingHolidayIds(D(2027, 1, 1)).includes("new-year"));
  assert.ok(!themes.matchingHolidayIds(D(2026, 12, 26)).includes("new-year"));
  assert.ok(!themes.matchingHolidayIds(D(2027, 1, 2)).includes("new-year"));
});
t("first match wins on overlaps", () => {
  // Feb 14 2026: Valentine's (listed before Presidents') wins over the Presidents' weekend.
  assert.deepStrictEqual(themes.matchingHolidayIds(D(2026, 2, 14)).slice().sort(), ["presidents", "valentines"]);
  assert.strictEqual(themes.activeHolidayId(D(2026, 2, 14)), "valentines");
  // Nov 11 2027: Veterans Day wins over the Thanksgiving run-up that starts the same day.
  assert.deepStrictEqual(themes.matchingHolidayIds(D(2027, 11, 11)).slice().sort(), ["thanksgiving", "veterans"]);
  assert.strictEqual(themes.activeHolidayId(D(2027, 11, 11)), "veterans");
  // In general the active id is the earliest registry entry among the matches.
  const order = themes.HOLIDAYS.map((h) => h.id);
  for (let d = D(2026, 1, 1); d.getFullYear() < 2028; d = add(d, 1)) {
    const m = themes.matchingHolidayIds(d);
    const want = m.length ? m.slice().sort((x, y) => order.indexOf(x) - order.indexOf(y))[0] : null;
    assert.strictEqual(themes.activeHolidayId(d), want, d.toDateString());
  }
});
t("one sample date per theme selects that theme; plain days stay default", () => {
  const SAMPLE = {
    "new-year": D(2026, 12, 31), mlk: D(2026, 1, 19), valentines: D(2026, 2, 10), presidents: D(2026, 2, 16),
    "st-patricks": D(2026, 3, 17), easter: D(2026, 4, 5), memorial: D(2026, 5, 25), independence: D(2026, 7, 4),
    labor: D(2026, 9, 7), halloween: D(2026, 10, 4), veterans: D(2026, 11, 11), thanksgiving: D(2026, 11, 26),
    christmas: D(2026, 12, 25),
  };
  assert.deepStrictEqual(Object.keys(SAMPLE).sort(), themes.HOLIDAYS.map((h) => h.id).sort());
  for (const [id, d] of Object.entries(SAMPLE)) assert.strictEqual(themes.selectHolidayTheme(d, {}), id, id);
  for (const d of [D(2026, 6, 15), D(2026, 8, 20), D(2026, 4, 20)]) assert.strictEqual(themes.selectHolidayTheme(d, {}), "default");
});
console.log("\n" + pass + " passed");
