# RangeBites — forge notes for this review branch

This file describes what is on the review branch, not a publish. Nothing here is merged or deployed. Publishing is a separate step (here.now via `ship_rangebites_once.py`) and needs owner approval.

GitHub `main` (`188a0e7`) is behind live build `20261003b`. Open PR #8 was not used as a base. This branch starts at `main`, then:

1. Sync the repo root to live `20261003b`. The tarball’s `food-radar-app/` tree is this site at the repo root. File lists already matched, so no README or LICENSE was removed.
2. Hours fix: today’s hours on cards, tagged open / closed / 24-hour verify labels, AllThePlaces CC0 hours in `data/atp-hours.json`, `tools/build-atp-hours.py`. Open/closed uses America/New_York or America/Chicago only inside the eastern and central US box. Elsewhere it uses the browser timezone when the search is near the device, and otherwise shows "Hours tagged · verify" with no open/closed state.
3. Legal wording, accessibility, and Gate fixes from the forge patch (44 files, including the Leaflet license and five image files).
4. Follow-up: remove the unused `place.lateNight` field, and drop the homepage URL from `data/atp-hours.json`.
5. Legal-review follow-up: 3-decimal rounding is described as rounding that still places you within about 100 m.

`.herenow/` is gitignored and is not in this pull request. There is no `THIRD_PARTY_NOTICES.md` in the patch. Attribution is in Terms §17, the map credit, and `vendor/leaflet/LICENSE`.

## What the code says

- Locate Me coordinates sent to Overpass are rounded to 3 decimal places, which still places you within about 100 m. That sentence is on the Privacy page (`privacy.html` and `privacy/index.html`, §5) and in the UI (`index.html`, `about.html`, `about/index.html`). It is not called approximate or anonymous. `roundCoord3` in `app.js` does the rounding. The query radius is padded by 120 m. Distances still use the full-precision origin on the device.
- `ASSENT_MODE` in `config.js` is `"current"`. The Continue screen stays hidden. Terms §1 still says “by tapping Continue on first use.” `TERMS_VERSION` is `2026-10-03`. In `continue` mode, acceptance is that string; an older string or a bare true does not count. `?shot=1` does not store acceptance.
- `LEGACY_FOUND_BASE` in `metrics.js` is `2`. Set it to the real old `helped` count before publish.
- Terms and Privacy say Effective October 3, 2026, the same day as the Terms-updated notice. If the ship date is later, change that line together with `TERMS_VERSION` and the notice before publish.
- Contact on the public pages is `rangebites@agentmail.to`. Confirm that address before publish.
- The operator legal-name / “doing business as” line is not in the Terms. Current §12 is the privacy clause.
- Late night means today’s tagged hours run past 9 pm or cross midnight. `filteredPlaces` calls `isLateNightHours(p.hours, placeNow(p.lng), p.lat, p.lng)`. The place object does not store `lateNight`.
- `data/atp-hours.json` rows are brand id, coordinates, opening hours, and spider name. The file has no URLs.
- Nominatim is submit-only. `schedulePlaceSuggest` is a no-op.
- `.github/workflows/checks.yml` runs `node --check`, JSON parse, `py_compile`, and `node tests/app.test.js`.

## Checks on this branch

`node --check` passes on the JS files. `node tests/app.test.js` passes 24 tests, including the US-box clock, screenshot bypass, terms version, found-count retry key, geocoder-busy, place-alternate, CSP, aria-pressed, late-night, and street-line cases.

The Overpass proxy must send `Referer: https://rangebites.com` and `User-Agent: RangeBites/1.0 (+https://rangebites.com; rangebites@agentmail.to)`. Those values are in `tools/overpass-proxy.headers.json` and `overpassUpstreamHeaders()` in `app.js`. `herenow.patch` / `.herenow/proxy.json` must match. The browser fetch uses `referrerPolicy: "origin"` and cannot set User-Agent.

## Still needs a real device

iOS Safari (Locate Me deny / allow / ignore, `inert` focus, `text-wrap`), an iPad around 820px, and a live Nominatim 429 through the here.now proxy. The tests use a saved Nominatim fixture, not a live call.
