/* Holiday themes. Chosen from the local date at load, plus an optional read-only ?theme= query.
 * Floating dates come from themes/us-holidays.js. Nothing here is stored or sent off the device.
 * Registry order is the overlap rule: the first window that contains the date wins.
 * Only the active theme's SVG is inserted. */
(function (factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && document.documentElement) api.mount(document);
})(function () {
  "use strict";

  var H = typeof globalThis !== "undefined" ? globalThis.UsHolidays : null;
  if (!H && typeof require === "function") H = require("./us-holidays.js");
  if (!H || typeof H.easter !== "function") throw new Error("UsHolidays date source is missing");

  function isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
  }

  function partFromDate(date) {
    return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
  }

  function cmp(a, b) {
    if (a.y !== b.y) return a.y - b.y;
    if (a.m !== b.m) return a.m - b.m;
    return a.d - b.d;
  }

  function addDays(part, days) {
    var t = new Date(Date.UTC(part.y, part.m - 1, part.d + days));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  function between(date, start, end) {
    var p = partFromDate(date);
    return cmp(p, start) >= 0 && cmp(p, end) <= 0;
  }

  function weekendThrough(date, monday) {
    return between(date, addDays(monday, -2), monday);
  }

  function containsNewYear(date) {
    var p = partFromDate(date);
    return (p.m === 1 && p.d === 1) || (p.m === 12 && p.d >= 27);
  }

  function containsHalloween(date) {
    return partFromDate(date).m === 10;
  }

  function containsChristmas(date) {
    var p = partFromDate(date);
    return p.m === 12 && p.d >= 1 && p.d <= 26;
  }

  function containsVeterans(date) {
    var p = partFromDate(date);
    return p.m === 11 && p.d === 11;
  }

  function containsThanksgiving(date) {
    var tg = H.usHolidays(date.getFullYear()).thanksgiving;
    return between(date, addDays(tg, -14), tg);
  }

  function containsIndependence(date) {
    var p = partFromDate(date);
    return p.m === 7 && p.d >= 1 && p.d <= 4;
  }

  function containsStPatricks(date) {
    var p = partFromDate(date);
    return p.m === 3 && p.d >= 10 && p.d <= 17;
  }

  function containsEaster(date) {
    var easter = H.easter(date.getFullYear());
    return between(date, addDays(easter, -7), easter);
  }

  function containsValentines(date) {
    var p = partFromDate(date);
    return p.m === 2 && p.d >= 1 && p.d <= 14;
  }

  function containsPresidents(date) {
    var monday = H.usHolidays(date.getFullYear()).presidentsDay;
    return weekendThrough(date, monday);
  }

  function containsMemorial(date) {
    var monday = H.usHolidays(date.getFullYear()).memorialDay;
    return weekendThrough(date, monday);
  }

  function containsLabor(date) {
    var monday = H.usHolidays(date.getFullYear()).laborDay;
    return weekendThrough(date, monday);
  }

  function containsMlk(date) {
    var monday = H.usHolidays(date.getFullYear()).mlkDay;
    return weekendThrough(date, monday);
  }

  var HOLIDAYS = [
    { id: "new-year", built: true, contains: containsNewYear },
    { id: "halloween", built: true, contains: containsHalloween },
    { id: "christmas", built: true, contains: containsChristmas },
    { id: "veterans", built: true, contains: containsVeterans },
    { id: "thanksgiving", built: true, contains: containsThanksgiving },
    { id: "independence", built: true, contains: containsIndependence },
    { id: "st-patricks", built: true, contains: containsStPatricks },
    { id: "easter", built: true, contains: containsEaster },
    { id: "valentines", built: true, contains: containsValentines },
    { id: "presidents", built: true, contains: containsPresidents },
    { id: "memorial", built: true, contains: containsMemorial },
    { id: "labor", built: true, contains: containsLabor },
    { id: "mlk", built: true, contains: containsMlk },
  ];

  function findHoliday(id) {
    for (var i = 0; i < HOLIDAYS.length; i++) {
      if (HOLIDAYS[i].id === id) return HOLIDAYS[i];
    }
    return null;
  }

  function readThemeQuery(search) {
    try {
      var params = new URLSearchParams(search == null ? "" : String(search));
      var value = params.get("theme");
      if (value == null) return "";
      return String(value).trim().toLowerCase();
    } catch (err) {
      return "";
    }
  }

  function matchingHolidayIds(date) {
    if (!isValidDate(date)) return [];
    var ids = [];
    for (var i = 0; i < HOLIDAYS.length; i++) {
      if (HOLIDAYS[i].contains(date)) ids.push(HOLIDAYS[i].id);
    }
    return ids;
  }

  function activeHolidayId(date) {
    var ids = matchingHolidayIds(date);
    return ids.length ? ids[0] : null;
  }

  function selectHolidayTheme(date, options) {
    var opts = options || {};
    var query = opts.query == null ? "" : String(opts.query).trim().toLowerCase();
    if (query === "default") return "default";
    if (query) {
      var forced = findHoliday(query);
      if (forced && forced.built) return forced.id;
    }
    /* Reduced motion does not pick a different theme. CSS stops the animation. */
    var id = activeHolidayId(date);
    if (!id) return "default";
    var holiday = findHoliday(id);
    if (holiday && holiday.built) return holiday.id;
    return "default";
  }

  function easterSunday(year) {
    var e = H.easter(year);
    return new Date(e.y, e.m - 1, e.d);
  }

  function svg(cls, view, w, h, inner, extra) {
    return (
      '<svg class="' + cls + '" viewBox="' + view + '" width="' + w + '" height="' + h + '"' +
      (extra ? " " + extra : "") +
      ' aria-hidden="true" focusable="false">' +
      inner +
      "</svg>"
    );
  }

  function svgPumpkin(cls) {
    return svg(
      cls, "0 0 80 76", 40, 38,
      '<ellipse cx="40" cy="71" rx="16" ry="2.4" fill="#000" opacity="0.22"/>' +
      '<path d="M40 20c1.5-8 9-12 13-8" fill="none" stroke="#6fbf5a" stroke-width="3.4" stroke-linecap="round"/>' +
      '<ellipse cx="48" cy="16" rx="6" ry="3" fill="#6fbf5a" transform="rotate(-18 48 16)"/>' +
      '<ellipse cx="40" cy="46" rx="22" ry="22" fill="#e36a14"/>' +
      '<ellipse cx="25" cy="46" rx="14" ry="20" fill="#f27a1a"/>' +
      '<ellipse cx="55" cy="46" rx="14" ry="20" fill="#d85a0a"/>' +
      '<ellipse cx="40" cy="46" rx="11" ry="21" fill="#ff922e"/>' +
      '<ellipse cx="32" cy="36" rx="3.5" ry="7" fill="#ffd7a8" opacity="0.75"/>' +
      '<ellipse class="hh-glow" cx="40" cy="48" rx="8" ry="10" fill="#ffe7a3"/>' +
      '<polygon points="28,40 35,49 23,49" fill="#2a1408"/>' +
      '<polygon points="52,40 45,49 57,49" fill="#2a1408"/>' +
      '<path d="M31 56l4 4 4-3 4 4 5-4" fill="none" stroke="#2a1408" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
    );
  }

  function svgMoon(cls) {
    return svg(
      cls, "0 0 64 64", 32, 32,
      '<path fill="#ffe7a3" fill-rule="evenodd" d="M48 32A22 22 0 1 0 4 32A22 22 0 1 0 48 32ZM58 30A16 16 0 1 1 26 30A16 16 0 1 1 58 30Z"/>' +
      '<circle cx="18" cy="26" r="2.4" fill="#f0c36a"/>' +
      '<circle cx="16" cy="40" r="1.6" fill="#f0c36a"/>'
    );
  }

  function svgBat(cls) {
    return svg(
      cls, "0 0 80 36", 36, 16,
      '<path fill="#c4b4e6" d="M40 18c-4-8-12-12-22-10 8 4 12 8 12 8S22 14 10 24c8-1 16 2 20 6 4-6 7-8 10-8s6 2 10 8c4-4 12-7 20-6-12-10-20-8-20-8s4-4 12-8c-10-2-18 2-22 10z"/>' +
      '<circle cx="36" cy="18" r="1.5" fill="#2a1408"/>' +
      '<circle cx="44" cy="18" r="1.5" fill="#2a1408"/>'
    );
  }

  function svgGhost(cls) {
    return svg(
      cls, "0 0 48 60", 26, 32,
      '<path fill="#f4f0ea" d="M8 28C8 14 16 6 24 6s16 8 16 22v24l-6-5-5 6-5-6-5 6-6-5-5 4z"/>' +
      '<ellipse cx="18" cy="28" rx="3" ry="3.6" fill="#2a1408"/>' +
      '<ellipse cx="30" cy="28" rx="3" ry="3.6" fill="#2a1408"/>' +
      '<path d="M20 36c2.2 3 6 3 8.2 0" fill="none" stroke="#e7a0b8" stroke-width="1.8" stroke-linecap="round"/>'
    );
  }

  function svgSkyline(cls) {
    return svg(
      cls, "0 0 320 64", 320, 28,
      '<path fill="#8b74b0" d="M0 64V42h14l10-16 10 16h12V30h20v12h12l14-24 14 24h16V36h22v6h8l10-14 10 14h18V26h16v16h14l12-20 12 20h18V38h14v4h10l8-12 8 12H320V64z"/>' +
      '<rect x="46" y="38" width="4" height="6" rx="0.5" fill="#ffe7a3"/>' +
      '<rect x="108" y="40" width="4" height="6" rx="0.5" fill="#ffb020"/>' +
      '<rect x="188" y="34" width="4" height="6" rx="0.5" fill="#ffe7a3"/>' +
      '<rect x="250" y="42" width="4" height="5" rx="0.5" fill="#ffb020"/>' +
      '<path d="M304 64V34M304 46l-8-6M304 40l9-8M304 52l-6 1" fill="none" stroke="#8b74b0" stroke-width="2" stroke-linecap="round"/>',
      'preserveAspectRatio="none"'
    );
  }

  function svgStars(cls) {
    return svg(
      cls, "0 0 280 80", 280, 80,
      '<circle cx="18" cy="18" r="1.3" fill="#fff6ea"/>' +
      '<circle cx="62" cy="12" r="1" fill="#ffe7a3"/>' +
      '<circle cx="96" cy="28" r="1.2" fill="#fff6ea"/>' +
      '<circle cx="134" cy="14" r="0.9" fill="#ffe7a3"/>' +
      '<circle cx="168" cy="32" r="1.1" fill="#fff6ea"/>' +
      '<circle cx="210" cy="16" r="0.8" fill="#ffe7a3"/>' +
      '<circle cx="248" cy="26" r="1.2" fill="#fff6ea"/>'
    );
  }

  function svgBurst(cls, color) {
    return svg(
      cls, "0 0 64 64", 32, 32,
      '<g fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linecap="round">' +
      '<path d="M32 6v12M32 46v12M6 32h12M46 32h12"/>' +
      '<path d="M14 14l8 8M42 42l8 8M50 14l-8 8M22 42l-8 8"/>' +
      "</g>" +
      '<circle cx="32" cy="32" r="4" fill="' + color + '"/>'
    );
  }

  function svgConfetti(cls) {
    return svg(
      cls, "0 0 280 80", 280, 80,
      '<rect class="is-float" x="16" y="14" width="7" height="9" rx="1" fill="#ff7aa2" transform="rotate(18 19 18)"/>' +
      '<rect class="is-float is-d2" x="70" y="8" width="6" height="8" rx="1" fill="#7eb6ff" transform="rotate(-24 73 12)"/>' +
      '<rect class="is-float is-d3" x="120" y="22" width="7" height="5" rx="1" fill="#f2c14e" transform="rotate(30 123 24)"/>' +
      '<rect class="is-float" x="180" y="10" width="6" height="9" rx="1" fill="#ff7aa2" transform="rotate(-12 183 14)"/>' +
      '<rect class="is-float is-d2" x="230" y="20" width="8" height="5" rx="1" fill="#7eb6ff" transform="rotate(22 234 22)"/>' +
      '<circle class="is-float is-d3" cx="48" cy="36" r="3" fill="#f2c14e"/>' +
      '<circle class="is-float" cx="150" cy="8" r="2.4" fill="#fff6ea"/>'
    );
  }

  function svgClock(cls) {
    return svg(
      cls, "0 0 64 64", 32, 32,
      '<circle cx="32" cy="32" r="22" fill="#10182e" stroke="#f2c14e" stroke-width="4"/>' +
      '<circle cx="32" cy="14" r="1.6" fill="#f2c14e"/>' +
      '<circle cx="32" cy="50" r="1.6" fill="#f2c14e"/>' +
      '<circle cx="14" cy="32" r="1.6" fill="#f2c14e"/>' +
      '<circle cx="50" cy="32" r="1.6" fill="#f2c14e"/>' +
      '<path d="M32 32V18M32 32l11 7" fill="none" stroke="#fff6ea" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="32" cy="32" r="2.2" fill="#f2c14e"/>'
    );
  }

  function svgDove(cls) {
    return svg(
      cls, "0 0 88 48", 44, 24,
      '<path fill="#f4f0ea" d="M6 30c10-2 18-12 30-14 1 8 0 12-2 16 10-1 22 2 34 10-12 1-20 8-26 8-2 6-10 8-14 3 3-5 2-9-1-12-8 3-16 1-21-11z"/>' +
      '<path fill="#e7d3bc" d="M62 28c6 1 12 4 16 8-8 0-14-2-16-8z"/>'
    );
  }

  function svgSunrise(cls) {
    return svg(
      cls, "0 0 88 48", 44, 24,
      '<path fill="#f2c14e" d="M8 40a36 28 0 0 1 72 0z"/>' +
      '<path fill="#ffb020" d="M22 40a22 16 0 0 1 44 0z"/>' +
      '<path d="M4 40h80" stroke="#c47a3a" stroke-width="2" stroke-linecap="round"/>'
    );
  }

  function svgHeart(cls, fill) {
    return svg(
      cls, "0 0 64 58", 32, 29,
      '<path fill="' + fill + '" d="M32 54C14 40 4 30 4 18 4 8 12 2 20 2c6 0 10 4 12 9 2-5 6-9 12-9 8 0 16 6 16 16 0 12-10 22-28 36z"/>'
    );
  }

  function svgFlag(cls) {
    return svg(
      cls, "0 0 72 48", 36, 24,
      '<rect width="72" height="48" rx="3" fill="#f4f7fb"/>' +
      '<rect width="72" height="7.2" fill="#c0392b"/>' +
      '<rect y="14.4" width="72" height="7.2" fill="#c0392b"/>' +
      '<rect y="28.8" width="72" height="7.2" fill="#c0392b"/>' +
      '<rect width="30" height="21.6" fill="#1d3557"/>' +
      '<g fill="#f4f7fb">' +
      '<circle cx="6" cy="5" r="1.3"/><circle cx="13" cy="5" r="1.3"/><circle cx="20" cy="5" r="1.3"/>' +
      '<circle cx="9.5" cy="10.5" r="1.3"/><circle cx="16.5" cy="10.5" r="1.3"/>' +
      '<circle cx="6" cy="16" r="1.3"/><circle cx="13" cy="16" r="1.3"/><circle cx="20" cy="16" r="1.3"/>' +
      "</g>"
    );
  }

  function svgBunting(cls) {
    return svg(
      cls, "0 0 280 36", 280, 18,
      '<path d="M0 4h280" stroke="#f2c14e" stroke-width="2"/>' +
      '<path fill="#c0392b" d="M8 6l14 22L36 6z"/>' +
      '<path fill="#f4f7fb" d="M40 6l14 22L68 6z"/>' +
      '<path fill="#1d3557" d="M72 6l14 22L100 6z"/>' +
      '<path fill="#c0392b" d="M104 6l14 22L132 6z"/>' +
      '<path fill="#f4f7fb" d="M136 6l14 22L164 6z"/>' +
      '<path fill="#1d3557" d="M168 6l14 22L196 6z"/>' +
      '<path fill="#c0392b" d="M200 6l14 22L228 6z"/>' +
      '<path fill="#f4f7fb" d="M232 6l14 22L260 6z"/>',
      'preserveAspectRatio="none"'
    );
  }

  function svgStar(cls, fill) {
    return svg(
      cls, "0 0 64 64", 32, 32,
      '<polygon fill="' + fill + '" points="32,4 39,24 60,24 43,36 50,56 32,44 14,56 21,36 4,24 25,24"/>'
    );
  }

  function svgShamrock(cls) {
    return svg(
      cls, "0 0 64 72", 32, 36,
      '<circle cx="22" cy="22" r="12" fill="#3dbe6a"/>' +
      '<circle cx="42" cy="22" r="12" fill="#2fa85c"/>' +
      '<circle cx="32" cy="36" r="12" fill="#3dbe6a"/>' +
      '<path d="M32 44v20" stroke="#146c43" stroke-width="4" stroke-linecap="round"/>'
    );
  }

  function svgRainbow(cls) {
    return svg(
      cls, "0 0 88 48", 44, 24,
      '<path d="M6 46a38 38 0 0 1 76 0" fill="none" stroke="#e23b3b" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M14 46a30 30 0 0 1 60 0" fill="none" stroke="#f2c14e" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M22 46a22 22 0 0 1 44 0" fill="none" stroke="#3dbe6a" stroke-width="5" stroke-linecap="round"/>'
    );
  }

  function svgPot(cls) {
    return svg(
      cls, "0 0 72 64", 36, 32,
      '<ellipse cx="36" cy="24" rx="26" ry="8" fill="#1f8a52"/>' +
      '<path fill="#146c43" d="M12 26h48l-6 28H18z"/>' +
      '<ellipse cx="36" cy="26" rx="24" ry="6" fill="#0f5c38"/>' +
      '<circle cx="24" cy="16" r="5" fill="#f2c14e"/>' +
      '<circle cx="36" cy="10" r="5" fill="#ffe7a3"/>' +
      '<circle cx="48" cy="16" r="4.5" fill="#f2c14e"/>'
    );
  }

  function svgEgg(cls, band) {
    return svg(
      cls, "0 0 48 64", 24, 32,
      '<ellipse cx="24" cy="36" rx="16" ry="22" fill="#fff6ea"/>' +
      '<path d="M10 30h28" stroke="' + band + '" stroke-width="5"/>' +
      '<path d="M12 42h24" stroke="#7eb6ff" stroke-width="4"/>' +
      '<circle cx="24" cy="22" r="3" fill="#f2c14e"/>'
    );
  }

  function svgBunny(cls) {
    return svg(
      cls, "0 0 64 72", 32, 36,
      '<ellipse cx="22" cy="16" rx="6" ry="14" fill="#f4f0ea"/>' +
      '<ellipse cx="40" cy="16" rx="6" ry="14" fill="#f4f0ea"/>' +
      '<ellipse cx="22" cy="16" rx="3" ry="8" fill="#ffb7c8"/>' +
      '<ellipse cx="40" cy="16" rx="3" ry="8" fill="#ffb7c8"/>' +
      '<ellipse cx="31" cy="44" rx="18" ry="16" fill="#f4f0ea"/>' +
      '<circle cx="24" cy="42" r="2" fill="#2a1408"/>' +
      '<circle cx="36" cy="42" r="2" fill="#2a1408"/>' +
      '<ellipse cx="30" cy="48" rx="3" ry="2" fill="#ff8fa3"/>'
    );
  }

  function svgFlower(cls) {
    return svg(
      cls, "0 0 48 64", 24, 32,
      '<circle cx="16" cy="18" r="7" fill="#ff8fa3"/>' +
      '<circle cx="30" cy="16" r="7" fill="#ff8fa3"/>' +
      '<circle cx="24" cy="28" r="7" fill="#ffb7c8"/>' +
      '<circle cx="23" cy="21" r="4" fill="#f2c14e"/>' +
      '<path d="M23 28v28" stroke="#3dbe6a" stroke-width="3" stroke-linecap="round"/>'
    );
  }

  function svgPoppy(cls) {
    return svg(
      cls, "0 0 48 64", 24, 32,
      '<circle cx="24" cy="22" r="14" fill="#c0392b"/>' +
      '<circle cx="24" cy="22" r="5" fill="#1a1408"/>' +
      '<path d="M24 36v22" stroke="#3dbe6a" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M24 46c8 2 10-6 14-4" fill="none" stroke="#3dbe6a" stroke-width="2" stroke-linecap="round"/>'
    );
  }

  function svgBasket(cls) {
    return svg(
      cls, "0 0 72 64", 36, 32,
      '<path fill="#c0392b" d="M6 48h60v8H6z"/>' +
      '<path fill="#f4f7fb" d="M6 48h60v4H6z"/>' +
      '<rect x="16" y="28" width="40" height="22" rx="3" fill="#c47a3a"/>' +
      '<rect x="16" y="28" width="40" height="8" fill="#a8642e"/>' +
      '<path d="M26 28c0-10 20-10 20 0" fill="none" stroke="#f2c14e" stroke-width="3"/>'
    );
  }

  function svgTools(cls) {
    return svg(
      cls, "0 0 64 64", 32, 32,
      '<path fill="#d4a05a" d="M14 8h10v28H14z"/>' +
      '<path fill="#8a5a2b" d="M10 36h18v8H10z"/>' +
      '<path fill="#c0c6ce" d="M40 10l8 8-16 16-8-8z"/>' +
      '<path fill="#8a93a0" d="M30 28l6 6-4 8-8-4z"/>'
    );
  }

  function svgLeaf(cls, fill) {
    return svg(
      cls, "0 0 48 64", 24, 32,
      '<path fill="' + fill + '" d="M24 4c10 12 18 16 18 30 0 12-8 22-18 24C14 56 6 46 6 34 6 20 14 16 24 4z"/>' +
      '<path d="M24 16v36M24 28c-8 2-10 8-8 12M24 36c8-1 12 4 10 10" fill="none" stroke="#f2c14e" stroke-width="2" stroke-linecap="round"/>'
    );
  }

  function svgTurkey(cls) {
    return svg(
      cls, "0 0 88 80", 44, 40,
      '<ellipse cx="28" cy="36" rx="16" ry="20" fill="#c4522a"/>' +
      '<ellipse cx="44" cy="34" rx="16" ry="22" fill="#e07a2f"/>' +
      '<ellipse cx="58" cy="36" rx="14" ry="18" fill="#f2c14e"/>' +
      '<ellipse cx="46" cy="52" rx="18" ry="16" fill="#8a3e1a"/>' +
      '<circle cx="46" cy="46" r="10" fill="#d4a05a"/>' +
      '<circle cx="42" cy="44" r="1.5" fill="#2a1408"/>' +
      '<circle cx="50" cy="44" r="1.5" fill="#2a1408"/>' +
      '<path d="M46 48l4 3-4 1z" fill="#f2c14e"/>' +
      '<path fill="#c0392b" d="M44 40c2-6 8-6 8-2 0 2-2 3-4 2"/>'
    );
  }

  function svgPie(cls) {
    return svg(
      cls, "0 0 80 56", 40, 28,
      '<ellipse cx="40" cy="36" rx="30" ry="12" fill="#a8642e"/>' +
      '<path fill="#f2c14e" d="M10 34c6-16 54-16 60 0"/>' +
      '<path d="M40 20v16M22 28l18 10 18-10" fill="none" stroke="#8a5a2b" stroke-width="2"/>' +
      '<ellipse cx="40" cy="36" rx="30" ry="10" fill="none" stroke="#8a5a2b" stroke-width="3"/>'
    );
  }

  function svgSanta(cls) {
    return svg(
      cls, "0 0 64 72", 32, 36,
      '<path fill="#d7263d" d="M18 26L32 4l14 22z"/>' +
      '<circle cx="32" cy="6" r="4" fill="#f4f7fb"/>' +
      '<rect x="14" y="24" width="36" height="8" rx="3" fill="#f4f7fb"/>' +
      '<circle cx="32" cy="40" r="14" fill="#f0c8b0"/>' +
      '<circle cx="26" cy="38" r="1.6" fill="#2a1408"/>' +
      '<circle cx="38" cy="38" r="1.6" fill="#2a1408"/>' +
      '<ellipse cx="32" cy="52" rx="16" ry="12" fill="#f4f7fb"/>' +
      '<circle cx="32" cy="44" r="2" fill="#e23b3b"/>'
    );
  }

  function svgReindeer(cls) {
    return svg(
      cls, "0 0 80 64", 40, 32,
      '<path d="M22 8l4 12M18 14l10 4M36 6l-2 14M40 12l-8 6" fill="none" stroke="#c47a3a" stroke-width="2.4" stroke-linecap="round"/>' +
      '<ellipse cx="34" cy="32" rx="14" ry="12" fill="#c47a3a"/>' +
      '<circle cx="28" cy="30" r="1.6" fill="#2a1408"/>' +
      '<ellipse cx="48" cy="34" rx="5" ry="3.4" fill="#a8642e"/>' +
      '<circle cx="52" cy="34" r="3" fill="#e23b3b"/>' +
      '<ellipse cx="36" cy="50" rx="16" ry="8" fill="#a8642e"/>'
    );
  }

  function svgSnowman(cls) {
    return svg(
      cls, "0 0 64 80", 32, 40,
      '<circle cx="32" cy="56" r="16" fill="#f4f7fb"/>' +
      '<circle cx="32" cy="34" r="12" fill="#f4f7fb"/>' +
      '<rect x="22" y="16" width="20" height="6" rx="1" fill="#1a2744"/>' +
      '<rect x="26" y="6" width="12" height="12" fill="#1a2744"/>' +
      '<circle cx="28" cy="32" r="1.4" fill="#2a1408"/>' +
      '<circle cx="36" cy="32" r="1.4" fill="#2a1408"/>' +
      '<path d="M18 36h28" stroke="#d7263d" stroke-width="3" stroke-linecap="round"/>' +
      '<circle cx="32" cy="48" r="1.5" fill="#1a2744"/>' +
      '<circle cx="32" cy="56" r="1.5" fill="#1a2744"/>'
    );
  }

  function svgSnow(cls) {
    return svg(
      cls, "0 0 280 80", 280, 80,
      '<g fill="#f4f7fb">' +
      '<circle cx="20" cy="12" r="2.2"/><circle cx="54" cy="28" r="1.6"/><circle cx="88" cy="10" r="2"/>' +
      '<circle cx="130" cy="24" r="1.4"/><circle cx="170" cy="8" r="2.2"/><circle cx="210" cy="22" r="1.6"/>' +
      '<circle cx="248" cy="12" r="2"/><circle cx="36" cy="48" r="1.5"/><circle cx="150" cy="46" r="1.8"/>' +
      '<circle cx="230" cy="50" r="1.4"/>' +
      "</g>"
    );
  }

  function artBox(headerInner, listInner) {
    return {
      header:
        '<div class="holiday-header-art" id="holiday-header-art" aria-hidden="true">' + headerInner + "</div>",
      list:
        '<div class="holiday-list-scene" id="holiday-list-scene" aria-hidden="true">' + listInner + "</div>",
    };
  }

  function takeNode(doc, markup) {
    var wrap = doc.createElement("div");
    wrap.innerHTML = markup;
    return wrap.firstElementChild;
  }

  function paint(doc, box) {
    if (!doc || typeof doc.createElement !== "function" || typeof doc.getElementById !== "function") return;
    var header = typeof doc.querySelector === "function" ? doc.querySelector(".header") : null;
    if (header && typeof header.appendChild === "function" && !doc.getElementById("holiday-header-art")) {
      header.appendChild(takeNode(doc, box.header));
    }
    var list = typeof doc.querySelector === "function" ? doc.querySelector(".list-section") : null;
    if (list && typeof list.appendChild === "function" && !doc.getElementById("holiday-list-scene")) {
      list.appendChild(takeNode(doc, box.list));
    }
  }

  function paintNewYear(doc) {
    paint(doc, artBox(
      svgConfetti("hh-f") + svgClock("hh-a") + svgBurst("hh-b is-burst", "#ff7aa2") + svgBurst("hh-c is-burst is-d2", "#7eb6ff") + svgBurst("hh-d is-burst is-d3", "#f2c14e") + svgClock("hh-e"),
      svgConfetti("hl-f") + svgBurst("hl-a is-burst", "#ff7aa2") + svgBurst("hl-b is-burst is-d2", "#7eb6ff") + svgClock("hl-c") + svgBurst("hl-d is-burst is-d3", "#f2c14e") + svgClock("hl-e")
    ));
  }

  function paintMlk(doc) {
    paint(doc, artBox(
      svgSunrise("hh-a") + svgDove("hh-d") + svgSunrise("hh-e"),
      svgSunrise("hl-a") + svgDove("hl-c") + svgSunrise("hl-e") + svgDove("hl-d")
    ));
  }

  function paintValentines(doc) {
    paint(doc, artBox(
      svgHeart("hh-a is-float", "#ff7aa2") + svgHeart("hh-b is-float is-d2", "#fff6ea") + svgHeart("hh-c is-float is-d3", "#ff8fa3") + svgHeart("hh-d is-float", "#ff7aa2") + svgHeart("hh-e is-float is-d2", "#fff6ea"),
      svgHeart("hl-a is-float", "#ff7aa2") + svgHeart("hl-b is-float is-d2", "#fff6ea") + svgHeart("hl-c is-float is-d3", "#ff8fa3") + svgHeart("hl-d is-float", "#ff7aa2") + svgHeart("hl-e is-float is-d2", "#fff6ea")
    ));
  }

  function paintPresidents(doc) {
    paint(doc, artBox(
      svgFlag("hh-a") + svgStar("hh-b", "#f2c14e") + svgFlag("hh-d") + svgBunting("hh-g") + svgStar("hh-e", "#f4f7fb"),
      svgBunting("hl-f") + svgFlag("hl-a") + svgStar("hl-b", "#f2c14e") + svgFlag("hl-d") + svgStar("hl-e", "#f4f7fb")
    ));
  }

  function paintStPatricks(doc) {
    paint(doc, artBox(
      svgShamrock("hh-a is-float") + svgRainbow("hh-b") + svgPot("hh-d") + svgShamrock("hh-e is-float is-d2"),
      svgRainbow("hl-b") + svgShamrock("hl-a is-float") + svgPot("hl-d") + svgShamrock("hl-e is-float is-d2") + svgRainbow("hl-c")
    ));
  }

  function paintEaster(doc) {
    paint(doc, artBox(
      svgEgg("hh-a", "#ff8fa3") + svgFlower("hh-b is-float") + svgBunny("hh-d") + svgEgg("hh-e", "#c8f0d4") + svgFlower("hh-c is-float is-d2"),
      svgEgg("hl-a", "#ff8fa3") + svgFlower("hl-b is-float") + svgBunny("hl-d") + svgEgg("hl-e", "#c8f0d4") + svgFlower("hl-c is-float is-d2")
    ));
  }

  function paintMemorial(doc) {
    paint(doc, artBox(
      svgFlag("hh-a") + svgPoppy("hh-b") + svgPoppy("hh-d") + svgFlag("hh-e"),
      svgFlag("hl-a") + svgPoppy("hl-b") + svgPoppy("hl-c") + svgFlag("hl-d") + svgPoppy("hl-e")
    ));
  }

  function paintIndependence(doc) {
    paint(doc, artBox(
      svgBurst("hh-a is-burst", "#f2c14e") + svgFlag("hh-b") + svgBurst("hh-c is-burst is-d2", "#7eb6ff") + svgFlag("hh-d") + svgStar("hh-e", "#fff6ea"),
      svgBurst("hl-a is-burst", "#ff7aa2") + svgFlag("hl-b") + svgStar("hl-c", "#f2c14e") + svgBurst("hl-d is-burst is-d2", "#7eb6ff") + svgFlag("hl-e")
    ));
  }

  function paintLabor(doc) {
    paint(doc, artBox(
      svgBasket("hh-a") + svgTools("hh-d") + svgBasket("hh-e"),
      svgBasket("hl-a") + svgTools("hl-c") + svgBasket("hl-d") + svgTools("hl-e")
    ));
  }

  function paintHalloween(doc) {
    paint(doc, artBox(
      svgStars("hh-stars") + svgSkyline("hh-skyline") + svgMoon("hh-moon") + svgBat("hh-bat hh-bat-a") + svgBat("hh-bat hh-bat-b") + svgGhost("hh-ghost") + svgPumpkin("hh-pumpkin hh-pumpkin-a") + svgPumpkin("hh-pumpkin hh-pumpkin-b"),
      svgMoon("hl-moon") + svgBat("hl-bat hl-bat-a") + svgBat("hl-bat hl-bat-b") + svgGhost("hl-ghost") + svgSkyline("hl-skyline") + svgPumpkin("hl-pumpkin hl-pumpkin-a") + svgPumpkin("hl-pumpkin hl-pumpkin-b")
    ));
  }

  function paintVeterans(doc) {
    paint(doc, artBox(
      svgFlag("hh-a") + svgStar("hh-d", "#f2c14e") + svgFlag("hh-e"),
      svgFlag("hl-a") + svgStar("hl-c", "#f2c14e") + svgFlag("hl-d") + svgStar("hl-e", "#f2c14e")
    ));
  }

  function paintThanksgiving(doc) {
    paint(doc, artBox(
      svgLeaf("hh-a is-float", "#c4522a") + svgLeaf("hh-b is-float is-d2", "#e07a2f") + svgTurkey("hh-d") + svgPie("hh-e"),
      svgLeaf("hl-a is-float", "#c4522a") + svgLeaf("hl-b is-float is-d2", "#e07a2f") + svgTurkey("hl-d") + svgPie("hl-c") + svgLeaf("hl-e is-float is-d3", "#f2c14e")
    ));
  }

  function paintChristmas(doc) {
    paint(doc, artBox(
      svgSnow("hh-f is-snow") + svgSanta("hh-a") + svgReindeer("hh-b") + svgSnowman("hh-d") + svgSanta("hh-e"),
      svgSnow("hl-f is-snow") + svgReindeer("hl-a") + svgSnowman("hl-c") + svgSanta("hl-d") + svgReindeer("hl-e")
    ));
  }

  var PAINTERS = {
    "new-year": paintNewYear,
    mlk: paintMlk,
    valentines: paintValentines,
    presidents: paintPresidents,
    "st-patricks": paintStPatricks,
    easter: paintEaster,
    memorial: paintMemorial,
    independence: paintIndependence,
    labor: paintLabor,
    halloween: paintHalloween,
    veterans: paintVeterans,
    thanksgiving: paintThanksgiving,
    christmas: paintChristmas,
  };

  function clearThemeClass(doc, id) {
    try {
      if (doc.documentElement && doc.documentElement.classList) {
        doc.documentElement.classList.remove("theme-holiday");
        if (id) doc.documentElement.classList.remove("theme-" + id);
      }
      if (doc.body && doc.body.classList) {
        doc.body.classList.remove("theme-holiday");
        if (id) doc.body.classList.remove("theme-" + id);
      }
    } catch (err) {
      /* Leave the default theme in place. */
    }
  }

  function applyTheme(doc, date, options) {
    var id = "default";
    try {
      id = selectHolidayTheme(date, options);
      if (!id || id === "default") return "default";
      if (PAINTERS[id]) PAINTERS[id](doc);
      doc.documentElement.classList.add("theme-holiday");
      doc.documentElement.classList.add("theme-" + id);
      if (doc.body && doc.body.classList) {
        doc.body.classList.add("theme-holiday");
        doc.body.classList.add("theme-" + id);
      }
      return id;
    } catch (err) {
      if (id && id !== "default") clearThemeClass(doc, id);
      return "default";
    }
  }

  function mount(doc) {
    var search = "";
    try {
      var view = doc.defaultView;
      if (view && view.location) search = view.location.search || "";
    } catch (err) {
      search = "";
    }
    return applyTheme(doc, new Date(), {
      query: readThemeQuery(search),
    });
  }

  return {
    HOLIDAYS: HOLIDAYS,
    easterSunday: easterSunday,
    readThemeQuery: readThemeQuery,
    matchingHolidayIds: matchingHolidayIds,
    activeHolidayId: activeHolidayId,
    selectHolidayTheme: selectHolidayTheme,
    applyTheme: applyTheme,
    mount: mount,
    painterIds: Object.keys(PAINTERS),
  };
});
