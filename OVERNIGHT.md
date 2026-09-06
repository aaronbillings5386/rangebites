# Overnight wrap — 2026-08-22 (local only, no push)

Quiet Precision + Reviewer claim-safety + Researcher session UX + ASO Lawyer-safe captions + Analytics snake_case lock (Data Analyst).

## Changelog

### Reviewer claim-safety
- Tagline + meta: **Find food near you. See the deal. No account required.**
- Privacy banner: *Used for this search. Sent only to map/places providers (Overpass + tiles), not a RangeBites backend. No location history stored by us. Leave/close clears memory.*
- About intro aligned; keep “we don’t sell,” no RangeBites backend, third-party discloses. Avoid absolute never-track / never-collect wording.

### Product amber discipline
- `.filter-toggle.active` = slate/graphite (`background-image: none`, distance-colored text) — **not** amber gold.
- Amber only: deal pins, badges, deal rail, Open deal CTAs, deal-count.

### Researcher (vanilla JS, session-only)
1. **Trust strip** + **Clear now** — force-wipe map/list/memory; stays on page.
2. **Walk-time chips** 5/10/15 min → miles at **~3 mph** (0.25 / 0.50 / 0.75 mi); sets radius; no routing API.
3. **Dietary chips** veg / coffee / pizza / skip surprise — cuisine/name token filter; session state only.
4. **Deal-first amber rail** above list → opens existing deal sheet.
5. **What leaves your phone** under Locate — Overpass + tiles only; no RangeBites backend.

### ASO / Marketing Lawyer-safe (folded in)
- Locate/hero: **Food near you. Set the range.** (+ 25 mi radius chip)
- Deals: **See the deal. Then go.** (sample / not a promise)
- Sponsored: **Sponsored pins are labeled. Always.**
- Navigate/deal sheet: **We may earn a commission when you tap through. You keep the deal.**
- Privacy: location powers search then gone; no profile; no account for core.

### Analytics (snake_case only — no Title Case; no lat/long)
`config.js` + `analytics.js` wired from `index.html`:
- `app_opened` `{ has_account: false }` on boot
- `onboarding_completed` `{ screens_seen: N }`
- `account_created` — no-op stub
- `locate_me_requested` / `locate_me_result`
- `radius_changed` (`radius_mi`, `prior_radius_mi`)
- `search_completed` (`radius_mi`, `result_count`)
- `deal_impression`
- `deal_tapped` (Deal Viewed → `deal_tapped`; `has_coupon` bool)
- `nav_handoff` (Deal Navigated → `nav_handoff`; `deal_id`, `maps_app`, `radius_mi`)

### Kept intact
- Locate Me: no visibilitychange wipe; Try demo map; Locating states; secure-context banner; 4s Overpass race + fallback; wipe pagehide/beforeunload only
- `sortDealsFirst`
- Privacy guardrails docs

## 3-tap verify (confirmed)
**Try demo map** → amber deal (rail/card) → sheet → **Apple/Google Maps**. Clear now wipes session and stays on page.

## Artifacts
- `OVERNIGHT.md` (this file)
- `shot/overnight.png` — after Try demo map; deals + trust strip + walk/diet chips + amber rail
- Server: `http://127.0.0.1:8765/` (local only; no push)
- QA helper: `?shot=1` auto-runs demo (skips onboard)

## Local only
No git push.

---

## Morning pass — 2026-08-23 (local only, no push)

Privacy-safe Amplitude **eventing finish/verify**:

- Confirmed locked snake_case call sites in `app.js` + helpers in `analytics.js`.
- Debug helpers: `_queueLength()`, `_debugEventNames()`, `?analytics_debug=1` → `data-fr-analytics-*` (names only when debug).
- `radius_changed` skips identical radius re-taps.
- Docs: `AARON_AMPLITUDE.md` (Aaron: confirm events in project **855341**, paste Browser API key into `config.js` as `FOOD_RADAR_AMPLITUDE_API_KEY`, refresh). `EVENTING.md` taxonomy + changelog.
- No secrets invented; empty key = in-memory queue only. No push.

---

## Product bar P0 — 2026-08-23 (local only, no push)

Pair landed Aaron’s locked P0 in `/workspace/food-radar-app/` (docs aligned by Scribe):

- **Contact + hours:** Call (`tel:`), Website, Hours on place cards and deal sheet when OSM tags are present; hidden when missing. Quiet Precision (slate); amber stays deals-only.
- **Reviews:** Maps handoff only (Apple Maps + Google Maps place links, `noopener` / `no-referrer`). Copy: “Reviews on Maps — we don’t store ratings.” Optional real OSM `stars`/rating tag labeled OpenStreetMap. **No invented star scores.**
- **Deals:** still illustrative / partner-ready — not live Honey scrapes.
- **Privacy:** unchanged — no stored location history/profile; no account for core.

Status table updated in `PRODUCT_BAR_TODAY.md`. Screenshot if present: `shot/product-bar.png` (Pair). Local only; no push.
