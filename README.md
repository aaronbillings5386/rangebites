# RangeBites

RangeBites ([rangebites.com](https://rangebites.com)) is a privacy-first food finder. Type a city or tap **Locate Me** to see nearby restaurants, cafes, bars, bakeries and tagged food pantries from OpenStreetMap, with distance, tagged hours, and links to call, get directions or read reviews on Maps. You don't need an account.

It's a static site: plain HTML, CSS and classic `<script>` files with no bundler and no framework. Leaflet is vendored under `vendor/`.

## Privacy rule (non-negotiable)

- **No visitor data on any server.** There are no accounts, analytics, trackers, cookies or server logs of searches.
- Searches go through same-origin here.now proxy routes (`/api/overpass*`, `/api/nominatim`; see `.herenow/proxy.json`). Upstream services see the host, not the visitor, and coordinates are rounded to 3 decimals (~100 m) before they're sent.
- The device keeps only UI choices (filters, saved places as id/name/address, notice flags) in `localStorage`. It never stores coordinates, location history or search history.
- Short caches (Overpass answers and city lookups, 10 min) live **in page memory only**. They're keyed by the rounded area or the city text, and they disappear when the page closes.
- The service worker caches static icons only, never `/api/`, `/.herenow/` or a URL with coordinates.
- Any change that adds storage, a third-party host or a new processor must update `privacy.html` and `privacy/index.html` in the same PR.

## Run it locally

```bash
python3 -m http.server 8765      # or: npm run serve
# open http://127.0.0.1:8765/
```

The `/api/*` proxy routes only exist on here.now, so a plain static server can't run live searches. For a full local preview, use a small server that emulates the routes in `.herenow/proxy.json` (the PR QA used one) or test against the live site.

## Lint, format and test

```bash
npm ci                 # dev tooling only (ESLint 9, Prettier 3)
npm run lint           # eslint . (flat config: eslint.config.js)
npm run format:check   # prettier --check . (HTML and Markdown are deliberately not reformatted)
npm test               # node harness tests + python3 tests/test_build_atp_hours.py
```

The tests are dependency-free. `tests/extract.js` pulls named functions out of `app.js` and runs them in a `vm` sandbox, so production code has no test hooks. CI (`.github/workflows/ci.yml`) runs lint, format:check and the tests on Node LTS for every PR and every push to main. `checks.yml` also runs `node --check` and the JSON and Python checks.

## Deploy

The site is published to **here.now** (slug `present-hollow-6jgb`, served at rangebites.com behind Cloudflare) with `ship_rangebites_once.py`, which runs from the box, not from this repo. here.now serves the repo root as-is, so **don't move or rename deployed paths** (`/index.html`, `/about/`, `/privacy/`, `/terms/`, `/deals/*`, `/icons/*`, `/themes/*`, `/data/*`, `/sw.js` and so on).

Before publishing:

1. Bump the build: the `<!-- rb-build -->` marker, every `?v=` in the HTML, and `CACHE` in `sw.js`.
2. Keep dev files out of the upload. The ship script skips `.git`, `.github`, `tests` and `*.md`. It does **not** skip `node_modules/`, `package*.json`, `eslint.config.js`, `.prettier*`, `tools/` or `shot/`. See [docs/PUBLISH_SET.md](docs/PUBLISH_SET.md) for the skip list to add, and never run `npm ci` in the publish checkout until it's in place.
3. Changes to `.herenow/proxy.json` (proxy routes) only take effect after a publish.

## Layout

| Path | What |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | The app shell, all app logic, and styles |
| `deals.js`, `disclaimers.js`, `config.js`, `metrics.js` | Listing-promo matching, legal copy, runtime config, legacy-ID cleanup (no analytics) |
| `themes/` | Holiday themes: `us-holidays.js` (dates), `holiday-themes.js` (registry and art), `holiday.css` |
| `about*`, `privacy*`, `terms*`, `specials.html`, `deals/`, `sitemap.*`, `404.html` | Static pages |
| `data/` | `closed-places.json` (curated closures) and `atp-hours.json` (AllThePlaces chain hours, CC0) |
| `.herenow/proxy.json` | here.now proxy routes (Overpass mirrors and Nominatim) with identifying UA |
| `_headers`, `vercel.json` | Security headers (see [docs/HEADERS_AND_CSP.md](docs/HEADERS_AND_CSP.md)) |
| `tools/` | Offline builders (`build-atp-hours.py`). Not part of the site |
| `tests/` | Harness tests |
| `docs/` | [Architecture](docs/ARCHITECTURE.md), [holiday themes](docs/HOLIDAY_THEMES.md), [headers and CSP](docs/HEADERS_AND_CSP.md), [hours parser](docs/HOURS_PARSER.md) |

Product notes live in `PRODUCT.md`, `PRIVACY_GUARDRAILS.md` and `ABOUT_AND_DISCLOSURES.md`. The previous README is in `docs/LEGACY_README.md`.

## Data and licences

Map data © OpenStreetMap contributors (ODbL). Chain hours come from AllThePlaces (CC0). Tiles come from tile.openstreetmap.de. See `THIRD_PARTY_NOTICES.md`.
