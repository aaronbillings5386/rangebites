# RangeBites — Privacy Guardrails (web demo)

This demo is **privacy-first** and has **no RangeBites backend**. There is no server of ours that can be breached for user location profiles, deal-click histories, or accounts.

## What leaves the device (by design)

| Destination | What | Why |
|-------------|------|-----|
| Public **Overpass** API via the same-origin proxy (`overpass.openstreetmap.fr`, run by OpenStreetMap France, the only Overpass server) | Lat/lng rounded to 3 decimals + search radius in the Overpass query | Load nearby OSM restaurants / cafés / fast food |
| **OpenStreetMap** tile CDN | Tile XYZ requests around the map viewport | Render the Leaflet map |
| Place search through our host | Rounded coordinates for the current search only | Show nearby places. Not stored as a visitor log. |

Those third parties operate under their own policies. RangeBites does not proxy or log those requests.

Outbound **Apple Maps / Google Maps / merchant website** links open in a new tab with `rel="noopener noreferrer"` and a document-level `referrer` policy of `no-referrer`.

## What never leaves / never persists (RangeBites)

- **No RangeBites backend** — we do not receive, store, or sell coordinates.
- **No accounts** required to browse.
- **Never written** to `localStorage`, `IndexedDB`, or cookies:
  - lat / lng
  - place lists or location history
  - deal clicks / views
  - user identity
- **`localStorage`** may hold **UI prefs only** (one JSON key `rb_ui_prefs`): range, walk chip, dietary/filter chips, units, onboard/hero flags. Never coordinates, last city, or search history. Hearts live in `rb_saved` (id, name, address) on this device only. Boot applies chips only — does not auto-run Overpass/Nominatim. Filters includes Clear my saved data.
- **In-memory wipe** on `pagehide` and `beforeunload` only (real leave/close): clears `state.lat` / `state.lng` / `state.places` and map markers. **Not** on `visibilitychange`. Clear now wipes GPS + places only; UI prefs stay.
- **No production-ish `console.log` of coordinates** or full place payloads (warnings use error names / codes only).
- **Sponsored** badges (max 1–2) are deterministic demo honesty labels — not tracking, not a claim that we store or sell data.

## Content-Security-Policy

`index.html` includes a meta CSP allowing `'self'`, Leaflet on `unpkg.com`, Overpass connect hosts, and OpenStreetMap tile image hosts. A real deploy should prefer **HTTP response header** CSP (stricter, report-uri optional) and review CDN allowlists.

## Honest product copy

- Deals are **illustrative / partner-ready**, not live Honey scrapes.
- CTA is **Open deal**, never “Save with us”.
- About sheet states: location for search then gone; no profile/history on our side.

See also `ABOUT_AND_DISCLOSURES.md` (draft — not legal advice).

## Overpass race / fallback samples

Locate Me starts Overpass immediately. If no successful response within **~4 seconds**, the UI shows sample places (`DEMO_FALLBACK_PLACES` in `app.js`) so Nearby is never empty. If Overpass later succeeds and the page/search is still active, samples are replaced with live OSM results.

For the Bluefield demo center, sample coords stay absolute. For a real Locate Me center elsewhere, samples are **offset relative to that center** so the ring appears near the user (still static fixtures — not device history). **Try demo map** runs the Bluefield demo without waiting on GPS.

Those names/coords are static fixtures — not scraped from device history and **never written** to storage. Radius chips and filters apply to both live and fallback lists; deals / Sponsored (max 2) still come from `deals.js`.

## Analytics

RangeBites is a free site that tracks nobody. Do not add device codes, analytics identifiers, visitor logs, or third-party trackers. `analytics.js` makes no network call. Location from a city search or Locate Me stays in memory for that search only.
