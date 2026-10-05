# Hours parser (`opening_hours`)

`app.js` has a small, dependency-free parser for the subset of the OSM [`opening_hours`](https://wiki.openstreetmap.org/wiki/Key:opening_hours) syntax that local food places use. Anything it can't read returns `null`, and the card then says the hours aren't tagged rather than guessing.

| Function | Role |
| --- | --- |
| `ohParse(hours)` | Splits rules on `;` (and `,` before a day), caches per string (`ohCache`), and returns the rules or `null` |
| `ohParseSelectorAndTimes(rule)` | Reads the day selector (`OH_SELECTOR_RE`) and the time spans, `off` and `closed`, plus the `PH` public-holiday selector |
| `ohNthMatches(rule, date)` | nth-weekday selectors: `Sa[4]` (4th Saturday), `Su[-1]` (last Sunday), `Mo[1,3]` |
| `ohDaySpans(rules, date)` | Spans for one day. A later rule replaces earlier ones for the days it names, as in OSM; `additional` rules (after `,`) add to them |
| `ohIntervals` / `ohEval` | Absolute intervals around "now", including past-midnight spill-over, which gives open, closed or opens-soon |
| `isUsFederalHoliday` / `ohIsHoliday` | `PH` support for US federal holidays (no network) |

Supported: `24/7`, `Mo-Fr 09:00-17:00`, multiple spans, overnight spans (`18:00-02:00`), `off` and `closed`, `PH`, and `Xx[n]` / `Xx[-1]` / `Xx[n,m]`.

Not supported (returns `null`): months and dates, week numbers, `sunrise` and `sunset`, open-ended `+`, comments, and a bracket that isn't attached to a weekday.

## Chain hours (`tools/build-atp-hours.py`)

AllThePlaces rows are cleaned up offline with `normalize_oh`, which merges overlapping spans and folds a `24:00` close into the next day's `00:00-xx` piece. For example, `Mo-Su 00:00-02:00,09:00-23:00,09:00-24:00` becomes `Mo-Su 09:00-02:00`. Values it can't read pass through unchanged. Re-run with `--normalize-only` (no network). Tests are in `tests/test_build_atp_hours.py`.
