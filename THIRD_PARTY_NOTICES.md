# Third-party notices — RangeBites (build 20261004b, 2026-10-05)

Base: build 20261004b (PR #14). Everything below ships in the site tree or the repo.

| Name | Version | Source URL | License | Files | Added by |
|---|---|---|---|---|---|
| Leaflet | 1.9.4 | https://github.com/Leaflet/Leaflet/tree/v1.9.4 | BSD-2-Clause (© 2010-2023 Volodymyr Agafonkin, © 2010-2011 CloudMade) | `vendor/leaflet/leaflet.js`, `vendor/leaflet/leaflet.css`, `vendor/leaflet/images/*`, **`vendor/leaflet/LICENSE`** (new, verbatim from https://raw.githubusercontent.com/Leaflet/Leaflet/v1.9.4/LICENSE, CRLF line endings kept) | existing; LICENSE added in this PR |
| actions/checkout (CI only, not shipped to the site) | v4.2.2, pinned `11bd71901bbe5b1630ceea73d27597364c9af683` | https://github.com/actions/checkout | MIT | `.github/workflows/checks.yml` (reference only; nothing vendored) | this PR |

## Data and services (not code; listed for attribution)
| Name | Terms | Where credited |
|---|---|---|
| OpenStreetMap data (via Overpass at overpass.private.coffee, run by Private.coffee, the only Overpass server) | ODbL 1.0 | Map credit "Data © OpenStreetMap contributors (ODbL)", footers, Terms §8/§17 |
| Map tiles tile.openstreetmap.de (FOSSGIS e.V. / OSM Deutschland) | CC-BY-SA 2.0 + FOSSGIS server terms (operator email required) | Map credit "Tiles CC-BY-SA 2.0 OSM Deutschland/FOSSGIS · Report a map error" |
| Nominatim (nominatim.openstreetmap.org, OSMF) | OSMF Nominatim Usage Policy | Terms §17; no autocomplete; client ≥1.1 s between requests |
| AllThePlaces chain hours (`data/atp-hours.json`, from hours.patch) | CC0-1.0 | Navi's hours copy (About/Privacy/contact row) |

## No other add-ons
Nothing new is shipped to visitors: no CDN scripts, no fonts, no clustering library, no minifier. Tests use Node's built-in `assert`/`vm` and Python's `unittest`/`py_compile`.

Dev-only dependencies (build 20261004b; used for lint and format in CI and locally, **not shipped to visitors**, and kept out of the publish set; see docs/PUBLISH_SET.md):

| Name | Version | Source URL | License | Use |
| --- | --- | --- | --- | --- |
| eslint | 9.39.5 | https://github.com/eslint/eslint | MIT | `npm run lint` |
| @eslint/js | 9.39.5 | https://github.com/eslint/eslint | MIT | ESLint recommended rules |
| globals | 17.13.0 | https://github.com/sindresorhus/globals | MIT | Browser/node globals for ESLint |
| prettier | 3.9.9 | https://github.com/prettier/prettier | MIT | `npm run format:check` |
| actions/setup-node | v4.4.0 (49933ea) | https://github.com/actions/setup-node | MIT | CI only (`.github/workflows/ci.yml`) |
RangeBites logo and icons (bitten-R mark) were created for the site owner, Aaron Billings, by his Grok Bot crew during development (Aug-Sep 2026) and are owned by him. No third-party stock or licensed artwork is used. This PR only re-compressed `icons/logo.png`, `icon-512.png`, `logo-512.png`, `icon-192.png` and made `favicon.ico` from `icon-192.png`.
