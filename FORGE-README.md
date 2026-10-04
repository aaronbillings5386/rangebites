# RangeBites — forge notes for this review branch

This file describes what is on the review branch. The pull request is not merged. Build `20261003h` from this branch went live at 6:12 PM ET on October 3, 2026.

GitHub `main` (`188a0e7`) was behind live build `20261003b` when this branch started. Open PR #8 was not used as a base. This branch starts at `main`, then:

1. Sync the repo root to live `20261003b`. The tarball’s `food-radar-app/` tree is this site at the repo root. File lists already matched, so no README or LICENSE was removed.
2. Hours fix: today’s hours on cards, tagged open / closed / 24-hour verify labels, AllThePlaces CC0 hours in `data/atp-hours.json`, `tools/build-atp-hours.py`. Open/closed uses America/New_York or America/Chicago only inside the eastern and central US box. Elsewhere it uses the browser timezone when the search is near the device, and otherwise shows "Hours tagged · verify" with no open/closed state.
3. Legal wording, accessibility, and Gate fixes from the forge patch (44 files, including the Leaflet license and five image files).
4. Follow-up: remove the unused `place.lateNight` field, and drop the homepage URL from `data/atp-hours.json`.
5. Legal-review follow-up: 3-decimal rounding is described as rounding that still places you within about 100 m.

`.herenow/` is gitignored and is not in this pull request. There is no `THIRD_PARTY_NOTICES.md` in the patch. Attribution is in Terms §17, the map credit, and `vendor/leaflet/LICENSE`.

## What the code says

- Locate Me coordinates sent to Overpass are rounded to 3 decimal places, which still places you within about 100 m. That sentence is on the Privacy page (`privacy.html` and `privacy/index.html`, §5) and in the UI (`index.html`, `about.html`, `about/index.html`). It is not called approximate or anonymous. `roundCoord3` in `app.js` does the rounding. The query radius is padded by 120 m. Distances still use the full-precision origin on the device.
- `ASSENT_MODE` in `config.js` is `"continue"`. The Continue sheet shows until `termsAccepted` equals `TERMS_VERSION`. Terms §1 says “by tapping Continue, or by using the site.” The home footer agree line stays. `?shot=1` does not store acceptance.
- `PUBLISH_DATE` in `config.js` is `2026-10-03` (October 3, 2026). `TERMS_VERSION` and the Terms-updated notice both use that one constant. The same date is plain text in Terms, Privacy, and the home “Terms updated” line, so it shows without JavaScript. Asset cache queries and the service-worker cache name are `20261003h`.
- Two owner-confirmed closed places are hidden by OSM id only (`data/closed-places.json`, keyed under `places`): Lebanon VA Wendy's `way/580777677` (closed 2026-01-01; OSM still tags `opening_hours=07:00-22:00`) and Applebee's `way/312160515` (closed 2019-08-04). `isPermanentlyClosed()` still handles OSM lifecycle tags. A missing file hides nothing. The service worker does not cache `data/`.
- RangeBites does not store visitor information. Location is used only to show nearby places and is not saved. The client does not write `found`, `hits`, or `helped`. here.now stores a record per event, so the “Devices that found food” counter is gone. First load deletes leftover device ids, last-city and coordinate keys, and the old count cache. Saved restaurants, filter choices, distance units, and the terms flag stay on the device only. Filters includes Clear my saved data.
- Contact is RangeBites (rangebites.com), `rangebites@agentmail.to`. Terms §12 states that. `security.txt` keeps `Contact: mailto:rangebites@agentmail.to`. No personal name is added.
- Late night means today’s tagged hours run past 9 pm or cross midnight. `filteredPlaces` calls `isLateNightHours(p.hours, placeNow(p.lng), p.lat, p.lng)`. The place object does not store `lateNight`.
- `data/atp-hours.json` rows are brand id, coordinates, opening hours, and spider name. The file has no URLs.
- Nominatim is submit-only. `schedulePlaceSuggest` is a no-op.
- `.github/workflows/checks.yml` runs `node --check`, JSON parse, `py_compile`, and `node tests/app.test.js`.

## Checks on this branch

`node --check` passes on the JS files. `node tests/app.test.js` passes the suite, including the US-box clock, screenshot bypass, terms version, continue-mode sheet, device-id storage grep, legacy device-id cleanup, the no-tracker scan, the no-storage scan, geocoder-busy, place-alternate, CSP, aria-pressed, late-night, and street-line cases.

The Overpass proxy must send `Referer: https://rangebites.com` and `User-Agent: RangeBites/1.0 (+https://rangebites.com; rangebites@agentmail.to)`. Those values are in `tools/overpass-proxy.headers.json` and `overpassUpstreamHeaders()` in `app.js`. `herenow.patch` / `.herenow/proxy.json` must match. The browser fetch uses `referrerPolicy: "origin"` and cannot set User-Agent.

Build `20261003h` from this branch went live at 6:12 PM ET on October 3, 2026. `herenow.patch` stays outside the repo and was published with `hits` and `found` locked owner-only. The host’s own access logs, and the `specials_inbox` business form, are outside this client change.

## Still needs a real device

iOS Safari (Locate Me deny / allow / ignore, `inert` focus, `text-wrap`), an iPad around 820px, and a live Nominatim 429 through the here.now proxy. The tests use a saved Nominatim fixture, not a live call.
