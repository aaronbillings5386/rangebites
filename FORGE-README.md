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
- `ASSENT_MODE` in `config.js` is `"continue"`. The Continue sheet shows until `termsAccepted` equals `TERMS_VERSION`. Terms §1 says “by tapping Continue, or by using the site.” The home footer agree line stays. `?shot=1` does not store acceptance.
- `PUBLISH_DATE` in `config.js` is `2026-10-04` (October 4, 2026). `TERMS_VERSION` and the Terms-updated notice both use that one constant. The same date is plain text in Terms, Privacy, and the home “Terms updated” line, so it shows without JavaScript. Change the constant and those plain-text copies together if the publish date slips.
- `LEGACY_FOUND_BASE` in `metrics.js` is `2` for now. Set it to the real helped count at publish time. A new helped record has appeared since the earlier base.
- Contact is RangeBites (rangebites.com), `rangebites@agentmail.to`. Terms §12 states that. `security.txt` keeps `Contact: mailto:rangebites@agentmail.to`. No personal name is added.
- Late night means today’s tagged hours run past 9 pm or cross midnight. `filteredPlaces` calls `isLateNightHours(p.hours, placeNow(p.lng), p.lat, p.lng)`. The place object does not store `lateNight`.
- `data/atp-hours.json` rows are brand id, coordinates, opening hours, and spider name. The file has no URLs.
- Nominatim is submit-only. `schedulePlaceSuggest` is a no-op.
- `.github/workflows/checks.yml` runs `node --check`, JSON parse, `py_compile`, and `node tests/app.test.js`.

## Checks on this branch

`node --check` passes on the JS files. `node tests/app.test.js` passes 25 tests, including the US-box clock, screenshot bypass, terms version, continue-mode sheet, found-count retry key, geocoder-busy, place-alternate, CSP, aria-pressed, late-night, and street-line cases.

The Overpass proxy must send `Referer: https://rangebites.com` and `User-Agent: RangeBites/1.0 (+https://rangebites.com; rangebites@agentmail.to)`. Those values are in `tools/overpass-proxy.headers.json` and `overpassUpstreamHeaders()` in `app.js`. `herenow.patch` / `.herenow/proxy.json` must match. The browser fetch uses `referrerPolicy: "origin"` and cannot set User-Agent.

Publish `herenow.patch` (owner-only helped, found collection, drop the `/api/overpass-lz4` route) BEFORE the site files. At that publish step, set `LEGACY_FOUND_BASE` to the real helped count, and change `PUBLISH_DATE` plus the plain-text dates if October 4, 2026 is no longer the ship date.

## Still needs a real device

iOS Safari (Locate Me deny / allow / ignore, `inert` focus, `text-wrap`), an iPad around 820px, and a live Nominatim 429 through the here.now proxy. The tests use a saved Nominatim fixture, not a live call.
