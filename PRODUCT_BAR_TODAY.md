# Aaron product bar — as-shipped (2026-08-26)

Local web MVP in `/workspace/food-radar-app/`. No deploy. No git push. Support address pending (do not invent one).

**Bar (locked):** RangeBites works **anywhere** it’s opened:
1. Current position (Locate Me; demo fallback only if denied)
2. Local eats for that area
3. Coupons / deals
4. Reviews
5. Distance from user
6. Business contact (phone / website / etc. when available)

**Privacy:** no stored location history / no profile.

**Reviews path (Aaron locked 2026-08-23):** Option **A — Maps handoff only** for MVP. No fake stars. Google Places / Apple native / user tips = later.

## Status vs `/workspace/food-radar-app/` (2026-08-26)

| # | Bar item | Status | Notes |
|---|----------|--------|-------|
| 1 | Locate / current position | **Met** | Locate Me + Overpass race (incl. `overpass.private.coffee`); demo on deny / Try demo map |
| 2 | Local eats | **Met** | Live OSM via Overpass; **OpenStreetMap tiles** (not CARTO) |
| 3 | Coupons / deals | **Partial** | Illustrative matcher + honest empty-state when no match. **Not live Honey.** Partner notes in `LIVE_DEALS_PARTNERS.md` (CJ / Awin / Impact — no publisher account yet) |
| 4 | Reviews | **Met (MVP A)** | Maps handoff CTAs; optional OSM stars tagged; no fake ratings |
| 5 | Distance | **Met** | Haversine + walk chips on cards / rail / sheet |
| 6 | Business contact | **Met** | Call / Website / Hours on cards + deal sheet when OSM tags present |

**Also on disk (not a 7th bar item):** local Waitlist (`waitlist.html`, email-only, About + empty-state links). Honesty pass on `ABOUT_AND_DISCLOSURES.md`, `APP_STORE.md`, `README.md`, `PRODUCT.md` (OSM tiles, web wipe = leave/close page not iOS delete-app, illustrative deals, no fake stars, support pending).

## Prioritized ship list for Codey (today)

### P0 — shipped 2026-08-23 (still true)
1. **Contact + hours on place cards and deal sheet** (Aaron priority #1) — landed.
2. **Reviews: honest path only — no fake stars** (Aaron priority #2) — landed. Option **A** locked.

### Reviews source options (post-MVP; A locked for now)

| Option | Pros | Cons | Product take |
|--------|------|------|--------------|
| **A. Maps handoff only** (today) | Free, honest, no API key, privacy-clean | No in-app stars | **LOCKED for MVP (Aaron)** |
| **B. Google Places API** (paid) | Real ratings + snippets | Cost, ToS, API key, more data leaving device | Best “real reviews in-app” later; disclose in About/PRIVACY |
| **C. Apple Maps / Look Around / Place Card** | On-brand for Apple-first | Limited web API; better on native iOS | Prefer for **iOS app**; web stays Maps deep link |
| **D. User tips later** | On-brand, owned content | Needs moderation, optional account or device-only tips | Post-MVP; tips **on-device only** unless user opts into sync |

**Decision:** **A locked** for MVP. Plan **C** for native iOS later. **B** only if Aaron later wants paid in-app stars + disclosure. **D** after core bar feels solid.

### P1 — landed 2026-08-26 (local)
3. Widen illustrative deal matching + stamp every deal **Illustrative**; honest empty-state when Locate has no deal match. Still not live Honey.
4. Anywhere QA: geo deny / Try demo map still full loop. OSM tiles (Carto key watermark gone).
5. Waitlist wired (About + empty-state + waitlist footer back to index/privacy/terms). Email only.
6. Honesty pass: ABOUT / APP_STORE / README / PRODUCT — OSM not CARTO; wipe = close page; no invented support email; no fake stars.
7. `LIVE_DEALS_PARTNERS.md` — CJ, Awin, Impact only. No account yet. Live Honey still out.

### Out of scope
Fake ratings, review corpus backend, accounts, stored location, live Honey scrape, inventing a support email, git push / deploy, publisher tokens.

## Done when
**P0 landed locally (2026-08-23):** contact/hours + Reviews→Maps in UI.

**2026-08-26 as-shipped:** bar 1–2, 4–6 met; deals still partial (illustrative + empty-state). Waitlist local. Docs honest. Partner packet on disk, no live feed.

Anywhere: Locate → local eats + **distance** → **deal** when matched (or honest empty) → **Call / Website / Hours** when OSM has them → **Reviews** via honest Maps handoff (no invented stars). Privacy intact.

Full detail for eng: this file. Aaron locked **A**; B/C/D remain post-MVP options.

## Acceptance (Product)

**2026-08-23:** P0 accepted — contact/hours + Reviews→Maps handoff landed (`shot/product-bar.png`).

**2026-08-26:** As-shipped snapshot of this file. Deals remain the only bar hole (illustrative, not Honey). Live partner APIs wait on a real CJ/Awin/Impact account.
