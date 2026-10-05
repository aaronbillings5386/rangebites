# Architecture

RangeBites is a static app. Everything runs in the browser, and the only server pieces are here.now's static hosting plus its same-origin proxy routes.

```
browser ──/api/nominatim──▶ here.now proxy ──▶ nominatim.openstreetmap.org   (city → lat/lng)
        ──/api/overpass───▶ here.now proxy ──▶ overpass.private.coffee       (Private.coffee, the only Overpass server)
        ──tiles───────────▶ tile.openstreetmap.de
```

## Search flow (`app.js`)

1. `searchCityOrZip` takes a new search token (`state.searchGen`), clears the old city's cards and pins, and geocodes through `geocodePlace`, which wraps the network call in a 10-minute in-memory cache keyed by city text.
2. `runSearch(lat, lng)` makes **one** Overpass request through `fetchPlaces`:
   - There is one Overpass server, Private.coffee. (The French instance went whitelist-only in Apr 2026, and another public instance excludes AI fast-deploy hosts, so neither is used.) Requests are never parallel. Each attempt has its own `AbortController` (11 s) inside a 25 s total cap.
   - A hang (timeout), 5xx or an Overpass timeout remark gets **one** retry on the same server, only if at least 8 s of the cap remain. Worst case: 11 s + 11 s, so the error shows by 22 s.
   - A 429 or 406 shows "The OpenStreetMap server is busy right now" at once and cools the server for 30 s, or for `Retry-After` up to 120 s. Other 4xx and bad JSON show the error without a retry. An empty answer counts as a real empty list.
   - Raw elements are cached in memory for about 10 minutes, for typed-city searches only (Locate Me is never cached), keyed by the rounded city point. Both caches are swept on every read and write and every 60 s, emptied on Clear location, and a search that started before Clear location never writes to them (cache generation). Distances are recomputed from each search's own origin.
   - A failsafe ends the loading state at cap + 2 s, so the user sees "OpenStreetMap didn't answer in time" within about 27 s at worst.
3. `normalizeElements` merges node and way duplicates (`mergeDuplicateElements`, which keeps `mergedIds`), maps tags, and computes distance and hours.
4. `loadClosedPlaces` and `isCuratedClosed` hide curated closures by either id. AllThePlaces chain hours fill in when OSM has none.
5. Late answers from an older search fail `stillActiveSearch(gen, lat, lng)` and are dropped.

## Storage

See the README privacy rule. `localStorage` holds `rb_ui_prefs`, `rb_saved` (id, name and address only) and notice flags. `legacy-cleanup.js` only deletes legacy device IDs and location keys.

## Accessibility notes

- Map pins get names through `markerOptions(name)`; Leaflet copies `title` and `alt`.
- Horizontal rails get `role=list` only while they hold items (`setListRole`). Items are wrapped in `<div class="rb-li" role="listitem">` with `display: contents`, so layout doesn't change.
- Sheets are `div role=dialog`, and the app body is `<main id="main">`.
