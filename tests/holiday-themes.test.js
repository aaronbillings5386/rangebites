"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const themes = require("../themes/holiday-themes");
const dates = require("../themes/us-holidays");

let pass = 0;
function t(name, fn) {
  fn();
  pass++;
  console.log("ok -", name);
}

function local(year, monthIndex, day) {
  return new Date(year, monthIndex, day);
}

const BUILT = [
  "new-year",
  "halloween",
  "christmas",
  "veterans",
  "thanksgiving",
  "independence",
  "st-patricks",
  "easter",
  "valentines",
  "presidents",
  "memorial",
  "labor",
  "mlk",
];

t("registry order is the overlap rule, and every theme is built", () => {
  assert.deepStrictEqual(
    themes.HOLIDAYS.map((h) => h.id),
    BUILT,
  );
  assert.deepStrictEqual(
    themes.HOLIDAYS.filter((h) => h.built).map((h) => h.id),
    BUILT,
  );
  assert.deepStrictEqual(themes.painterIds.slice().sort(), BUILT.slice().sort());
});

t("floating US dates match 2026 and 2027", () => {
  assert.strictEqual(dates.iso(dates.usHolidays(2026).easter), "2026-04-05");
  assert.strictEqual(dates.iso(dates.usHolidays(2027).easter), "2027-03-28");
  assert.strictEqual(dates.iso(dates.usHolidays(2026).thanksgiving), "2026-11-26");
  assert.strictEqual(dates.iso(dates.usHolidays(2027).thanksgiving), "2027-11-25");
  assert.strictEqual(dates.iso(dates.usHolidays(2026).memorialDay), "2026-05-25");
  assert.strictEqual(dates.iso(dates.usHolidays(2027).memorialDay), "2027-05-31");
  assert.strictEqual(dates.iso(dates.usHolidays(2026).laborDay), "2026-09-07");
  assert.strictEqual(dates.iso(dates.usHolidays(2027).laborDay), "2027-09-06");
  assert.strictEqual(dates.iso(dates.usHolidays(2026).mlkDay), "2026-01-19");
  assert.strictEqual(dates.iso(dates.usHolidays(2026).presidentsDay), "2026-02-16");
  assert.strictEqual(dates.iso(dates.observed({ y: 2026, m: 7, d: 4 })), "2026-07-03");
  assert.strictEqual(dates.iso(dates.easter(2024)), "2024-03-31");
  assert.strictEqual(dates.iso(dates.easter(2025)), "2025-04-20");
  assert.strictEqual(dates.iso(dates.easter(2008)), "2008-03-23");
  assert.strictEqual(dates.iso(dates.easter(2028)), "2028-04-16");
});

t("Easter Sunday matches the Anonymous Gregorian computus", () => {
  assert.strictEqual(themes.easterSunday(2024).getMonth(), 2);
  assert.strictEqual(themes.easterSunday(2024).getDate(), 31);
  assert.strictEqual(themes.easterSunday(2026).getMonth(), 3);
  assert.strictEqual(themes.easterSunday(2026).getDate(), 5);
  assert.strictEqual(themes.easterSunday(2027).getMonth(), 2);
  assert.strictEqual(themes.easterSunday(2027).getDate(), 28);
});

t("2026 and 2027 pick the holiday on the day, and a plain date stays default", () => {
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 3, 5), {}), "easter");
  assert.strictEqual(themes.selectHolidayTheme(local(2027, 2, 28), {}), "easter");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 2, 29), {}), "easter");
  assert.strictEqual(themes.selectHolidayTheme(local(2027, 2, 21), {}), "easter");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 10, 26), {}), "thanksgiving");
  assert.strictEqual(themes.selectHolidayTheme(local(2027, 10, 25), {}), "thanksgiving");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 10, 12), {}), "thanksgiving");
  assert.strictEqual(themes.selectHolidayTheme(local(2027, 10, 12), {}), "thanksgiving");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 5, 15), {}), "default");
  assert.strictEqual(themes.selectHolidayTheme(local(2027, 5, 15), {}), "default");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 7, 20), {}), "default");
  assert.strictEqual(themes.activeHolidayId(local(2026, 5, 15)), null);
});

t("fixed windows for 2026 and 2027", () => {
  assert.strictEqual(themes.activeHolidayId(local(2026, 9, 1)), "halloween");
  assert.strictEqual(themes.activeHolidayId(local(2027, 9, 31)), "halloween");
  assert.strictEqual(themes.activeHolidayId(local(2026, 11, 1)), "christmas");
  assert.strictEqual(themes.activeHolidayId(local(2026, 11, 26)), "christmas");
  assert.strictEqual(themes.activeHolidayId(local(2027, 11, 26)), "christmas");
  assert.strictEqual(themes.activeHolidayId(local(2026, 11, 27)), "new-year");
  assert.strictEqual(themes.activeHolidayId(local(2026, 0, 1)), "new-year");
  assert.strictEqual(themes.activeHolidayId(local(2027, 0, 1)), "new-year");
  assert.strictEqual(themes.activeHolidayId(local(2026, 0, 2)), null);
  assert.strictEqual(themes.activeHolidayId(local(2026, 6, 1)), "independence");
  assert.strictEqual(themes.activeHolidayId(local(2027, 6, 4)), "independence");
  assert.strictEqual(themes.activeHolidayId(local(2026, 6, 5)), null);
  assert.strictEqual(themes.activeHolidayId(local(2026, 1, 1)), "valentines");
  assert.strictEqual(themes.activeHolidayId(local(2026, 1, 14)), "valentines");
  assert.strictEqual(themes.activeHolidayId(local(2026, 2, 10)), "st-patricks");
  assert.strictEqual(themes.activeHolidayId(local(2026, 2, 17)), "st-patricks");
  assert.strictEqual(themes.activeHolidayId(local(2026, 4, 23)), "memorial");
  assert.strictEqual(themes.activeHolidayId(local(2026, 4, 25)), "memorial");
  assert.strictEqual(themes.activeHolidayId(local(2027, 4, 31)), "memorial");
  assert.strictEqual(themes.activeHolidayId(local(2026, 8, 5)), "labor");
  assert.strictEqual(themes.activeHolidayId(local(2026, 8, 7)), "labor");
  assert.strictEqual(themes.activeHolidayId(local(2027, 8, 6)), "labor");
  assert.strictEqual(themes.activeHolidayId(local(2026, 0, 17)), "mlk");
  assert.strictEqual(themes.activeHolidayId(local(2026, 0, 19)), "mlk");
  assert.strictEqual(themes.activeHolidayId(local(2026, 1, 16)), "presidents");
});

t("Veterans Day is November 11 and beats Thanksgiving when the windows overlap", () => {
  assert.strictEqual(themes.activeHolidayId(local(2026, 10, 11)), "veterans");
  assert.deepStrictEqual(themes.matchingHolidayIds(local(2026, 10, 11)), ["veterans"]);
  const overlap = themes.matchingHolidayIds(local(2027, 10, 11));
  assert.ok(overlap.includes("veterans") && overlap.includes("thanksgiving"), overlap.join(","));
  assert.strictEqual(overlap[0], "veterans");
  assert.strictEqual(themes.selectHolidayTheme(local(2027, 10, 11), {}), "veterans");
  assert.strictEqual(themes.activeHolidayId(local(2026, 10, 27)), null);
  assert.strictEqual(themes.activeHolidayId(local(2027, 10, 26)), null);
});

t("New Year follows Christmas with no December gap", () => {
  assert.strictEqual(themes.activeHolidayId(local(2026, 11, 26)), "christmas");
  assert.deepStrictEqual(themes.matchingHolidayIds(local(2026, 11, 27)), ["new-year"]);
  assert.strictEqual(themes.activeHolidayId(local(2026, 11, 31)), "new-year");
  const dec1 = themes.matchingHolidayIds(local(2019, 11, 1));
  assert.deepStrictEqual(dec1, ["christmas"]);
});

t("Valentine's Day beats an overlapping Presidents Day weekend", () => {
  const ids = themes.matchingHolidayIds(local(2026, 1, 14));
  assert.ok(ids.includes("valentines") && ids.includes("presidents"), ids.join(","));
  assert.strictEqual(ids[0], "valentines");
  assert.strictEqual(themes.activeHolidayId(local(2026, 1, 15)), "presidents");
  assert.strictEqual(themes.activeHolidayId(local(2026, 1, 17)), null);
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
  assert.strictEqual(themes.activeHolidayId(local(2026, 3, 6)), null);
});

t("all of October stays Halloween", () => {
  assert.strictEqual(themes.activeHolidayId(local(2026, 9, 12)), "halloween");
  assert.deepStrictEqual(themes.matchingHolidayIds(local(2026, 9, 12)), ["halloween"]);
  assert.strictEqual(themes.selectHolidayTheme(local(2027, 9, 31), { reducedMotion: true }), "halloween");
});

t("query preview is read-only and works for every theme", () => {
  assert.strictEqual(themes.readThemeQuery("?theme=Halloween"), "halloween");
  assert.strictEqual(themes.readThemeQuery("?q=bristol&theme=default"), "default");
  assert.strictEqual(themes.readThemeQuery("?theme="), "");
  assert.strictEqual(themes.readThemeQuery(""), "");
  const oct = local(2026, 9, 4);
  const june = local(2026, 5, 15);
  assert.strictEqual(themes.selectHolidayTheme(oct, { query: "default" }), "default");
  assert.strictEqual(themes.selectHolidayTheme(june, { query: "halloween" }), "halloween");
  assert.strictEqual(themes.selectHolidayTheme(oct, { query: "christmas" }), "christmas");
  assert.strictEqual(themes.selectHolidayTheme(june, { query: "nope" }), "default");
  assert.strictEqual(themes.selectHolidayTheme(oct, { reducedMotion: true }), "halloween");
  assert.strictEqual(themes.selectHolidayTheme(june, { reducedMotion: true }), "default");
  assert.strictEqual(themes.selectHolidayTheme(local(2026, 11, 25), { reducedMotion: true }), "christmas");
  for (const id of BUILT) {
    assert.strictEqual(themes.selectHolidayTheme(june, { query: id }), id);
  }
  assert.strictEqual(themes.selectHolidayTheme(new Date(NaN), {}), "default");
  assert.strictEqual(themes.selectHolidayTheme(null, {}), "default");
});

t("applyTheme sets the class and leaves a plain date alone", () => {
  function fakeDoc() {
    function list() {
      const names = new Set();
      return {
        add(c) {
          names.add(c);
        },
        remove(c) {
          names.delete(c);
        },
        contains(c) {
          return names.has(c);
        },
      };
    }
    return {
      documentElement: { classList: list() },
      body: { classList: list() },
    };
  }
  const oct = fakeDoc();
  assert.strictEqual(themes.applyTheme(oct, local(2026, 9, 4), {}), "halloween");
  assert.strictEqual(oct.documentElement.classList.contains("theme-holiday"), true);
  assert.strictEqual(oct.documentElement.classList.contains("theme-halloween"), true);
  const june = fakeDoc();
  assert.strictEqual(themes.applyTheme(june, local(2026, 5, 15), {}), "default");
  assert.strictEqual(june.documentElement.classList.contains("theme-halloween"), false);
  assert.strictEqual(june.documentElement.classList.contains("theme-holiday"), false);
  const xmas = fakeDoc();
  assert.strictEqual(themes.applyTheme(xmas, local(2026, 11, 25), { reducedMotion: true }), "christmas");
  assert.strictEqual(xmas.documentElement.classList.contains("theme-christmas"), true);
});

t("a thrown class update falls back to the default theme", () => {
  const doc = {
    documentElement: {
      classList: {
        add() {
          throw new Error("boom");
        },
        remove() {},
        contains() {
          return false;
        },
      },
    },
    body: {
      classList: {
        add() {},
        remove() {},
        contains() {
          return false;
        },
      },
    },
  };
  assert.strictEqual(themes.applyTheme(doc, local(2026, 9, 4), {}), "default");
});

t("theme source does not touch storage, network, or trackers", () => {
  const root = path.join(__dirname, "..");
  const files = ["themes/us-holidays.js", "themes/holiday-themes.js", "themes/holiday.css"];
  const banned =
    /localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|\bfetch\s*\(|XMLHttpRequest|https?:\/\//i;
  for (const file of files) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(!banned.test(src), file);
    assert.ok(src.includes('aria-hidden="true"') || file.endsWith(".css") || file.endsWith("us-holidays.js"), file);
  }
  const css = fs.readFileSync(path.join(root, "themes/holiday.css"), "utf8");
  assert.ok(/prefers-reduced-motion:\s*reduce/.test(css));
  assert.ok(/pointer-events:\s*none/.test(css));
  assert.ok(/animation:\s*none\s*!important/.test(css));
  assert.ok(/\.is-snow/.test(css));
  assert.ok(/\.is-burst/.test(css));
  assert.ok(!/\.leaflet-tile/.test(css), "theme must not style leaflet tiles");
  assert.ok(!/mix-blend-mode/.test(css));
  assert.ok(!/holiday-bg|hb-bat/.test(css));
  assert.ok(/padding-bottom:\s*calc\(var\(--holiday-scene-h\)/.test(css));
  assert.ok(/holiday-list-scene/.test(css));
  assert.ok(/:has\(\.place-card\)/.test(css));
  const themeJs = fs.readFileSync(path.join(root, "themes/holiday-themes.js"), "utf8");
  assert.ok(!/holiday-bg|hb-bat/.test(themeJs));
  assert.ok(/focusable="false"/.test(themeJs));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.includes('href="themes/holiday.css?v=20261005b"'));
  assert.ok(html.includes('src="themes/us-holidays.js?v=20261005b"'));
  assert.ok(html.includes('src="themes/holiday-themes.js?v=20261005b"'));
  assert.ok(css.length < 15 * 1024, "shared holiday css stays under 15KB");
});

console.log("\n" + pass + " passed");
