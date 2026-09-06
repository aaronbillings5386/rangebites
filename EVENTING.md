# Eventing — RangeBites web MVP

Privacy-safe Amplitude-ready product analytics. **snake_case only.** No lat/long, addresses, place history, or “near X” sequences.

## Locked taxonomy

| Event | Props | Notes |
|-------|-------|-------|
| `app_opened` | `has_account: false` | Boot |
| `onboarding_completed` | `screens_seen` | Skip or finish |
| `account_created` | — | **No-op stub** until accounts exist |
| `locate_me_requested` | `source` | `button` \| `auto` |
| `locate_me_result` | `outcome` | `granted` \| `denied` \| `error` — **no coords** |
| `radius_changed` | `radius_mi`, `prior_radius_mi` | Skips no-op same-radius taps |
| `search_completed` | `radius_mi`, `result_count` | After list apply |
| `deal_impression` | `deal_id`, `position`, `radius_mi` | Once / deal / session |
| `deal_tapped` | `deal_id`, `position`, `radius_mi`, `has_coupon` | Deal sheet open |
| `nav_handoff` | `deal_id`, `maps_app`, `radius_mi` | **North Star**; once / deal / session |

## Transport

- `FOOD_RADAR_AMPLITUDE_API_KEY` set → Amplitude Browser SDK 2.x (`cdn.amplitude.com`), privacy-forward init (no autocapture, `identityStorage: "none"`, memory storage, IP off).
- Empty key → in-memory session queue only.
- `FOOD_RADAR_ANALYTICS_DEBUG` → console + `_debugEventNames()` (names only).

See `AARON_AMPLITUDE.md` for Aaron’s Amplitude project **855341** steps.

## Changelog

### 2026-08-23 morning (local only, no push)

- Verified `analytics.js` + `app.js` wiring for full locked snake_case set.
- CSP already allows Amplitude CDN + `api2.amplitude.com`.
- Polish: skip `radius_changed` when radius unchanged; `_debugEventNames()` + `?analytics_debug=1` DOM beacon (`data-fr-analytics-*`, names only; queue length painted after enqueue).
- Added `AARON_AMPLITUDE.md` (API key paste + event confirm in project 855341 — no invented secrets).
- Smoke: `http://127.0.0.1:8765/?shot=1&analytics_debug=1` demo path queues `app_opened` → `search_completed` → impressions (`data-fr-analytics-*` / `_queueLength`).

### 2026-08-22 overnight

- Initial snake_case lock + config/analytics bootstrap (see `OVERNIGHT.md`).
