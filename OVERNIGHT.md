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

### Analytics
Retired. RangeBites does not load a tracker. `analytics.js` makes no network call and is not included from `index.html`.

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

## Morning pass — 2026-08-23 (retired)

This note used to describe an Amplitude setup. That tracker is not part of RangeBites. Do not add it back.

---

## Product bar P0 — 2026-08-23 (local only, no push)

Pair landed Aaron’s locked P0 in `/workspace/food-radar-app/` (docs aligned by Scribe):

- **Contact + hours:** Call (`tel:`), Website, Hours on place cards and deal sheet when OSM tags are present; hidden when missing. Quiet Precision (slate); amber stays deals-only.
- **Reviews:** Maps handoff only (Apple Maps + Google Maps place links, `noopener` / `no-referrer`). Copy: “Reviews on Maps — we don’t store ratings.” Optional real OSM `stars`/rating tag labeled OpenStreetMap. **No invented star scores.**
- **Deals:** still illustrative / partner-ready — not live Honey scrapes.
- **Privacy:** unchanged — no stored location history/profile; no account for core.

Status table updated in `PRODUCT_BAR_TODAY.md`. Screenshot if present: `shot/product-bar.png` (Pair). Local only; no push.
