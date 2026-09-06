# RangeBites

Privacy-first restaurant radar (mobile-first web demo): nearby food from OpenStreetMap, distance, illustrative deals, Reviews on Maps, and business contact when tagged.

**Find food near you. See the deal. No account required.**

**Quiet Precision:** slate / graphite UI; **amber only for deals**.

## Product bar (locked)

Anywhere you open it:

| # | Bar | MVP / P0 approach |
|---|-----|-------------------|
| 1 | Current position | Locate Me; demo / Try demo map if denied or chosen |
| 2 | Local eats | Live OSM via Overpass for any lat/lng |
| 3 | Coupons / deals | Illustrative / partner-ready, clearly labeled — **not** live Honey scrapes; real partners later |
| 4 | Reviews | **Maps handoff** (Apple Maps + Google Maps). Optional real OSM rating tag only. **No fake stars.** |
| 5 | Distance | Haversine + walk chips on cards / rail / sheet |
| 6 | Business contact | Call / Website / Hours on cards + deal sheet when OSM has them; hide when missing |

**Privacy:** no stored location history, no profile, no account required for core.

**P0 today (from Product):** contact + hours on cards/sheet; Reviews → Maps handoff; no invented ratings. Full gap/ship list: **[PRODUCT_BAR_TODAY.md](./PRODUCT_BAR_TODAY.md)**. Brief: **[PRODUCT.md](./PRODUCT.md)**.

## What’s included

| File | Role |
|------|------|
| `index.html` | App shell, onboarding, About + Deal sheets, CSP + referrer meta |
| `styles.css` | Quiet Precision: graphite/slate UI; amber only for deals |
| `app.js` | Geolocation, Overpass, Leaflet, filters, locate-glow, privacy wipe |
| `deals.js` | Sample / partner-ready deal matching + Sponsored flags (not live Honey) |
| `analytics.js` | Optional Amplitude eventing (key gated; in-memory queue without key) |
| `PRODUCT.md` | Product brief + locked bar |
| `PRODUCT_BAR_TODAY.md` | Bar status vs code + today’s P0 ship list |
| `PRIVACY_GUARDRAILS.md` | What leaves the device vs what never persists |
| `ABOUT_AND_DISCLOSURES.md` | Full disclosure draft |
| `OVERNIGHT.md` | Overnight changelog |
| `AARON_AMPLITUDE.md` | Amplitude setup notes |

## How to run

### Option A — local static server (recommended)

```bash
cd /workspace/food-radar-app
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765/

Allow location when asked. If denied, **Demo mode** loads Bluefield WV / VA (~37.27, −81.22).

### Option B — open the file

`file://` often blocks geolocation and some CDN/map requests. Prefer Option A.

### Phone tips

1. Serve over HTTP on your LAN.
2. iPhone Safari: Locate Me → Allow While Using.
3. Add to Home Screen for a fuller-screen feel.
4. HTTPS is required for geolocation on many phones when not localhost.

## Privacy (short)

- No accounts. No RangeBites backend.
- Location is **when-in-use** for the current search only (browser → public Overpass + **OpenStreetMap tiles**, not CARTO).
- No `localStorage` of location, places, or deal clicks. `sessionStorage` = UI flags only.
- Leaving or closing the page clears in-memory location and results (web wipe — not iOS delete-app). Brief backgrounding (app switch, Maps, location prompt) does **not** wipe — so Locate Me results stay when you come back.
- Details: **[PRIVACY_GUARDRAILS.md](./PRIVACY_GUARDRAILS.md)**

## Deals, contact & reviews (Lawyer-safe)

- **Deals:** illustrative / partner-ready badges and rail copy. Sample offers, not a promise. Confirm with the restaurant. CTA: **Open deal**. Sponsored pins are labeled.
- **Contact / hours (P0):** Call (`tel:`), Website, Hours on place cards and the deal sheet when OSM tags exist; omit quietly when they don’t. Overpass should request `phone`, `contact:phone`, `website`, `contact:website`, `opening_hours`.
- **Reviews (P0):** **Reviews** CTA → Apple Maps + Google Maps place handoff (`noopener` / `no-referrer`). Copy: “Reviews on Maps — we don’t store ratings.” If OSM has a real `stars` / rating tag (rare), show it with source “OpenStreetMap”. **Never invent stars or demo “4.5★” as if live.**

## Deploy note (CSP)

This demo ships a **meta** Content-Security-Policy that allows Leaflet (unpkg), Overpass, and OpenStreetMap tiles. For a real deploy, set CSP via **HTTP headers**, tighten script sources (drop `'unsafe-inline'` once scripts are non-inline), and add reporting.

## Overpass race + demo fallback

Locate Me **never** ends on an empty list:

1. Overpass starts immediately (mirrors: `overpass-api.de` first, then `lz4.overpass-api.de`, then `overpass.kumi.systems`).
2. If no successful Overpass response within **~4 seconds**, the UI shows **DEMO_FALLBACK_PLACES**. Deals / Sponsored via `deals.js`. **Try demo map** skips GPS entirely.
3. If Overpass later succeeds and the search is still active, the list upgrades to live OSM results.
4. Geo denied → Bluefield center + demo/privacy banners + the same race/fallback.

Status line: “Searching…” → “Showing samples while map data loads” → “N places from OpenStreetMap” when live.

## Limits

- Overpass is a public API: timeouts / rate limits happen; the race/fallback keeps the demo usable.
- Results capped (~40), sorted deals-first then by Haversine miles.
- “Open-ish” is a rough OSM `opening_hours` heuristic.
- OSM coverage varies; contact appears only when tags exist; reviews live on Maps, not as invented in-app stars.
- Needs network for Overpass + tiles (fallback works offline for the place list only; map tiles still need network).
- Deal badges are **not** live coupon inventory.

## Stack

Vanilla HTML/CSS/JS + Leaflet (CDN). No build step. Do not require a GitHub repo to run.

## Overnight polish

See **[OVERNIGHT.md](./OVERNIGHT.md)** for the changelog. Highlights: deals-first sort + amber deal-count pill; locate glow; place cards; skeleton→results; copy + About aligned with PRIVACY_GUARDRAILS.

## Launch waitlist (local only)

Email-only notify form, also linked from About. No name, phone, ZIP, location, city picker, testimonials, or counts. Support address pending — do not invent one.

```bash
python3 waitlist_server.py
# http://127.0.0.1:8765/waitlist.html
```

Signups append to `waitlist.json` on this machine. **No deploy.**
