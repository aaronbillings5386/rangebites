"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const themes = require("../themes/holiday-themes");

let pass = 0;
function t(name, fn) {
  fn();
  pass++;
  console.log("ok -", name);
}

function local(year, monthIndex, day) {
  return new Date(year, monthIndex, day);
}

t("registry order is the overlap rule, and only Halloween is built", () => {
  assert.deepStrictEqual(themes.HOLIDAYS.map((h) => h.id), [
    "new-year",
    "halloween",
    "christmas",
    "thanksgiving",
    "independence",
    "juneteenth",
    "fathers-day",
    "st-patricks",
    "easter",
    "valentines",
    "presidents",
    "memorial",
    "labor",
    "mothers-day",
    "mlk",
    "veterans",
  ]);
  assert.deepStrictEqual(
    themes.HOLIDAYS.filter((h) => h.built).map((h) => h.id),
    ["halloween"]
  );
});

t("Easter Sunday matches the Anonymous Gregorian computus", () => {
  assert.strictEqual(themes.easterSunday(2024).getMonth(), 2);
  assert.strictEqual(themes.easterSunday(2024).getDate(), 31);
  assert.strictEqual(themes.easterSunday(2025).getMonth(), 3);
  assert.strictEqual(themes.easterSunday(2025).getDate(), 20);
  assert.strictEqual(themes.easterSunday(2026).getMonth(), 3);
  assert.strictEqual(themes.easterSunday(2026).getDate(), 5);
  assert.strictEqual(themes.easterSunday(2008).getMonth(), 2);
  assert.strictEqual(themes.easterSunday(2008).getDate(), 23);
});

t("October applies Halloween; June does not", () => {
  assert.strictEqual(themes.activeHolidayId(local(2026, 9, 1)), "halloween");
  assert.strictEqual(themes.activeHolidayId(local(2026, 9, 15)), "halloween");
  assert.strictEqual(themes.activeHolidayId(local(2026, 9, 31)), "halloween");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 9, 4), {}), "halloween");
  assert.strictEqual(themes.activeHolidayId(local(2026, 5, 15)), null);
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 5, 15), {}), "default");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 8, 30), {}), "default");
});

t("planned holidays win the date but do not paint a theme", () => {
  assert.strictEqual(themes.activeHolidayId(local(2026, 11, 25)), "christmas");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 11, 25), {}), "default");
  assert.strictEqual(themes.activeHolidayId(local(2026, 0, 1)), "new-year");
  assert.strictEqual(themes.activeHolidayId(local(2026, 6, 4)), "independence");
  assert.strictEqual(themes.activeHolidayId(local(2026, 10, 11)), "veterans");
  assert.strictEqual(themes.activeHolidayId(local(2026, 5, 19)), "juneteenth");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 6, 4), {}), "default");
});

t("Thanksgiving 2026 is Nov 23-29; Dec 1 2019 is Christmas, not Thanksgiving", () => {
  assert.strictEqual(themes.activeHolidayId(local(2026, 10, 22)), null);
  assert.strictEqual(themes.activeHolidayId(local(2026, 10, 23)), "thanksgiving");
  assert.strictEqual(themes.activeHolidayId(local(2026, 10, 26)), "thanksgiving");
  assert.strictEqual(themes.activeHolidayId(local(2026, 10, 29)), "thanksgiving");
  assert.strictEqual(themes.activeHolidayId(local(2026, 10, 30)), null);
  const dec1 = local(2019, 11, 1);
  const ids = themes.matchingHolidayIds(dec1);
  assert.ok(ids.includes("christmas") && ids.includes("thanksgiving"), ids.join(","));
  assert.strictEqual(ids[0], "christmas");
  assert.strictEqual(themes.activeHolidayId(local(2019, 10, 28)), "thanksgiving");
});

t("New Year's beats Christmas on December 31", () => {
  const ids = themes.matchingHolidayIds(local(2026, 11, 31));
  assert.deepStrictEqual(ids, ["new-year"]);
  assert.strictEqual(themes.activeHolidayId(local(2026, 11, 30)), "christmas");
});

t("Valentine's Day beats an overlapping Presidents Day weekend", () => {
  let found = null;
  for (let year = 2020; year <= 2040 && !found; year++) {
    for (let day = 13; day <= 16; day++) {
      const ids = themes.matchingHolidayIds(local(year, 1, day));
      if (ids.includes("valentines") && ids.includes("presidents")) {
        found = { year, day, ids };
      }
    }
  }
  assert.ok(found, "expected a February overlap");
  assert.strictEqual(found.ids[0], "valentines");
  assert.strictEqual(themes.activeHolidayId(local(2026, 1, 14)), "valentines");
  assert.strictEqual(themes.activeHolidayId(local(2026, 1, 16)), "presidents");
});

t("Juneteenth beats Father's Day weekend when they share June 19", () => {
  let found = null;
  for (let year = 2020; year <= 2040 && !found; year++) {
    const ids = themes.matchingHolidayIds(local(year, 5, 19));
    if (ids.includes("juneteenth") && ids.includes("fathers-day")) found = ids;
  }
  assert.ok(found, "expected a June 19 overlap");
  assert.strictEqual(found[0], "juneteenth");
});

t("St. Patrick's Day beats an early Palm Sunday", () => {
  let found = null;
  for (let year = 1900; year <= 2100 && !found; year++) {
    for (let day = 15; day <= 17; day++) {
      const ids = themes.matchingHolidayIds(local(year, 2, day));
      if (ids.includes("st-patricks") && ids.includes("easter")) found = { year, day, ids };
    }
  }
  assert.ok(found, "expected a March overlap");
  assert.strictEqual(found.ids[0], "st-patricks");
  assert.strictEqual(themes.activeHolidayId(local(2026, 2, 29)), "easter");
  assert.strictEqual(themes.activeHolidayId(local(2026, 3, 5)), "easter");
  assert.strictEqual(themes.activeHolidayId(local(2026, 3, 6)), null);
});

t("all of October stays Halloween, including the second Monday", () => {
  assert.strictEqual(themes.activeHolidayId(local(2026, 9, 12)), "halloween");
  assert.deepStrictEqual(themes.matchingHolidayIds(local(2026, 9, 12)), ["halloween"]);
});

t("query preview is read-only and does not persist a choice", () => {
  assert.strictEqual(themes.readThemeQuery("?theme=Halloween"), "halloween");
  assert.strictEqual(themes.readThemeQuery("?q=bristol&theme=default"), "default");
  assert.strictEqual(themes.readThemeQuery("?theme="), "");
  assert.strictEqual(themes.readThemeQuery(""), "");
  const oct = local(2026, 9, 4);
  const june = local(2026, 5, 15);
  assert.strictEqual(themes.selectHolidayTheme(oct, { query: "default" }), "default");
  assert.strictEqual(themes.selectHolidayTheme(june, { query: "halloween" }), "halloween");
  assert.strictEqual(themes.selectHolidayTheme(oct, { query: "christmas" }), "halloween");
  assert.strictEqual(themes.selectHolidayTheme(june, { query: "nope" }), "default");
  assert.strictEqual(themes.selectHolidayTheme(oct, { reducedMotion: true }), "default");
  assert.strictEqual(
    themes.selectHolidayTheme(oct, { query: "halloween", reducedMotion: true }),
    "halloween"
  );
  assert.strictEqual(themes.selectHolidayTheme(new Date(NaN), {}), "default");
  assert.strictEqual(themes.selectHolidayTheme(null, {}), "default");
});

t("applyTheme sets the class in October and leaves June alone", () => {
  function fakeDoc() {
    function list() {
      const names = new Set();
      return {
        add(c) { names.add(c); },
        remove(c) { names.delete(c); },
        contains(c) { return names.has(c); },
      };
    }
    return {
      documentElement: { classList: list() },
      body: { classList: list() },
    };
  }
  const oct = fakeDoc();
  assert.strictEqual(themes.applyTheme(oct, local(2026, 9, 4), {}), "halloween");
  assert.strictEqual(oct.documentElement.classList.contains("theme-halloween"), true);
  assert.strictEqual(oct.body.classList.contains("theme-halloween"), true);
  const june = fakeDoc();
  assert.strictEqual(themes.applyTheme(june, local(2026, 5, 15), {}), "default");
  assert.strictEqual(june.documentElement.classList.contains("theme-halloween"), false);
});

t("a thrown class update falls back to the default theme", () => {
  const doc = {
    documentElement: {
      classList: {
        add() { throw new Error("boom"); },
        remove() {},
        contains() { return false; },
      },
    },
    body: { classList: { add() {}, remove() {}, contains() { return false; } } },
  };
  assert.strictEqual(themes.applyTheme(doc, local(2026, 9, 4), {}), "default");
});

t("theme source does not touch storage, network, or trackers", () => {
  const root = path.join(__dirname, "..");
  const files = ["themes/holiday-themes.js", "themes/halloween.css"];
  const banned = /localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|\bfetch\s*\(|XMLHttpRequest|https?:\/\//i;
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(!banned.test(src), file);
  }
  const css = fs.readFileSync(path.join(root, "themes/halloween.css"), "utf8");
  assert.ok(/prefers-reduced-motion:\s*reduce/.test(css));
  assert.ok(/pointer-events:\s*none/.test(css));
  assert.ok(/animation:\s*none\s*!important/.test(css));
  assert.ok(/filter:\s*none\s*!important/.test(css));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.includes('href="themes/halloween.css?v=20261004b"'));
  assert.ok(html.includes('src="themes/holiday-themes.js?v=20261004b"'));
});

console.log("\n" + pass + " passed");
