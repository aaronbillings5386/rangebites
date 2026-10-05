# Third-party notices — RangeBites (forge PR, 2026-10-03)

Base: live 20261003b + hours.patch. Everything below ships in the site tree or the repo.

| Name | Version | Source URL | License | Files | Added by |
|---|---|---|---|---|---|
| Leaflet | 1.9.4 | https://github.com/Leaflet/Leaflet/tree/v1.9.4 | BSD-2-Clause (© 2010-2023 Volodymyr Agafonkin, © 2010-2011 CloudMade) | `vendor/leaflet/leaflet.js`, `vendor/leaflet/leaflet.css`, `vendor/leaflet/images/*`, **`vendor/leaflet/LICENSE`** (new, verbatim from https://raw.githubusercontent.com/Leaflet/Leaflet/v1.9.4/LICENSE, CRLF line endings kept) | existing; LICENSE added in this PR |
| actions/checkout (CI only, not shipped to the site) | v4.2.2, pinned `11bd71901bbe5b1630ceea73d27597364c9af683` | https://github.com/actions/checkout | MIT | `.github/workflows/checks.yml` (reference only; nothing vendored) | this PR |

## Data and services (not code; listed for attribution)
| Name | Terms | Where credited |
|---|---|---|
| OpenStreetMap data (via Overpass at overpass.private.coffee (Private.coffee), overpass-api.de (FOSSGIS e.V.) and overpass.openstreetmap.fr (OSM France), tried in that order) | ODbL 1.0 | Map credit "Data © OpenStreetMap contributors (ODbL)", footers, Terms §8/§17 |
| Map tiles tile.openstreetmap.de (FOSSGIS e.V. / OSM Deutschland) | CC-BY-SA 2.0 + FOSSGIS server terms (operator email required) | Map credit "Tiles CC-BY-SA 2.0 OSM Deutschland/FOSSGIS · Report a map error" |
| Nominatim (nominatim.openstreetmap.org, OSMF) | OSMF Nominatim Usage Policy | Terms §17; no autocomplete; client ≥1.1 s between requests |
| AllThePlaces chain hours (`data/atp-hours.json`, from hours.patch) | CC0-1.0 | Navi's hours copy (About/Privacy/contact row) |

## No other add-ons
No npm packages, no CDN scripts, no fonts, no clustering library, no minifier were added. Tests and CI use only Node's built-in `assert`/`vm` and Python's `py_compile`.
RangeBites logo and icons (bitten-R mark) were created for the site owner, Aaron Billings, by his Grok Bot crew during development (Aug-Sep 2026) and are owned by him. No third-party stock or licensed artwork is used. This PR only re-compressed `icons/logo.png`, `icon-512.png`, `logo-512.png`, `icon-192.png` and made `favicon.ico` from `icon-192.png`.
