# Architecture

RangeBites is a static app. Everything runs in the browser, and the only server pieces are here.now's static hosting plus its same-origin proxy routes.

```
browser ──/api/nominatim──▶ here.now proxy ──▶ nominatim.openstreetmap.org   (city → lat/lng)
        ──/api/overpass───▶ here.now proxy ──▶ overpass.private.coffee       (mirror 1)
        ──/api/overpass-fr▶ here.now proxy ──▶ overpass.openstreetmap.fr     (mirror 2)
        ──tiles───────────▶ tile.openstreetmap.de
```

## Search flow (`app.js`)

1. `searchCityOrZip` takes a new search token (`state.searchGen`), clears the old city's cards and pins, and geocodes through `geocodePlace`, which wraps the network call in a 10-minute in-memory cache keyed by city text.
2. `runSearch(lat, lng)` makes **one** Overpass request through `fetchPlaces`:
   - Mirrors are tried **in series**, never in parallel, as the Overpass policy requires. Each has its own `AbortController` (11 s), all share a 25 s total cap, and a mirror is only tried if at least 4 s of that cap remain.
   - A 429 or 406 cools that mirror for 30 s, or for `Retry-After` up to 120 s.
   - A hang, 5xx, bad JSON or an Overpass timeout remark moves on to the next mirror. An empty answer from a healthy mirror counts as a real empty list.
   - Raw elements are cached in memory for 10 minutes, keyed by the rounded query area. Distances are recomputed from each search's own origin.
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
