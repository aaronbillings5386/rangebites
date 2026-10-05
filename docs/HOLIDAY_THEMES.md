# Holiday themes

RangeBites paints one cartoony theme from the device's local date when the page loads. The layout, type, map, and controls stay as they are. A theme is only decoration.

Every theme in this set is built. Mother's Day, Father's Day, and Juneteenth are not themed. `themes/us-holidays.js` still knows those dates, because that file is the shared civil-calendar helper, and the registry does not list them.

## How a date picks a theme

`themes/us-holidays.js` computes the floating holidays. Months in that file are 1–12. Weekday 0 is Sunday. Easter is the Anonymous Gregorian computus. Weekdays use `Date.UTC`, so the result does not depend on the device timezone. The registry then compares those calendar days to the device's local `getFullYear` / `getMonth` / `getDate`.

`themes/holiday-themes.js` holds `HOLIDAYS`. Each entry has an id, `built: true`, and a `contains(date)` window. The first entry whose window contains the date wins. A date that matches nothing stays on the default theme.

`?theme=<id>` previews a built theme on that load only. `?theme=default` forces the default theme. An unknown id is ignored. The choice is not written to storage.

Reduced motion does not change which theme is chosen. The art stays. CSS sets `animation: none` on snow, fireworks, confetti, bats, and the pumpkin glow.

If applying a theme throws, the page drops the theme class and stays on the default theme.

## Windows

Weekend holidays run from the Saturday before the Monday through that Monday. Thanksgiving is the 14 days before Thanksgiving Day through Thanksgiving Day, and not the Friday or Sunday after. Christmas is December 1–26. New Year's picks up on December 27 so December does not fall back to the default theme for four days, and it includes January 1. Veterans Day, Independence Day, and Christmas use the calendar date, not the federal observed Friday or Monday.

| Theme | Window | 2026 | 2027 |
| --- | --- | --- | --- |
| New Year's | Dec 27–Jan 1 | Dec 27–Jan 1 | Dec 27–Jan 1 |
| MLK Day | Sat–third Monday of January | Jan 17–19 | Jan 16–18 |
| Valentine's Day | Feb 1–14 | Feb 1–14 | Feb 1–14 |
| Presidents' Day | Sat–third Monday of February | Feb 14–16 | Feb 13–15 |
| St. Patrick's Day | Mar 10–17 | Mar 10–17 | Mar 10–17 |
| Easter | Easter Sunday and the 7 days before | Mar 29–Apr 5 | Mar 21–28 |
| Memorial Day | Sat–last Monday of May | May 23–25 | May 29–31 |
| Fourth of July | Jul 1–4 | Jul 1–4 | Jul 1–4 |
| Labor Day | Sat–first Monday of September | Sep 5–7 | Sep 4–6 |
| Halloween | all of October | Oct 1–31 | Oct 1–31 |
| Veterans Day | Nov 11 | Nov 11 | Nov 11 |
| Thanksgiving | 14 days before through Thanksgiving Day | Nov 12–26 | Nov 11–25 |
| Christmas | Dec 1–26 | Dec 1–26 | Dec 1–26 |

## Overlap

Registry order, first match wins:

1. New Year's
2. Halloween
3. Christmas
4. Veterans Day
5. Thanksgiving
6. Fourth of July
7. St. Patrick's Day
8. Easter
9. Valentine's Day
10. Presidents' Day
11. Memorial Day
12. Labor Day
13. MLK Day

Settled overlaps:

- December 27–31 and January 1 are New Year's. Christmas stops on December 26, so those days are not also Christmas.
- All of October is Halloween, including the second Monday. That Monday does not get its own theme.
- November 11 is Veterans Day even when it sits inside the Thanksgiving lead-in. In 2027 Thanksgiving is November 25, so November 11 matches both, and Veterans Day wins. November 12 is Thanksgiving.
- February 13–14 can sit in both Valentine's Day and the Presidents' Day weekend (2026 shares February 14). Valentine's Day wins those days.
- Palm Sunday can fall on March 15–17 when Easter is March 22–24. Those days stay St. Patrick's Day. Easter then runs through Easter Sunday.
- A plain date, such as June 15, matches nothing and stays on the default theme.

## Art

Original flat SVG, inline, in `themes/holiday-themes.js`. No portraits and no likeness of a person. Each theme uses the same two slots Halloween uses: a header cluster anchored clear of the wordmark and About, and a faint scene along the bottom of an empty results list. The list reserves bottom padding equal to the scene height, so the art stays under the last line, including "Search another city." Once a place card is on screen the scene is hidden. Phone width (under 768px) keeps a short strip and two or three pieces. Pointer events are off. The map, including Leaflet tiles, is not restyled.

`themes/holiday.css` holds the shared layout plus each theme's header wash. It is one file, linked from the page head, so the wash is present on first paint. Only the active theme's SVG is inserted. The stylesheet is about 12KB for every theme together. Each theme's SVG is about 2KB.

Snow, fireworks, and confetti animate. `prefers-reduced-motion: reduce` stops those animations and leaves the shapes in place.

## New Year's

- **Status:** Built
- **Motifs:** A clock near midnight, firework bursts, and confetti.
- **Palette:** Night `#0e1428`. `#fff6ea` on it is 17.07:1. Gold `#f2c14e` (11.21:1 on `#14110e`), confetti blue `#7eb6ff` (8.98:1), confetti pink `#ff7aa2` (7.67:1). Illustration only.
- **Preview:** `?theme=new-year`

## Martin Luther King Jr. Day

- **Status:** Built
- **Motifs:** A low sunrise and a dove, drawn as simple shapes. No portrait, no slogan, no cartoon face.
- **Palette:** Dawn blue `#1a2744`. `#fff6ea` on it is 13.84:1. Gold `#f2c14e`. Dove `#f4f0ea` (16.57:1 on `#14110e`).
- **Preview:** `?theme=mlk`

## Valentine's Day

- **Status:** Built
- **Motifs:** Hearts.
- **Palette:** Wash `#1c1016`. `#fff6ea` on it is 17.29:1. Hearts `#ff7aa2` and `#ff8fa3` (8.70:1 on `#14110e`). Cream `#fff6ea` on the pink heart is about 2.3:1, so the heart is never a text chip.
- **Preview:** `?theme=valentines`

## Presidents' Day

- **Status:** Built
- **Motifs:** Stars and stripes: a small flag and a run of bunting. No likeness and no hat.
- **Palette:** Navy wash `#0e1a33`. `#fff6ea` on it is 16.16:1. Stripe red `#c0392b` is a large graphic. Flag white `#f4f7fb`. Canton `#1d3557`. Star gold `#f2c14e`.
- **Preview:** `?theme=presidents`

## St. Patrick's Day

- **Status:** Built
- **Motifs:** Shamrocks, a rainbow, and a pot of gold.
- **Palette:** Wash `#0c1a12`. `#fff6ea` on it is 16.74:1. Shamrock `#3dbe6a` (7.86:1 on `#14110e`). Pot `#146c43`. Coins `#f2c14e`.
- **Preview:** `?theme=st-patricks`

## Easter

- **Status:** Built
- **Motifs:** Striped eggs, a bunny, and spring flowers.
- **Palette:** Wash `#1a1420`. `#fff6ea` on it is 16.85:1. Egg `#fff6ea`, bands `#ff8fa3` and `#7eb6ff`, flower `#ff8fa3`, bunny `#f4f0ea`.
- **Preview:** `?theme=easter`

## Memorial Day

- **Status:** Built
- **Motifs:** A flag and poppies. The pieces do not bounce.
- **Palette:** Field `#1a2744`. `#fff6ea` on it is 13.84:1. Poppy `#c0392b`. Stem `#3dbe6a`.
- **Preview:** `?theme=memorial`

## Fourth of July

- **Status:** Built
- **Motifs:** Fireworks, flags, and stars.
- **Palette:** Night `#0e1428`. `#fff6ea` on it is 17.07:1. Bursts `#f2c14e`, `#7eb6ff`, and `#ff7aa2`. Same flag colors as Presidents' Day.
- **Preview:** `?theme=independence`

## Labor Day

- **Status:** Built
- **Motifs:** A picnic basket on a checked cloth, and a hammer with a wrench. No faces.
- **Palette:** Wash `#141c28`. `#fff6ea` on it is 16.00:1. Basket `#c47a3a` (5.55:1 on `#14110e`, illustration). Cloth `#c0392b` and `#f4f7fb`. Tool steel `#c0c6ce`.
- **Preview:** `?theme=labor`

## Halloween

- **Status:** Built
- **Motifs:** Pumpkins, a crescent moon, bats, a ghost, and a crooked skyline. Same shapes as the October theme this set grew from.
- **Palette:** Header top `#1c1428`. `#fff6ea` on it is 16.63:1. Pumpkin `#f27a1a` (6.79:1 on `#14110e`). Face `#2a1408`. Moon `#ffe7a3` (15.42:1). Bat `#c4b4e6` (9.87:1). Ghost `#f4f0ea` (16.57:1). Skyline `#8b74b0` is a large silhouette (4.68:1), not text.
- **Preview:** `?theme=halloween`

## Veterans Day

- **Status:** Built
- **Motifs:** A flag and one gold star. The pieces do not bounce.
- **Palette:** Field `#1a2744`. `#fff6ea` on it is 13.84:1. Star `#f2c14e`.
- **Preview:** `?theme=veterans`

## Thanksgiving

- **Status:** Built
- **Motifs:** A cartoon turkey, autumn leaves, and a pie.
- **Palette:** Wash `#24160f`. `#fff6ea` on it is 16.40:1. Tail `#c4522a` and `#e07a2f` (6.27:1 on `#14110e`). Pie `#f2c14e`. Leaf vein `#f2c14e`.
- **Preview:** `?theme=thanksgiving`

## Christmas

- **Status:** Built
- **Motifs:** A generic cartoon Santa, a reindeer, a snowman, and falling snow. No character from a film or a book.
- **Palette:** Wash `#141c22`. `#fff6ea` on it is 16.10:1. Suit `#d7263d` (illustration; cream on this red is 4.63:1, so it is not a text chip). Snow `#f4f7fb`. Reindeer `#c47a3a`.
- **Preview:** `?theme=christmas`

## Text and controls

Themes do not recolor UI text. These pairs stay on every theme:

| Pair | Contrast |
| --- | --- |
| Title `#fff6ea` on page `#14110e` | 17.58:1 |
| Title `#fff6ea` on the darkest header wash in this set, `#1a2744` | 13.84:1 |
| Empty-state `#b7a08c` on `#14110e` | 7.54:1 |
| About `#e2d2c0` on `#221c18` | 11.40:1 |
| Card text `#fff6ea` on `#221c18` | 15.73:1 |

Header washes are dark on purpose. Saturated color lives in the SVG, not behind the wordmark.

## Checklist for a new holiday

1. Add the civil date in `themes/us-holidays.js` if it is not already there.
2. Add an entry to `HOLIDAYS` where first-match should win. Set `built: true` only when the art ships.
3. Add a painter that fills the header cluster and the empty-list scene with original inline SVG. `aria-hidden="true"` and `focusable="false"` on every decorative SVG. No `xmlns` URL.
4. Add a header wash in `themes/holiday.css`. Keep `#fff6ea` at least 4.5:1 on that wash. Point `--holiday-ground` at a dark strip.
5. Put motion on `.is-float`, `.is-burst`, or `.is-snow` so the reduced-motion rule already stops it.
6. Do not style the map, Leaflet tiles, search, or the privacy and terms copy.
7. Extend `tests/holiday-themes.test.js` for the window, any overlap, and `?theme=<id>`.
8. Leave `?v=` query values as they are. Forge bumps them when it ships.
