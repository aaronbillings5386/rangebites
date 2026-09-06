# RangeBites — Product Brief (working title)

**One-liner:** Find food near you. See the deal. No account required.

**Platform:** Apple (iOS) first. This repo is the **mobile-first web MVP** for early testing.

**Quiet Precision:** slate / graphite UI; **amber only for deals**.

---

## Product bar (locked)

RangeBites works **anywhere** it’s opened:

1. **Current position** — Locate Me (demo / “Try demo map” only if denied or chosen)
2. **Local eats** for that area (OpenStreetMap via Overpass)
3. **Coupons / deals** — illustrative / partner-ready, clearly labeled; real partners later (not live Honey scrapes)
4. **Reviews** — **Maps handoff** (Apple Maps + Google Maps place links). Optional OSM rating tag only when present (labeled OpenStreetMap). **No fake stars or invented ratings.**
5. **Distance** from the user (Haversine / walk chips)
6. **Business contact** — Call (`tel:`), Website, Hours on place cards and deal sheet when OSM has them; hide when missing

**Privacy (non-negotiable):** no stored location history, no user profile, no account required for core search.

P0 ship detail: [PRODUCT_BAR_TODAY.md](./PRODUCT_BAR_TODAY.md).

---

## Core idea

Tap **Locate Me**. The browser briefly uses GPS for the current search. Results show nearby places, distance, deals when matched, **Call / Website / Hours** when tagged, and **Reviews on Maps** (we don’t store ratings). Leave or close the page → in-memory location and results are discarded.

---

## Privacy-first architecture

| Data | What we do |
|------|------------|
| Location | **When-in-use** for the current search only. Browser → Overpass + OpenStreetMap tiles (not CARTO). Never written as a user profile. No RangeBites backend receives coordinates. Web wipe: leave/close the page, not iOS delete-app. |
| Search / radar history | Not saved to a cloud account. In-memory for the session; wipe on leave/close the page (web). |
| Account | **No required login** for core radar, deals, or listings. |
| Contact / hours | Rendered from OSM tags on cards/sheet when present; hidden when missing. Not stored as a profile. |
| Reviews | Maps handoff (`noopener` / `no-referrer`). Rare OSM `stars`/rating tags only if real, sourced “OpenStreetMap”. **Never invent ratings.** |
| Deals | Illustrative / partner-ready patterns, labeled. Not live Honey scrapes. Confirm locally. |
| Analytics | Optional Amplitude (key gated); no sale of personal data. |

**Design rule:** If a feature needs storing who you are, redesign it or make it optional and explicit.

---

## Features

### MVP (web demo → native) — P0 today

- Anywhere geo: Locate Me + demo fallback / Try demo map
- Local eats from OSM + distance sorting / chips
- Deal badges + deal rail (illustrative; Sponsored labeled)
- **Contact + hours** on place cards and deal sheet (phone, website, `opening_hours` when tagged)
- **Reviews → Maps handoff** (“Reviews on Maps — we don’t store ratings.”); optional real OSM rating tag only
- About + Privacy + Terms + local Waitlist always reachable (support address pending — do not invent one)
- Quiet Precision visuals (slate default; amber only on deals)

### Soon after

- Real partner deal inventory (still disclosed; confirm locally)
- Favorites **on device only** unless user opts into sync later
- Native iOS Maps / place-card reviews path (stronger than web deep links)

### Later

- Optional Apple Sign In only if user wants cross-device sync (minimize data)
- Partner restaurant claim pages
- Paid review APIs (e.g. Google Places) only with explicit disclosure — not required for bar

### Out of scope

Fake ratings, review corpus backend, accounts for core, stored location history, live Honey scrapes.

---

## Safety for users

- Clear location permission explanation (system prompt + in-app why)
- No background location — **when-in-use only**
- Disclosures: listings, deals, and OSM data can be wrong; third-party Maps/sites are their responsibility
- We are **not** a safety escort service
- No storing of minors’ data (age gate / parental language as counsel advises)

---

## Brand / UI

- **Feel:** Apple-native, calm, premium
- **Palette:** slate / graphite; soft light gray text; **amber only for deals**
- **Motion:** restrained radar / locate glow; not flashy
- **Tone:** direct, trustworthy; sample offers, not promises

---

## Name ideas (pick later)

RangeBites · Plate Radar · NearBite · Slate Eats · Locavore Radar

---

## Launch checklist (high level)

- [ ] Privacy Policy + Terms + About disclosures
- [ ] Lawyer review of disclosures (before public launch)
- [ ] App Store privacy nutrition labels (accurate: location when-in-use, no tracking)
- [ ] Partner terms for deals / booking deep links
- [ ] P0 product bar in UI: contact/hours + Reviews→Maps handoff
- [ ] MVP build + TestFlight

See also: [PRODUCT_BAR_TODAY.md](./PRODUCT_BAR_TODAY.md), [PRIVACY_GUARDRAILS.md](./PRIVACY_GUARDRAILS.md), [README.md](./README.md).
