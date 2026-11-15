#!/usr/bin/env python3
"""
build_pollution_index.py - Pollution Index (PI) + peak/dip detection.

Reads data/raw/pk_city_monthly_final.csv (real observations only) and writes
pollution_index.json to every folder the frontend loads data from.

PI follows pakistan-pollution-index-project.md, adapted to the data we really
have. The CSV holds PM2.5, AOD, NO2 and rainfall. It has NO tree-loss or CO2
column, so those two terms are removed (never invented) and the remaining
weights are renormalised, exactly as the spec's "missing variable" rule says.

    S_x  = clip((x - lo) / (hi - lo), 0, 1) * 100          (fixed bounds)
    Air  = 0.50*S_pm25 + 0.30*S_no2 + 0.20*S_aod
    R    = clip(rain_mm / 200, 0, 1)
    PI   = Air * (1 - 0.25 * R)
"""
import json, os
import numpy as np, pandas as pd
from scipy import stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, "data", "raw", "pk_city_monthly_final.csv")
OUT_DIRS = ["frontend/data"]

BOUNDS = {"pm25": (5, 150), "no2": (0, 1.5e16), "aod": (0, 2.0)}
W_AIR = {"pm25": 0.50, "no2": 0.30, "aod": 0.20}
RAIN_CAP_MM, RAIN_MAX_DISCOUNT = 200, 0.25
CATS = [(20, "Good"), (40, "Moderate"), (60, "Unhealthy for sensitive groups"),
        (80, "Unhealthy"), (100, "Hazardous")]
EVENT_Z = 1.5  # anomaly threshold (in std devs) for a peak / dip


def sub(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0, 1) * 100


def pollution_index(df, weights=W_AIR):
    d = df.copy()
    for k, (lo, hi) in BOUNDS.items():
        d["S_" + k] = sub(d[k], lo, hi)
    wsum = sum(weights.values())
    for k, w in weights.items():
        d["C_" + k] = d["S_" + k] * w / wsum          # weighted contribution
    air = sum(d["C_" + k] for k in weights)
    d["rain_factor"] = 1 - RAIN_MAX_DISCOUNT * np.clip(d["rain_mm"] / RAIN_CAP_MM, 0, 1)
    d["PI"] = air * d["rain_factor"]
    return d


def category(v):
    for hi, name in CATS:
        if v <= hi:
            return name
    return CATS[-1][1]


def episodes(dates, anom, pi, drivers, sign):
    """Merge consecutive months beyond +/-EVENT_Z sigma into episodes."""
    sd = anom.std(ddof=1)
    hit = (anom >= EVENT_Z * sd) if sign > 0 else (anom <= -EVENT_Z * sd)
    out, i, n = [], 0, len(anom)
    while i < n:
        if not hit[i]:
            i += 1; continue
        j = i
        while j + 1 < n and hit[j + 1]:
            j += 1
        seg = range(i, j + 1)
        k = max(seg, key=lambda t: sign * anom[t])
        out.append({"start": dates[i], "end": dates[j], "month": dates[k],
                    "pi": round(float(pi[k]), 1), "anomaly": round(float(anom[k]), 1),
                    "driver": drivers[k], "months": j - i + 1})
        i = j + 1
    return sorted(out, key=lambda e: -sign * e["anomaly"])


def mann_kendall(y):
    tau, p = stats.kendalltau(np.arange(len(y)), y)
    return float(tau), float(p)


def main():
    raw = pd.read_csv(CSV)
    assert raw[["pm25", "no2", "aod", "rain_mm"]].notna().all().all(), "nulls in source data"
    d = pollution_index(raw)
    d["date"] = d["month"]
    d["moy"] = d["month"].str[5:7].astype(int)
    d["year"] = d["month"].str[:4].astype(int)
    d["driver"] = d[["C_pm25", "C_no2", "C_aod"]].idxmax(axis=1).str[2:]

    cities = {}
    for city, g in d.groupby("city", sort=False):
        g = g.sort_values("date").reset_index(drop=True)
        seas = g.groupby("moy")["PI"].mean()
        anom = (g["PI"] - g["moy"].map(seas)).to_numpy()
        dates = g["date"].tolist()
        annual = g.groupby("year")["PI"].agg(["mean", "max"]).round(2)
        ann_mean = annual["mean"].to_numpy()
        slope = stats.theilslopes(ann_mean, annual.index.to_numpy())[0]
        tau, p = mann_kendall(ann_mean)
        cities[city] = {
            "lat": float(g["lat"][0]), "lon": float(g["lon"][0]),
            "dates": dates,
            "pi": g["PI"].round(2).tolist(),
            "pm25": g["pm25"].round(1).tolist(),
            "aod": g["aod"].round(3).tolist(),
            "no2": (g["no2"] / 1e15).round(2).tolist(),   # x1e15 molecules/cm2
            "rain": g["rain_mm"].round(1).tolist(),
            "driver": g["driver"].tolist(),
            "seasonal": [round(float(seas[m]), 1) for m in range(1, 13)],
            "peak_month": int(seas.idxmax()), "dip_month": int(seas.idxmin()),
            "annual": [{"year": int(y), "mean": float(r["mean"]), "max": float(r["max"])}
                       for y, r in annual.iterrows()],
            "trend": {"slope_per_year": round(float(slope), 3), "tau": round(tau, 3),
                      "p": round(p, 4),
                      "significant": bool(p < 0.05),
                      "direction": "rising" if slope > 0 else "falling"},
            "peaks": episodes(dates, anom, g["PI"].to_numpy(), g["driver"].tolist(), +1)[:8],
            "dips": episodes(dates, anom, g["PI"].to_numpy(), g["driver"].tolist(), -1)[:8],
            "mean": round(float(g["PI"].mean()), 1),
            "max": round(float(g["PI"].max()), 1),
            "latest": round(float(g["PI"].iloc[-1]), 1),
        }

    # Robustness: do rankings survive different weight sets? (spec section 2 caveat)
    base = d.groupby("city")["PI"].mean()
    alt_sets = [{"pm25": .6, "no2": .2, "aod": .2}, {"pm25": .4, "no2": .3, "aod": .3},
                {"pm25": .34, "no2": .33, "aod": .33}, {"pm25": .5, "no2": .4, "aod": .1}]
    rho = []
    for w in alt_sets:
        alt = pollution_index(raw, w).groupby("city")["PI"].mean()
        rho.append(round(float(stats.spearmanr(base, alt.reindex(base.index))[0]), 3))

    latest_date = max(c["dates"][-1] for c in cities.values())
    ranking = sorted(({"city": c, "pi": v["latest"], "category": category(v["latest"]),
                       "driver": v["driver"][-1]} for c, v in cities.items()),
                     key=lambda r: -r["pi"])
    out = {
        "meta": {
            "name": "Pakistan Pollution Index (PI)", "range": [0, 100],
            "period": [min(c["dates"][0] for c in cities.values()), latest_date],
            "bounds": {k: list(v) for k, v in BOUNDS.items()},
            "weights": W_AIR, "rain_cap_mm": RAIN_CAP_MM, "rain_max_discount": RAIN_MAX_DISCOUNT,
            "categories": [{"max": h, "name": n} for h, n in CATS],
            "event_threshold_sigma": EVENT_Z,
            "dropped_terms": ["treeloss_pct", "co2_anom_ppm"],
            "dropped_reason": "No tree-loss or CO2 column exists in pk_city_monthly_final.csv; "
                              "terms removed and weights renormalised, nothing estimated.",
            "weight_set_rank_correlation": rho,
            "disclaimer": "Satellite/model composite, not a regulatory AQI. Not yet validated "
                          "against ground monitors (OpenAQ / US Embassy)."},
        "ranking_latest": ranking, "cities": cities}

    for rel in OUT_DIRS:
        path = os.path.join(ROOT, rel)
        os.makedirs(path, exist_ok=True)
        with open(os.path.join(path, "pollution_index.json"), "w") as f:
            json.dump(out, f, separators=(",", ":"))
    print("PI built:", len(cities), "cities | rank corr across weight sets:", rho)
    for r in ranking:
        c = cities[r["city"]]
        print(f"  {r['city']:<11} latest {r['pi']:5.1f}  mean {c['mean']:5.1f}  "
              f"trend {c['trend']['slope_per_year']:+.2f}/yr p={c['trend']['p']}  "
              f"peaks {len(c['peaks'])} dips {len(c['dips'])}  peak-month {c['peak_month']}")


if __name__ == "__main__":
    main()
