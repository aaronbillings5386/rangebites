/* US holiday dates. Months are 1–12. Weekday 0 is Sunday.
 * Anonymous Gregorian Easter, plus nth/last weekday. No network and no storage.
 * Verified against the civil calendar for the floating holidays this site themes. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.UsHolidays = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function D(y, m, d) {
    return { y: y, m: m, d: d };
  }

  function dow(y, m, d) {
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  }

  function daysIn(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function nthWeekday(y, m, weekday, n) {
    return D(y, m, 1 + ((weekday - dow(y, m, 1) + 7) % 7) + 7 * (n - 1));
  }

  function lastWeekday(y, m, weekday) {
    var L = daysIn(y, m);
    return D(y, m, L - ((dow(y, m, L) - weekday + 7) % 7));
  }

  function easter(y) {
    var a = y % 19;
    var b = Math.floor(y / 100);
    var c = y % 100;
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
    return D(y, month, day);
  }

  function observed(part) {
    var w = dow(part.y, part.m, part.d);
    var t = new Date(Date.UTC(part.y, part.m - 1, part.d + (w === 6 ? -1 : w === 0 ? 1 : 0)));
    return D(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  function usHolidays(y) {
    return {
      newYear: D(y, 1, 1),
      mlkDay: nthWeekday(y, 1, 1, 3),
      valentines: D(y, 2, 14),
      presidentsDay: nthWeekday(y, 2, 1, 3),
      stPatricks: D(y, 3, 17),
      easter: easter(y),
      mothersDay: nthWeekday(y, 5, 0, 2),
      memorialDay: lastWeekday(y, 5, 1),
      fathersDay: nthWeekday(y, 6, 0, 3),
      juneteenth: D(y, 6, 19),
      independenceDay: D(y, 7, 4),
      laborDay: nthWeekday(y, 9, 1, 1),
      halloween: D(y, 10, 31),
      veteransDay: D(y, 11, 11),
      thanksgiving: nthWeekday(y, 11, 4, 4),
      christmasEve: D(y, 12, 24),
      christmas: D(y, 12, 25),
    };
  }

  function iso(part) {
    return part.y + "-" + String(part.m).padStart(2, "0") + "-" + String(part.d).padStart(2, "0");
  }

  return {
    nthWeekday: nthWeekday,
    lastWeekday: lastWeekday,
    easter: easter,
    observed: observed,
    usHolidays: usHolidays,
    iso: iso,
  };
});
