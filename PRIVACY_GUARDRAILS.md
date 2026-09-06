# RangeBites — Privacy Guardrails (web demo)

This demo is **privacy-first** and has **no RangeBites backend**. There is no server of ours that can be breached for user location profiles, deal-click histories, or accounts.

## What leaves the device (by design)

| Destination | What | Why |
|-------------|------|-----|
| Public **Overpass** APIs (`overpass-api.de`, `lz4.overpass-api.de`, `overpass.kumi.systems`) | Approximate lat/lng + search radius in the Overpass query | Load nearby OSM restaurants / cafés / fast food from the browser |
| **OpenStreetMap** tile CDN | Tile XYZ requests around the map viewport | Render the Leaflet map |
| **Amplitude** (only if `FOOD_RADAR_AMPLITUDE_API_KEY` is set) | Session product events (locate, radius, search, deals, nav) — **never** lat/long or location history | Soft-launch funnel; North Star `nav_handoff`. No key = memory queue only (nothing leaves). |

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
- **`localStorage`** may hold **UI prefs only** (one JSON key `rb_ui_prefs`): range, walk chip, dietary/filter chips, last city/zip **text**, onboard/hero flags. Never coordinates. Boot applies chips/input only — does not auto-run Overpass/Nominatim.
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

## Product analytics (Amplitude-ready, privacy-safe)

Optional instrumentation lives in `analytics.js` + `config.js`.

| Rule | Detail |
|------|--------|
| Session-scoped | Events queue in memory for the page session. **Never** written to `localStorage` / IndexedDB by RangeBites. |
| No location trails | **Never** send lat, lng, place names as location history, coords, addresses, or “near X” sequences. |
| Allowed props | `source`, `outcome`, `radius_mi`, `prior_radius_mi`, `result_count`, `deal_id` (OSM/demo entity id), `position`, `has_coupon`, `maps_app`, `has_account`, `screens_seen`. |
| Amplitude | Browser SDK 2.x loads from `cdn.amplitude.com` **only if** `window.FOOD_RADAR_AMPLITUDE_API_KEY` is a non-empty string. Init uses `identityStorage: "none"`, `autocapture: false`, in-memory `storageProvider`, and `trackingOptions.ipAddress: false`. |
| No key | Events stay in the in-memory queue (optional `FOOD_RADAR_ANALYTICS_DEBUG` logs **event names only**, never props). |
| Taxonomy | Data Analyst **snake_case** event names (`locate_me_requested`, …). Title Case duplicates are held until Analyst alignment. |

See `config.example.js` for the API key placeholder. CSP allows `cdn.amplitude.com` (script) and `api2.amplitude.com` (connect).



**No API key:** events stay in an in-memory session queue and never leave the browser.
