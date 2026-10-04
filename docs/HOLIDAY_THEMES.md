# Holiday themes

Each major US holiday gets its own cartoony theme. The page picks one from the device's local date when it loads. The existing layout, type, map, and controls stay as they are. A theme is only decoration.

Only Halloween is built. Every other holiday below is planned: the window is already in the registry, and the art is not.

## How a date picks a theme

`themes/holiday-themes.js` holds a registry, `HOLIDAYS`. Each entry has an id, a `built` flag, and a `contains(date)` window. Windows use the local calendar (`getFullYear`, `getMonth`, `getDate`), not UTC.

The first entry whose window contains the date wins. Later entries do not override it. A winning holiday that is still planned does not change the page; the default theme stays until that entry is built.

Overlaps that rule settles:

- December 31 and January 1 are New Year's, not Christmas. Christmas is December 1–30.
- All of October is Halloween, including Indigenous Peoples' Day and Columbus Day (the second Monday in October). Those days do not get a separate theme.
- Thanksgiving is the Monday before the fourth Thursday in November through the Sunday after. When that Sunday falls in December (Thanksgiving on November 28, as in 2019), December 1 is Christmas.
- February 13–14 can sit in both Valentine's Day and the Presidents Day weekend. Valentine's Day wins those days.
- June 19 is Juneteenth even when it falls on the Father's Day weekend.
- Palm Sunday can fall on March 15–17 when Easter is March 22–24. Those days stay St. Patrick's Day. Easter then runs from March 18 through Easter Sunday.

## New Year's

- **Status:** Planned
- **Window:** December 31 through January 1, local date, inclusive.
- **Motifs:** A cartoon clock at midnight, a sparkler, and a few confetti dots. No countdown that needs a stored visit.
- **Palette:**
  - `#0e1428` — night sky. `#fff6ea` on it is 17.1:1. Safe if a caption is ever added; this theme still must not recolor the app's text.
  - `#f2c14e` — gold spark. On `#14110e`, 11.2:1. Illustration.
  - `#7eb6ff` — confetti blue. On `#14110e`, 9.0:1. Illustration.
  - `#ff7aa2` — confetti pink. On `#14110e`, 7.7:1. Illustration.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: clock, sparkler, confetti. Not in this PR.

## Martin Luther King Jr. Day

- **Status:** Planned
- **Window:** The Saturday before the third Monday of January through that Monday.
- **Motifs:** A cartoon dawn over a low hill and a single ribbon. No portrait.
- **Palette:**
  - `#1a2744` — dawn blue. `#fff6ea` on it is 13.8:1.
  - `#f2c14e` — dawn gold. On `#14110e`, 11.2:1. Illustration.
  - `#fff6ea` — light in the sky. On `#1a2744`, 13.8:1.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: hill, sun, ribbon. Not in this PR.

## Valentine's Day

- **Status:** Planned
- **Window:** February 1 through February 14, inclusive.
- **Motifs:** Cartoon hearts and a small paper card. No photo collage.
- **Palette:**
  - `#ff4d6d` — heart red. On `#14110e`, 5.9:1. Illustration. Cream `#fff6ea` on this red is 3.0:1, so do not put text on the heart.
  - `#ff8fa3` — blush. On `#14110e`, 8.7:1. Illustration.
  - `#fff6ea` — card face. On `#14110e`, 17.6:1.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: heart, card. Not in this PR.

## Presidents Day

- **Status:** Planned
- **Window:** The Saturday before the third Monday of February through that Monday. February 13–14 lose to Valentine's Day when both match.
- **Motifs:** A short run of cartoon bunting and a small top hat. No caricature of a person.
- **Palette:**
  - `#1d3557` — navy. `#fff6ea` on it is 11.6:1.
  - `#e23b3b` — bunting red. On `#14110e`, 4.4:1 (large graphic only). Cream on this red is 4.0:1, under AA for body text. Do not set text in it.
  - `#f4f7fb` — bunting white. On `#1d3557`, 7.8:1. Illustration.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: bunting, hat. Not in this PR.

## St. Patrick's Day

- **Status:** Planned
- **Window:** March 10 through March 17, inclusive. Wins over an early Palm Sunday on March 15–17.
- **Motifs:** A cartoon shamrock, a small pot, and a few coins.
- **Palette:**
  - `#3dbe6a` — shamrock. On `#14110e`, 7.9:1. Illustration.
  - `#146c43` — pot. `#fff6ea` on it is 6.0:1. The pot is a shape, not a text chip.
  - `#f2c14e` — coin. On `#14110e`, 11.2:1. Illustration.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: shamrock, pot, coin. Not in this PR.

## Easter

- **Status:** Planned
- **Window:** Palm Sunday through Easter Sunday, inclusive. Easter Sunday is the Anonymous Gregorian computus (`easterSunday` in `themes/holiday-themes.js`). Palm Sunday is seven days earlier. In 2026 that window is March 29 through April 5. March 10–17 stays St. Patrick's Day.
- **Motifs:** Cartoon decorated eggs and a small basket. No religious figure.
- **Palette:**
  - `#f7c1d9` — egg pink. On `#14110e`, 12.2:1. Illustration.
  - `#c9f2c7` — egg green. On `#14110e`, 15.2:1. Illustration.
  - `#ffe7a3` — egg yellow. On `#14110e`, 15.4:1. Illustration.
  - `#c47a3a` — basket. On `#14110e`, 5.6:1. Illustration. Cream on this brown is 3.2:1. Do not put text on the basket.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: egg, basket. Not in this PR.

## Mother's Day

- **Status:** Planned
- **Window:** The Saturday before the second Sunday of May through that Sunday.
- **Motifs:** A cartoon carnation and two leaves.
- **Palette:**
  - `#ff8fa3` — petal. On `#14110e`, 8.7:1. Illustration.
  - `#3dbe6a` — leaf. On `#14110e`, 7.9:1. Illustration.
  - `#fff6ea` — highlight. On `#14110e`, 17.6:1.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: carnation, leaf. Not in this PR.

## Memorial Day

- **Status:** Planned
- **Window:** The Saturday before the last Monday of May through that Monday.
- **Motifs:** A single cartoon poppy and a small flag ribbon. No battlefield.
- **Palette:**
  - `#e23b3b` — poppy. On `#14110e`, 4.4:1, fine as a large graphic. Cream `#fff6ea` on this red is 4.0:1, under AA for body text. Do not set text in it.
  - `#1d4e89` — ribbon blue. `#fff6ea` on it is 7.8:1.
  - `#fff6ea` — petal edge. On `#14110e`, 17.6:1.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: poppy, ribbon. Not in this PR.

## Juneteenth

- **Status:** Planned
- **Window:** June 19. Wins over the Father's Day weekend when June 19 is that Saturday or Sunday.
- **Motifs:** A cartoon bursting star and a small banner. No portrait.
- **Palette:**
  - `#c81d25` — banner red. `#fff6ea` on it is 5.4:1, which clears AA for normal text if a banner label is ever drawn in cream. Prefer leaving the banner wordless and keeping real UI text on `#14110e`.
  - `#f2c14e` — star gold. On `#14110e`, 11.2:1. Illustration.
  - `#fff6ea` — star glint. On `#c81d25`, 5.4:1.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: star, banner. Not in this PR.

## Father's Day

- **Status:** Planned
- **Window:** The Saturday before the third Sunday of June through that Sunday. June 19 stays Juneteenth.
- **Motifs:** A cartoon necktie and a small sun.
- **Palette:**
  - `#2a4d7a` — tie. `#fff6ea` on it is 8.0:1.
  - `#ffb020` — sun, the same amber the app already uses. On `#14110e`, 10.3:1. Illustration.
  - `#fff6ea` — shirt. On `#14110e`, 17.6:1.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: necktie, sun. Not in this PR.

## Independence Day

- **Status:** Planned
- **Window:** July 1 through July 4, inclusive.
- **Motifs:** Cartoon stars, a short bunting run, and a small sparkler.
- **Palette:**
  - `#e23b3b` — stripe red. On `#14110e`, 4.4:1 as a large graphic. Cream on this red is 4.0:1, under AA for body text. Do not set text in it.
  - `#1d4e89` — field blue. `#fff6ea` on it is 7.8:1.
  - `#f4f7fb` — star white. On `#1d4e89`, 7.8:1. Illustration.
  - `#ffe7a3` — spark. On `#14110e`, 15.4:1. Illustration.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: star, bunting, sparkler. Not in this PR.

## Labor Day

- **Status:** Planned
- **Window:** The Saturday before the first Monday of September through that Monday.
- **Motifs:** A cartoon picnic blanket corner and a sun.
- **Palette:**
  - `#2a4d7a` — denim. `#fff6ea` on it is 8.0:1.
  - `#ffb020` — sun. On `#14110e`, 10.3:1. Illustration.
  - `#f27a1a` — basket accent. On `#14110e`, 6.8:1. Illustration. Cream on this orange is 2.6:1. Do not put text on it.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: blanket, sun. Not in this PR.

## Halloween

- **Status:** Built
- **Window:** October 1 through October 31, local date, inclusive.
- **Motifs:** Cartoon jack-o'-lanterns, a crescent moon, bats, a ghost, and a crooked skyline with a bare tree. They sit in the header's empty middle and, on wide screens, in the side margins. The map, search row, and About control are left alone.
- **Palette:**
  - `#100c16` — margin night. No text sits here.
  - `#1c1428` — header top. `#fff6ea` on it is 16.6:1.
  - `#14110e` — header base and the app surface, unchanged. `#fff6ea` on it is 17.6:1.
  - `#ffe7a3` — moon. On `#100c16`, 15.9:1. Illustration.
  - `#f0c36a` — moon crater. On `#14110e`, 11.4:1. Illustration.
  - `#f27a1a` — pumpkin. On `#14110e`, 6.8:1. Illustration.
  - `#d85a0a` — pumpkin shade. On `#14110e`, 4.8:1. Illustration.
  - `#ff922e` — pumpkin highlight. On `#14110e`, 8.4:1. Illustration.
  - `#6fbf5a` — stem. On `#14110e`, 8.3:1. Illustration.
  - `#2a1408` — carved face. On `#f27a1a`, 6.3:1. The face reads; it is not text.
  - `#c4b4e6` — bat. On `#14110e`, 9.9:1. A light bat so it shows on the dark header.
  - `#f4f0ea` — ghost. On `#100c16`, 17.0:1. Illustration.
  - `#8b74b0` — skyline. On `#14110e`, 4.7:1. A silhouette that still separates from the night.
  - `#ffb020` — lit window. On `#14110e`, 10.3:1. Illustration.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1). The header wash does not replace those surfaces.
- **Assets:** All original inline SVG in `themes/holiday-themes.js`, positioned by `themes/halloween.css`.
  - Crescent moon
  - Bat (two poses, one drawing)
  - Ghost
  - Jack-o'-lantern
  - Crooked skyline, lit windows, bare tree
  - Star dots
  - No image files, fonts, or icon libraries

## Veterans Day

- **Status:** Planned
- **Window:** November 11.
- **Motifs:** A cartoon poppy on a dark field. No battlefield.
- **Palette:**
  - `#e23b3b` — poppy. On `#14110e`, 4.4:1 as a large graphic. Cream on this red is 4.0:1, under AA for body text. Do not set text in it.
  - `#1a2744` — field. `#fff6ea` on it is 13.8:1.
  - `#fff6ea` — petal edge. On `#14110e`, 17.6:1.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: poppy. Not in this PR.

## Thanksgiving

- **Status:** Planned
- **Window:** The Monday before the fourth Thursday of November through the Sunday after. Days that also fall in December belong to Christmas or New Year's, because those entries come first.
- **Motifs:** A cartoon turkey and a small pumpkin. No feast table across the map.
- **Palette:**
  - `#8a4b2f` — turkey brown. `#fff6ea` on it is 6.3:1. Use it for the bird, not for UI text.
  - `#e07a2f` — pumpkin. On `#14110e`, 6.3:1. Illustration. Cream on this orange is 2.8:1. Do not put text on it.
  - `#c23b4a` — wattle. `#fff6ea` on it is 4.9:1. Illustration.
  - `#f2c14e` — beak. On `#14110e`, 11.2:1. Illustration.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: turkey, pumpkin. Not in this PR.

## Christmas

- **Status:** Planned
- **Window:** December 1 through December 30, inclusive. December 31 is New Year's.
- **Motifs:** A cartoon Santa hat (not a full figure blocking the header), a reindeer head, and a snowman. A few snow dots. No external Santa clip art.
- **Palette:**
  - `#d7263d` — suit red. `#fff6ea` on it is 4.6:1, just over AA for normal text. Still do not recolor the app's text; keep cream text on `#14110e`.
  - `#1f7a4d` — pine. `#fff6ea` on it is 5.0:1. Use it for trees, not body text.
  - `#f2c14e` — bell gold. On `#14110e`, 11.2:1. Illustration.
  - `#fff6ea` — snow and trim. On `#d7263d`, 4.6:1. On `#14110e`, 17.6:1.
  - UI text stays `#fff6ea` on `#14110e` (17.6:1). About stays `#e2d2c0` on `#221c18` (11.4:1).
- **Assets:** Planned inline SVGs: Santa hat, reindeer, snowman, snow dots. Not in this PR.

## Implementation notes

### Selection

On load, `mount` reads `new Date()` once and, if present, the `theme` query on `location.search`. It calls `selectHolidayTheme`. A built winner adds `theme-<id>` to `<html>` and `<body>` and paints that holiday's SVG. Nothing is written to `localStorage`, `sessionStorage`, cookies, or IndexedDB. The choice is not sent anywhere. There is no analytics call.

`sw.js` does not precache HTML, CSS, or JS (icons only, and the page unregisters any worker). Theme files are ordinary same-origin requests, so this change does not add them to the icon cache.

### Fallback

The default theme is the page with no `theme-*` class and no holiday SVG.

- No holiday contains the date, or the one that does is still planned.
- `prefers-reduced-motion: reduce` is true at load. The decorations are skipped. `?theme=halloween` still shows them for QA, and the CSS turns animation off.
- `selectHolidayTheme` or the painter throws. The class is removed if it was added. The default theme remains.
- The query names a holiday that is not built, or names something unknown. It is ignored and the date is used.

Motion that does run (a bat drifting a few pixels, a pumpkin glow) is slow and small. `@media (prefers-reduced-motion: reduce)` sets `animation: none`. Decorations use `pointer-events: none` and `aria-hidden="true"`. They are not a filter on the map tiles or markers.

### Preview

Read-only query, never stored:

- `?theme=halloween` forces Halloween, including outside October and when reduced motion is on.
- `?theme=default` forces the default theme, including in October.
- Any other `theme` value is ignored.
- It combines with city search, for example `?q=bristol&theme=halloween`. The theme code does not read or change `q`.

### Adding a holiday

1. Add an entry to `HOLIDAYS` in `themes/holiday-themes.js`: `id`, `built: false`, and `contains(date)`. Place it where first-match should win overlaps. Mirror the window in this doc.
2. Draw original inline SVG in that file. No external images, fonts, CDNs, icon libraries, or network calls.
3. Add a painter and CSS scoped to `html.theme-<id>`. Keep art off the map, the wordmark, About, and the search controls. `pointer-events: none`. `aria-hidden="true"`.
4. Put every animation inside `@media (prefers-reduced-motion: reduce)` as `animation: none`.
5. Check contrast: `#fff6ea` on `#14110e` and control text on its own surface must stay at least 4.5:1. Do not tint map tiles.
6. Set `built: true`. Update this doc's status from Planned to Built.
7. Extend `tests/holiday-themes.test.js` for the window, any overlap, `?theme=<id>`, and `?theme=default`.
8. Load `?theme=<id>` at 1440px and at 390px, and once with reduced motion. Load a date inside the window with no query.
