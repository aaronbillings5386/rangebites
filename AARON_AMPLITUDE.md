# Aaron — Amplitude setup (RangeBites web MVP)

Local eventing is **already wired** in `analytics.js` + `app.js`. Without an API key, events stay in an **in-memory session queue** (nothing leaves the browser). Paste your key only when you want live Amplitude.

**Project:** Amplitude project **855341** (7 events live; North Star `nav_handoff`).

**Wire path:** `config.js` sets `FOOD_RADAR_AMPLITUDE_PROJECT_ID = "855341"`. Paste that project’s **Browser API key** into `FOOD_RADAR_AMPLITUDE_API_KEY` — the key selects the project; until then events stay in-memory only.

**Do not invent or commit secrets.** Keep real keys in local `config.js` (or env you control). `config.example.js` stays empty.

---

## What you must do

### 1. Confirm / create events in Amplitude (project 855341)

In Amplitude → Data → Events (or Event Catalog), ensure these **snake_case** names exist (create if missing). Props are listed for schema clarity; types are approximate.

| Event | Properties |
|-------|------------|
| `app_opened` | `has_account` (bool) — always `false` until accounts ship |
| `onboarding_completed` | `screens_seen` (number) |
| `account_created` | *(stub only — app does **not** emit until accounts exist)* |
| `locate_me_requested` | `source` (`button` \| `auto`) |
| `locate_me_result` | `outcome` (`granted` \| `denied` \| `error`) — **no coords** |
| `radius_changed` | `radius_mi`, `prior_radius_mi` |
| `search_completed` | `radius_mi`, `result_count` |
| `deal_impression` | `deal_id`, `position`, `radius_mi` — once per deal / session |
| `deal_tapped` | `deal_id`, `position`, `radius_mi`, `has_coupon` |
| `nav_handoff` | `deal_id`, `maps_app` (`apple` \| `google` \| `other`), `radius_mi` — **North Star**; once per deal / session |

**Privacy hard rule:** never send lat/long, address, place history, or “near X” sequences. `deal_id` is an OSM/demo entity id, not a location trail.

Title Case duplicates (e.g. “Locate Me Requested”) are **held** until Analyst + Data Analyst align — ship **snake_case only**.

### 2. Paste Browser SDK / write API key into local config

1. In Amplitude → Settings → Projects → **855341** → copy the **API Key** (Browser SDK / client write key — **not** a secret server key for public web if Amplitude shows both).
2. Edit **local** `config.js` (already loaded by `index.html`):

```js
window.FOOD_RADAR_AMPLITUDE_API_KEY = "PASTE_YOUR_KEY_HERE";
```

3. Optional local debug (event **names** only in console / `_debugEventNames()` — never props):

```js
window.FOOD_RADAR_ANALYTICS_DEBUG = true;
```

4. Leave the key as `""` to keep **queue-only** mode (no CDN load, no network to Amplitude).

`config.example.js` documents the same placeholders with an empty key.

### 3. Restart / refresh

1. Serve the app locally (from `food-radar-app/`):

   `python3 -m http.server 8765`

2. Hard-refresh `http://127.0.0.1:8765/` (or `?shot=1` to skip onboard + auto demo).
3. With a key set: DevTools Network should show Amplitude SDK from `cdn.amplitude.com` and POSTs to `api2.amplitude.com` after interactions.
4. Without a key + debug on: in console, `RangeBitesAnalytics._queueLength()` grows; `RangeBitesAnalytics._debugEventNames()` lists names for the session.
5. Or open `http://127.0.0.1:8765/?shot=1&analytics_debug=1` — `<html data-fr-analytics-queue="N" data-fr-analytics-names="app_opened,...">` (names only, never props).

CSP already allows `https://cdn.amplitude.com` (script) and `https://api2.amplitude.com` / `https://cdn.amplitude.com` (connect).

---

## Quick smoke (after key or debug)

1. Open app → expect `app_opened`.
2. Finish or skip onboarding → `onboarding_completed`.
3. **Try demo map** → `search_completed` (+ `deal_impression` for deal cards).
4. Tap an amber deal → `deal_tapped`.
5. Apple/Google Maps (or Open deal) → `nav_handoff` (once per deal / session).
6. **Locate Me** → `locate_me_requested` then `locate_me_result` (`granted` / `denied` / `error`) — still **no** coordinates in props.
7. Change radius chip → `radius_changed`.

---

## Files

| File | Role |
|------|------|
| `analytics.js` | Taxonomy helpers, Amplitude init when keyed, in-memory queue otherwise |
| `config.js` | Local `FOOD_RADAR_AMPLITUDE_API_KEY` (your paste) |
| `config.example.js` | Empty template |
| `index.html` | Loads config → analytics → app; CSP for Amplitude |
| `app.js` | Call sites for all locked events |
| `EVENTING.md` | Changelog / checklist for this pass |

Local only — no push required for this MVP pass.
