#!/usr/bin/env python3
"""Build data/atp-hours.json: chain-store opening_hours from AllThePlaces (CC0) for the RangeBites region.

AllThePlaces (https://www.alltheplaces.xyz/) scrapes chain store locators weekly; output is CC0.
This keeps only US chain spiders, points inside REGION_BBOX, and features that carry
opening_hours + brand:wikidata. app.js matches an OSM place to a row by brand:wikidata
within 150 m. No API key, no cost. Re-run weekly (or before each publish) and commit the JSON.

Usage: python3 tools/build-atp-hours.py [--run RUN_ID]
"""
import json, sys, urllib.request, os, time

REGION_BBOX = (35.5, -84.8, 38.6, -79.5)  # S,W,N,E: SW Virginia, S West Virginia, E Kentucky, NE Tennessee, NW North Carolina
SPIDERS = """applebees arbys_us baskin_robbins_us bob_evans_us bojangles buffalo_wild_wings_us burger_king captain_d_us
chick_fil_a chilis chipotle cookout_us culvers_us dairy_queen dennys_us dominos_pizza_us dunkin_us firehouse_subs
five_guys_us golden_corral hardees_us huddle_house_us ihop jersey_mikes_us jimmy_johns_us kfc_us krispy_kreme_us
krystal_us little_caesars_us logans_roadhouse_us marcos mcalisters_deli mcdonalds moes_southwest_grill
outback_steakhouse panera_bread_us papa_johns pizza_hut_us popeyes qdoba ruby_tuesday_us shoneys_us
sonic_drivein_us starbucks_us steak_n_shake subway_us sweetfrog_us taco_bell_us texas_roadhouse
tropical_smoothie_cafe_us waffle_house_us wendys wingstop zaxbys_us""".split()
UA = {"User-Agent": "RangeBites/1.0 (https://rangebites.com) atp-hours builder"}

def get(url, timeout=180):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()

def main():
    run = sys.argv[sys.argv.index("--run") + 1] if "--run" in sys.argv else json.loads(get("https://data.alltheplaces.xyz/runs/latest.json"))["run_id"]
    base = f"https://alltheplaces-data.openaddresses.io/runs/{run}/output/"
    s, w, n, e = REGION_BBOX
    rows, per = [], {}
    for sp in SPIDERS:
        try:
            raw = get(base + sp + ".geojson").decode("utf-8")
        except Exception as ex:
            print("skip", sp, ex, file=sys.stderr); continue
        k = 0
        for line in raw.splitlines():
            line = line.strip().rstrip(",")
            if not line.startswith('{"type": "Feature"'): continue
            ft = json.loads(line); g = ft.get("geometry") or {}
            if g.get("type") != "Point": continue
            lng, lat = g["coordinates"][:2]
            if not (s < lat < n and w < lng < e): continue
            p = ft.get("properties") or {}
            oh, q = (p.get("opening_hours") or "").strip(), p.get("brand:wikidata")
            if not oh or not q: continue
            rows.append([q, round(lat, 5), round(lng, 5), oh, sp])  # spider name only; no URLs (some carry vendor API keys)
            k += 1
        per[sp] = k
    out = {
        "source": "AllThePlaces (https://www.alltheplaces.xyz/), CC0-1.0. Chain store-locator hours.",
        "run_id": run, "built": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "bbox": REGION_BBOX,
        "fields": ["brand_wikidata", "lat", "lng", "opening_hours", "atp_spider"], "rows": rows,
    }
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "atp-hours.json")
    with open(dst, "w") as f: json.dump(out, f, separators=(",", ":"))
    print(f"run {run}: {len(rows)} rows from {sum(1 for v in per.values() if v)} spiders -> {os.path.normpath(dst)} ({os.path.getsize(dst)//1024} KB)")

if __name__ == "__main__":
    main()
