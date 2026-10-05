#!/usr/bin/env python3
"""Build data/atp-hours.json: chain-store opening_hours from AllThePlaces (CC0) for the RangeBites region.

AllThePlaces (https://www.alltheplaces.xyz/) scrapes chain store locators weekly; output is CC0.
This keeps only US chain spiders, points inside REGION_BBOX, and features that carry
opening_hours + brand:wikidata. app.js matches an OSM place to a row by brand:wikidata
within 150 m. No API key, no cost. Re-run weekly (or before each publish) and commit the JSON.

Usage: python3 tools/build-atp-hours.py [--run RUN_ID]
       python3 tools/build-atp-hours.py --normalize-only   (re-normalize the committed JSON, no network)

Known gaps (20261004b, Scout's Lebanon VA check, ATP run 2026-09-26): subway_us and pizza_hut_us
features carry no opening_hours, so they add 0 rows. Long John Silver's (ljsilvers), Ponderosa/Bonanza
and Pal's have no ATP spider. Those chains get no fill; this tool never invents hours.
"""
import json, re, sys, urllib.request, os, time

REGION_BBOX = (35.5, -84.8, 38.6, -79.5)  # S,W,N,E: SW Virginia, S West Virginia, E Kentucky, NE Tennessee, NW North Carolina
SPIDERS = """applebees arbys_us baskin_robbins_us bob_evans_us bojangles buffalo_wild_wings_us burger_king captain_d_us
chick_fil_a chilis chipotle cookout_us culvers_us dairy_queen dennys_us dominos_pizza_us dunkin_us firehouse_subs
five_guys_us golden_corral hardees_us huddle_house_us ihop jersey_mikes_us jimmy_johns_us kfc_us krispy_kreme_us
krystal_us little_caesars_us logans_roadhouse_us marcos mcalisters_deli mcdonalds moes_southwest_grill
outback_steakhouse panera_bread_us papa_johns pizza_hut_us popeyes qdoba ruby_tuesday_us shoneys_us
sonic_drivein_us starbucks_us steak_n_shake subway_us sweetfrog_us taco_bell_us texas_roadhouse
tropical_smoothie_cafe_us waffle_house_us wendys wingstop zaxbys_us""".split()
UA = {"User-Agent": "RangeBites/1.0 (https://rangebites.com) atp-hours builder"}

_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]


def _days(sel):
    """'Mo-Su' / 'Mo-Fr,Su' -> set of day indexes, or None if the selector is anything else."""
    out = set()
    for piece in sel.split(","):
        m = re.fullmatch(r"(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?", piece.strip())
        if not m:
            return None
        a = _DAYS.index(m.group(1)); b = _DAYS.index(m.group(2) or m.group(1))
        i = a
        while True:
            out.add(i)
            if i == b:
                break
            i = (i + 1) % 7
    return out


def _fmt(mins):
    if mins > 1440:
        mins -= 1440
    return "%02d:%02d" % divmod(mins, 60)


def _parse_week(raw):
    """'Mo-Th 09:00-24:00; Fr ...' -> list of 7 merged span lists (Mo..Su), or None if any rule is not a
    plain '<days> <spans>' rule. A later rule replaces the days it names (OSM semantics)."""
    week = [[] for _ in range(7)]
    rules = [r.strip() for r in raw.split(";") if r.strip()]
    if not rules:
        return None
    for rule in rules:
        m = re.fullmatch(r"([A-Za-z,\-]+)\s+((?:\d{1,2}:\d{2}-\d{1,2}:\d{2})(?:\s*,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*)", rule)
        days = _days(m.group(1)) if m else None
        if not m or days is None:
            return None
        spans = []
        for piece in m.group(2).split(","):
            x, y = piece.strip().split("-")
            s0 = int(x[:-3]) * 60 + int(x[-2:]); e0 = int(y[:-3]) * 60 + int(y[-2:])
            if s0 >= 1440 or e0 > 1440 * 2:
                return None
            if e0 <= s0:
                e0 += 1440
            spans.append([s0, e0])
        spans.sort()
        merged = []
        for sp in spans:
            if merged and sp[0] <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], sp[1])
            else:
                merged.append(sp)
        for d in days:
            week[d] = [list(sp) for sp in merged]
    return week


def _needs_fix(raw, week):
    """True when a rule had overlapping/touching spans, or a 24:00 end meets the next day's 00:00 start."""
    n_in = len(re.findall(r"\d{1,2}:\d{2}-\d{1,2}:\d{2}", raw))
    n_rules_spans = sum(len(r.split(",")) for r in re.findall(r"(\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*)", raw))
    if n_in != n_rules_spans:
        return False
    for rule in [r.strip() for r in raw.split(";") if r.strip()]:
        spans = re.findall(r"\d{1,2}:\d{2}-\d{1,2}:\d{2}", rule)
        days = _days(rule.split()[0])
        if days and len(spans) > len(week[min(days)]):
            return True  # some spans in this rule were merged
    return any(week[d] and week[d][-1][1] == 1440 and week[(d + 1) % 7] and week[(d + 1) % 7][0][0] == 0
               and len(week[(d + 1) % 7]) > 1 for d in range(7))


def normalize_oh(oh):
    """Merge overlapping or touching spans, and fold a day's 00:00-xx span into the previous day's span
    that runs to 24:00, then regroup days with the same hours.
    'Mo-Su 00:00-02:00,09:00-23:00,09:00-24:00' -> 'Mo-Su 09:00-02:00'. Anything it can't read is
    returned unchanged. Pure function: no network, no invented hours."""
    raw = (oh or "").strip()
    week = _parse_week(raw)
    if week is None:
        return raw
    if not _needs_fix(raw, week):
        return raw
    for d in range(7):
        nxt = week[(d + 1) % 7]
        if week[d] and week[d][-1][1] == 1440 and nxt and nxt[0][0] == 0 and nxt[0][1] < 1440 and len(nxt) > 1:
            week[d][-1][1] = 1440 + nxt[0][1]
            nxt[0] = None
    week = [[sp for sp in day if sp is not None] for day in week]
    groups = []
    for d in range(7):
        key = ",".join(_fmt(a) + "-" + _fmt(b) for a, b in week[d])
        if groups and groups[-1][2] == key and groups[-1][1] == d - 1:
            groups[-1][1] = d
        else:
            groups.append([d, d, key])
    parts = []
    for a, b, key in groups:
        if not key:
            continue
        sel = _DAYS[a] if a == b else (_DAYS[a] + ("," if b == a + 1 else "-") + _DAYS[b])
        parts.append(sel + " " + key)
    return "; ".join(parts) if parts else raw


def get(url, timeout=180):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()

def normalize_committed():
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "atp-hours.json")
    with open(dst) as f:
        data = json.load(f)
    changed = 0
    for row in data["rows"]:
        new = normalize_oh(row[3])
        if new != row[3]:
            row[3] = new; changed += 1
    with open(dst, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"normalized {changed} of {len(data['rows'])} rows")


def main():
    if "--normalize-only" in sys.argv:
        return normalize_committed()
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
            rows.append([q, round(lat, 5), round(lng, 5), normalize_oh(oh), sp])  # spider name only; no URLs (some carry vendor API keys)
            k += 1
        per[sp] = k
    out = {
        "source": "AllThePlaces, CC0-1.0. Chain store-locator hours.",
        "run_id": run, "built": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "bbox": REGION_BBOX,
        "fields": ["brand_wikidata", "lat", "lng", "opening_hours", "atp_spider"], "rows": rows,
    }
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "atp-hours.json")
    with open(dst, "w") as f: json.dump(out, f, separators=(",", ":"))
    print(f"run {run}: {len(rows)} rows from {sum(1 for v in per.values() if v)} spiders -> {os.path.normpath(dst)} ({os.path.getsize(dst)//1024} KB)")

if __name__ == "__main__":
    main()
