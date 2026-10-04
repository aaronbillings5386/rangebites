/* Holiday themes. Chosen from the local date at load, plus an optional read-only ?theme= query.
 * Nothing from this file is written to storage or sent off the device.
 * Registry order is the overlap rule: the first window that contains the date wins. */
(function (factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && document.documentElement) api.mount(document);
})(function () {
  "use strict";

  function isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
  }

  function ymd(date) {
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  }

  function onOrBetween(date, start, end) {
    var n = ymd(date);
    return n >= ymd(start) && n <= ymd(end);
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  function nthWeekday(year, monthIndex, weekday, n) {
    var first = new Date(year, monthIndex, 1);
    var delta = (weekday - first.getDay() + 7) % 7;
    return new Date(year, monthIndex, 1 + delta + (n - 1) * 7);
  }

  function lastWeekday(year, monthIndex, weekday) {
    var last = new Date(year, monthIndex + 1, 0);
    var delta = (last.getDay() - weekday + 7) % 7;
    return new Date(year, monthIndex, last.getDate() - delta);
  }

  /* Anonymous Gregorian computus. Month in the returned Date is local. */
  function easterSunday(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function containsNewYear(date) {
    var month = date.getMonth();
    var day = date.getDate();
    return (month === 11 && day === 31) || (month === 0 && day === 1);
  }

  function containsHalloween(date) {
    return date.getMonth() === 9;
  }

  function containsChristmas(date) {
    return date.getMonth() === 11 && date.getDate() <= 30;
  }

  function containsThanksgiving(date) {
    var thursday = nthWeekday(date.getFullYear(), 10, 4, 4);
    return onOrBetween(date, addDays(thursday, -3), addDays(thursday, 3));
  }

  function containsIndependence(date) {
    return date.getMonth() === 6 && date.getDate() >= 1 && date.getDate() <= 4;
  }

  function containsJuneteenth(date) {
    return date.getMonth() === 5 && date.getDate() === 19;
  }

  function containsFathersDay(date) {
    var sunday = nthWeekday(date.getFullYear(), 5, 0, 3);
    return onOrBetween(date, addDays(sunday, -1), sunday);
  }

  function containsStPatricks(date) {
    return date.getMonth() === 2 && date.getDate() >= 10 && date.getDate() <= 17;
  }

  function containsEaster(date) {
    var easter = easterSunday(date.getFullYear());
    return onOrBetween(date, addDays(easter, -7), easter);
  }

  function containsValentines(date) {
    return date.getMonth() === 1 && date.getDate() >= 1 && date.getDate() <= 14;
  }

  function containsPresidents(date) {
    var monday = nthWeekday(date.getFullYear(), 1, 1, 3);
    return onOrBetween(date, addDays(monday, -2), monday);
  }

  function containsMemorial(date) {
    var monday = lastWeekday(date.getFullYear(), 4, 1);
    return onOrBetween(date, addDays(monday, -2), monday);
  }

  function containsLabor(date) {
    var monday = nthWeekday(date.getFullYear(), 8, 1, 1);
    return onOrBetween(date, addDays(monday, -2), monday);
  }

  function containsMothersDay(date) {
    var sunday = nthWeekday(date.getFullYear(), 4, 0, 2);
    return onOrBetween(date, addDays(sunday, -1), sunday);
  }

  function containsMlk(date) {
    var monday = nthWeekday(date.getFullYear(), 0, 1, 3);
    return onOrBetween(date, addDays(monday, -2), monday);
  }

  function containsVeterans(date) {
    return date.getMonth() === 10 && date.getDate() === 11;
  }

  var HOLIDAYS = [
    { id: "new-year", built: false, contains: containsNewYear },
    { id: "halloween", built: true, contains: containsHalloween },
    { id: "christmas", built: false, contains: containsChristmas },
    { id: "thanksgiving", built: false, contains: containsThanksgiving },
    { id: "independence", built: false, contains: containsIndependence },
    { id: "juneteenth", built: false, contains: containsJuneteenth },
    { id: "fathers-day", built: false, contains: containsFathersDay },
    { id: "st-patricks", built: false, contains: containsStPatricks },
    { id: "easter", built: false, contains: containsEaster },
    { id: "valentines", built: false, contains: containsValentines },
    { id: "presidents", built: false, contains: containsPresidents },
    { id: "memorial", built: false, contains: containsMemorial },
    { id: "labor", built: false, contains: containsLabor },
    { id: "mothers-day", built: false, contains: containsMothersDay },
    { id: "mlk", built: false, contains: containsMlk },
    { id: "veterans", built: false, contains: containsVeterans },
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
    if (opts.reducedMotion) return "default";
    var id = activeHolidayId(date);
    if (!id) return "default";
    var holiday = findHoliday(id);
    if (holiday && holiday.built) return holiday.id;
    return "default";
  }

  function svgPumpkin(cls) {
    return (
      '<svg class="' + cls + '" viewBox="0 0 80 76" width="40" height="38" aria-hidden="true" focusable="false">' +
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
        '<path d="M31 56l4 4 4-3 4 4 5-4" fill="none" stroke="#2a1408" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function svgMoon(cls) {
    return (
      '<svg class="' + cls + '" viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" focusable="false">' +
        '<path fill="#ffe7a3" fill-rule="evenodd" d="M48 32A22 22 0 1 0 4 32A22 22 0 1 0 48 32ZM58 30A16 16 0 1 1 26 30A16 16 0 1 1 58 30Z"/>' +
        '<circle cx="18" cy="26" r="2.4" fill="#f0c36a"/>' +
        '<circle cx="16" cy="40" r="1.6" fill="#f0c36a"/>' +
      "</svg>"
    );
  }

  function svgBat(cls) {
    return (
      '<svg class="' + cls + '" viewBox="0 0 80 36" width="36" height="16" aria-hidden="true" focusable="false">' +
        '<path fill="#c4b4e6" d="M40 18c-4-8-12-12-22-10 8 4 12 8 12 8S22 14 10 24c8-1 16 2 20 6 4-6 7-8 10-8s6 2 10 8c4-4 12-7 20-6-12-10-20-8-20-8s4-4 12-8c-10-2-18 2-22 10z"/>' +
        '<circle cx="36" cy="18" r="1.5" fill="#2a1408"/>' +
        '<circle cx="44" cy="18" r="1.5" fill="#2a1408"/>' +
      "</svg>"
    );
  }

  function svgGhost(cls) {
    return (
      '<svg class="' + cls + '" viewBox="0 0 48 60" width="26" height="32" aria-hidden="true" focusable="false">' +
        '<path fill="#f4f0ea" d="M8 28C8 14 16 6 24 6s16 8 16 22v24l-6-5-5 6-5-6-5 6-6-5-5 4z"/>' +
        '<ellipse cx="18" cy="28" rx="3" ry="3.6" fill="#2a1408"/>' +
        '<ellipse cx="30" cy="28" rx="3" ry="3.6" fill="#2a1408"/>' +
        '<path d="M20 36c2.2 3 6 3 8.2 0" fill="none" stroke="#e7a0b8" stroke-width="1.8" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function svgSkyline(cls) {
    return (
      '<svg class="' + cls + '" viewBox="0 0 320 64" width="320" height="28" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
        '<path fill="#8b74b0" d="M0 64V42h14l10-16 10 16h12V30h20v12h12l14-24 14 24h16V36h22v6h8l10-14 10 14h18V26h16v16h14l12-20 12 20h18V38h14v4h10l8-12 8 12H320V64z"/>' +
        '<rect x="46" y="38" width="4" height="6" rx="0.5" fill="#ffe7a3"/>' +
        '<rect x="108" y="40" width="4" height="6" rx="0.5" fill="#ffb020"/>' +
        '<rect x="188" y="34" width="4" height="6" rx="0.5" fill="#ffe7a3"/>' +
        '<rect x="250" y="42" width="4" height="5" rx="0.5" fill="#ffb020"/>' +
        '<path d="M304 64V34M304 46l-8-6M304 40l9-8M304 52l-6 1" fill="none" stroke="#8b74b0" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function svgStars(cls) {
    return (
      '<svg class="' + cls + '" viewBox="0 0 160 220" width="160" height="220" aria-hidden="true" focusable="false">' +
        '<circle cx="18" cy="28" r="1.3" fill="#fff6ea"/>' +
        '<circle cx="62" cy="16" r="1" fill="#ffe7a3"/>' +
        '<circle cx="96" cy="40" r="1.2" fill="#fff6ea"/>' +
        '<circle cx="134" cy="22" r="0.9" fill="#ffe7a3"/>' +
        '<circle cx="40" cy="70" r="0.8" fill="#fff6ea"/>' +
        '<circle cx="120" cy="84" r="1.1" fill="#fff6ea"/>' +
        '<circle cx="24" cy="110" r="0.7" fill="#ffe7a3"/>' +
        '<circle cx="148" cy="60" r="0.8" fill="#fff6ea"/>' +
      "</svg>"
    );
  }

  function headerMarkup() {
    return (
      '<div class="holiday-header-art" id="holiday-header-art" aria-hidden="true">' +
        svgStars("hh-stars") +
        svgSkyline("hh-skyline") +
        svgMoon("hh-moon") +
        svgBat("hh-bat hh-bat-a") +
        svgBat("hh-bat hh-bat-b") +
        svgGhost("hh-ghost") +
        svgPumpkin("hh-pumpkin hh-pumpkin-a") +
        svgPumpkin("hh-pumpkin hh-pumpkin-b") +
      "</div>"
    );
  }

  function sideMarkup(which) {
    return (
      '<div class="hb-side hb-' + which + '" aria-hidden="true">' +
        '<div class="hb-flip">' +
          svgStars("hb-stars") +
          svgMoon("hb-moon") +
          svgBat("hb-bat hb-bat-a") +
          svgBat("hb-bat hb-bat-b") +
          svgGhost("hb-ghost") +
          svgSkyline("hb-skyline") +
          svgPumpkin("hb-pumpkin hb-pumpkin-a") +
          svgPumpkin("hb-pumpkin hb-pumpkin-b") +
        "</div>" +
      "</div>"
    );
  }

  function backgroundMarkup() {
    return (
      '<div class="holiday-bg" id="holiday-bg" aria-hidden="true">' +
        sideMarkup("left") +
        sideMarkup("right") +
      "</div>"
    );
  }

  function takeNode(doc, markup) {
    var wrap = doc.createElement("div");
    wrap.innerHTML = markup;
    return wrap.firstElementChild;
  }

  function paintHalloween(doc) {
    if (!doc || typeof doc.createElement !== "function" || typeof doc.getElementById !== "function") return;
    if (doc.getElementById("holiday-header-art") || doc.getElementById("holiday-bg")) return;
    var header = typeof doc.querySelector === "function" ? doc.querySelector(".header") : null;
    if (header && typeof header.appendChild === "function") {
      header.appendChild(takeNode(doc, headerMarkup()));
    }
    if (doc.body && typeof doc.body.insertBefore === "function") {
      doc.body.insertBefore(takeNode(doc, backgroundMarkup()), doc.body.firstChild);
    }
  }

  var PAINTERS = {
    halloween: paintHalloween,
  };

  function clearThemeClass(doc, id) {
    try {
      if (doc.documentElement && doc.documentElement.classList) {
        doc.documentElement.classList.remove("theme-" + id);
      }
      if (doc.body && doc.body.classList) doc.body.classList.remove("theme-" + id);
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
      doc.documentElement.classList.add("theme-" + id);
      if (doc.body && doc.body.classList) doc.body.classList.add("theme-" + id);
      return id;
    } catch (err) {
      if (id && id !== "default") clearThemeClass(doc, id);
      return "default";
    }
  }

  function mount(doc) {
    var search = "";
    var reduced = false;
    try {
      var view = doc.defaultView;
      if (view && view.location) search = view.location.search || "";
    } catch (err) {
      search = "";
    }
    try {
      var media = doc.defaultView;
      reduced = !!(media && media.matchMedia && media.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (err2) {
      reduced = false;
    }
    return applyTheme(doc, new Date(), {
      query: readThemeQuery(search),
      reducedMotion: reduced,
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
  };
});
