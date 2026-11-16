#!/usr/bin/env python3
"""data/raw/ -> site/story/story.json: the green wanders, the gold keeps an appointment.

    python3 build_story.py          # BUILD_OUT=... writes elsewhere (publish.sh compares)

The page (site/index.html) asks when the Dish turns green. This asks the other end: when does
it go gold again, and does a late green make for a late gold? Every date comes from build.py's
own rules (imported, not copied), on the page's own Terra+Aqua series:

  green-up / gold-down   build.seasons(): the threshold half-way from the Aug-Sep baseline
                         to the Jan 1-Apr 15 peak, crossed upward from Sep 15 and downward
                         after the peak
  day of season          days since Aug 1
  spring rain            Open-Meteo (ERA5) rain at the Dish, Mar 1 - Apr 30: before the
                         earliest gold-down of the 26 seasons (Apr 24) bar one week
  winter rain            the same, the 212 days from Aug 1 (to Feb 28, or Feb 27 in a leap
                         year): the span of the page's own rain-so-far curve, so it can check it

Found by looking, 2026-11-16, so the story calls both findings that and shows its checks:
  robust     the same two spreads and r under 12 rules: Terra alone and Terra+Aqua, each with
             the threshold at 30/50/70% of the way to the peak and at fixed NDVI 0.45/0.5/0.55
  gauge      spring rain from the Palo Alto COOP gauge (NOAA GHCN USC00046646) instead of the
             reanalysis, only in springs it reported on 55+ of the 61 days

test/story.test.mjs recomputes every number in `check` in JS from `seasons` (site/story/
layout.js stats()) and requires the two to agree; it also requires `seasons` to match the
page's own site/data.json date for date.
"""
import glob, json, os, statistics as st
from datetime import date, timedelta

import build as B

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("BUILD_OUT", os.path.join(HERE, "site", "story", "story.json"))
GAUGE = "USC00046646"


def day(iso, y):
    return (date.fromisoformat(iso) - date(y, 8, 1)).days


def rain_between(rain, a, b):
    return round(sum(v for d, v in rain.items() if a <= d < b), 1)


def load_series(prod):
    B.PROD = prod
    ndvi, rel, doy = B.load_band("NDVI"), B.load_band("pixel_reliability"), B.load_band("composite_day_of_the_year")
    return B.series(ndvi, rel, doy, B.grass_pixels(ndvi))


def variant(ser, y0, y1, thr_fn):
    """build.seasons()' green-up and gold-down with the threshold swapped out."""
    g, o = [], []
    for y in range(y0, y1 + 1):
        s0, s1 = date(y, 8, 1), date(y + 1, 8, 1)
        base = [v for d, v in ser if s0 <= d < date(y, 10, 1)]
        pk = [(d, v) for d, v in ser if date(y + 1, 1, 1) <= d < date(y + 1, 4, 16)]
        pd_, p = max(pk, key=lambda x: x[1])
        t = thr_fn(st.median(base), p)
        gu = next(d for d, v in ser if date(y, 9, 15) <= d < s1 and v >= t)
        gd = next(d for d, v in ser if max(pd_, date(y + 1, 3, 1)) < d < s1 and v < t)
        g.append((gu - s0).days)
        o.append((gd - s0).days)
    return {"green_sd": round(st.pstdev(g), 1), "gold_sd": round(st.pstdev(o), 1),
            "green_spread": max(g) - min(g), "gold_spread": max(o) - min(o), "r": round(st.correlation(g, o), 3)}


def main():
    rain = B.load_rain()
    ser = load_series("M?D")
    rows = []
    for s in B.seasons(ser, rain):
        if not (s.get("greenup") and s.get("golddown")):
            continue
        y = s["y"]
        rows.append({"season": s["season"], "y": y, "greenup": s["greenup"], "golddown": s["golddown"],
                     "spring_mm": rain_between(rain, date(y + 1, 3, 1), date(y + 1, 5, 1)),
                     "winter_mm": rain_between(rain, date(y, 8, 1), date(y, 8, 1) + timedelta(B.CUM_DAYS))})
    y0, y1 = rows[0]["y"], rows[-1]["y"]

    robust = []
    for prod, name in (("MOD", "Terra"), ("M?D", "Terra+Aqua")):
        sr = ser if prod == "M?D" else load_series(prod)
        for f in (0.3, 0.5, 0.7):
            robust.append({"products": name, "rule": f"{round(f * 100)}% of the way to the peak",
                           **variant(sr, y0, y1, lambda b, p, f=f: b + f * (p - b))})
        for a in (0.45, 0.5, 0.55):
            robust.append({"products": name, "rule": f"NDVI {a}", **variant(sr, y0, y1, lambda b, p, a=a: a)})
    B.PROD = "M?D"

    # the same spring-rain r, on Terra alone and on the gauge
    def spring_r(sr):
        ss = {s["season"]: s for s in B.seasons(sr, rain) if s.get("golddown")}
        xs = [r["spring_mm"] for r in rows]
        return round(st.correlation(xs, [day(ss[r["season"]]["golddown"], r["y"]) for r in rows]), 3)
    terra = spring_r(load_series("MOD"))
    B.PROD = "M?D"
    with open(os.path.join(B.RAW, f"gauge_{GAUGE}.json")) as f:
        P = {g["DATE"]: float(g["PRCP"]) for g in json.load(f) if g.get("PRCP") not in (None, "")}
    gx, gy = [], []
    for r in rows:
        a = date(r["y"] + 1, 3, 1)
        have = [k for k in ((a + timedelta(i)).isoformat() for i in range(61)) if k in P]
        if len(have) >= 55:
            gx.append(sum(P[k] for k in have))
            gy.append(day(r["golddown"], r["y"]))

    D = {"source": "build.py's green-up and gold-down on NASA MODIS NDVI (Terra+Aqua) at the Dish; "
                   "Open-Meteo ERA5 rain; NOAA GHCN gauge " + GAUGE,
         "seasons": rows,
         "robust": {"variants": robust, "terra_spring_r": terra,
                    "gauge": {"station": GAUGE, "n": len(gx), "r": round(st.correlation(gx, gy), 3)}}}

    g = [day(r["greenup"], r["y"]) for r in rows]
    o = [day(r["golddown"], r["y"]) for r in rows]
    ln = [b - a for a, b in zip(g, o)]
    sp = [r["spring_mm"] for r in rows]
    by_sp = sorted(range(len(rows)), key=lambda i: (sp[i], rows[i]["y"]))
    pick = lambda xs, f: rows[xs.index(f(xs))]
    D["check"] = {
        "n": len(rows), "first": rows[0]["season"], "last": rows[-1]["season"],
        "green_spread": max(g) - min(g), "gold_spread": max(o) - min(o),
        "green_sd": st.pstdev(g), "gold_sd": st.pstdev(o),
        "green_first": pick(g, min)["greenup"], "green_last": pick(g, max)["greenup"],
        "gold_first": pick(o, min)["golddown"], "gold_last": pick(o, max)["golddown"],
        "r_go": st.correlation(g, o),
        "len_min": min(ln), "len_min_season": pick(ln, min)["season"],
        "len_max": max(ln), "len_max_season": pick(ln, max)["season"],
        "r_spring": st.correlation(sp, o), "r_winter": st.correlation([r["winter_mm"] for r in rows], o),
        "dry5_gold": st.mean(o[i] for i in by_sp[:5]), "wet5_gold": st.mean(o[i] for i in by_sp[-5:]),
        "dry5_mm": max(sp[i] for i in by_sp[:5]), "wet5_mm": min(sp[i] for i in by_sp[-5:]),
    }
    D["check"]["sd_ratio"] = D["check"]["green_sd"] / D["check"]["gold_sd"]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(D, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("  ".join(f"{k} {round(v, 3) if isinstance(v, float) else v}" for k, v in D["check"].items()))
    print("robust:", [(v["products"], v["rule"], v["green_sd"], v["gold_sd"], v["r"]) for v in robust])
    print("terra spring r", terra, "gauge", D["robust"]["gauge"])


if __name__ == "__main__":
    main()
