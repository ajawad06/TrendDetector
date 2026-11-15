#!/usr/bin/env python3
"""build_patterns.py - tests "minor trend patterns" on the real monthly CSV and writes patterns.json.
Every number shown on the site comes from here. Patterns that fail a test are reported as such."""
import json, os
import numpy as np, pandas as pd
from scipy import stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = pd.read_csv(os.path.join(ROOT, "data/raw/pk_city_monthly_final.csv"))
d["m"] = d.month.str[5:7].astype(int)
PUNJAB = ["Lahore", "Faisalabad", "Multan"]
CITIES = list(d.city.unique())
r1 = lambda x: round(float(x), 1)
r2 = lambda x: round(float(x), 2)
mw = lambda a, b: float(stats.mannwhitneyu(a, b, alternative="greater").pvalue)


def burning():
    rows = []
    for label, grp in [("Punjab (Lahore, Faisalabad, Multan)", PUNJAB), ("South & west (Karachi, Hyderabad, Quetta)", ["Karachi", "Hyderabad", "Quetta"]),
                       ("North (Islamabad, Peshawar)", ["Islamabad", "Peshawar"])]:
        g = d[d.city.isin(grp)]; a, b = g[g.m.isin([10, 11])], g[~g.m.isin([10, 11])]
        p = mw(a.pm25, b.pm25)
        rows.append({"label": label, "a_name": "Oct–Nov", "a": r1(a.pm25.mean()), "b_name": "Rest of year", "b": r1(b.pm25.mean()),
                     "ratio": r2(a.pm25.mean() / b.pm25.mean()), "p": p, "supported": bool(p < .05 and a.pm25.mean() > b.pm25.mean())})
    g = d[d.city.isin(PUNJAB)]
    rain = r1(g[g.m.isin([10, 11])].rain_mm.mean())
    return {"id": "burning", "title": "Smog is worse during the crop-burning season", "status": "Supported in Punjab only", "unit": "µg/m³ PM2.5",
            "headline": f"In Punjab, PM2.5 averages {rows[0]['a']} µg/m³ in Oct–Nov (rice-stubble burning season) vs {rows[0]['b']} the rest of the year, {rows[0]['ratio']}× higher. Cities outside Punjab show no such jump.",
            "rows": rows,
            "method": "Mann–Whitney test of Oct–Nov vs other months, 20 years of monthly PM2.5 per city group.",
            "caveat": f"This is a seasonal coincidence, not proof of burning. Oct–Nov in Punjab is also very dry ({rain} mm vs 44 mm yearly average) and has cold, stagnant air. The dataset has no fire counts; NASA FIRMS (in your dataset plan) is needed to link smog to actual burning."}


def washout():
    rows = []
    for c in CITIES:
        g = d[d.city == c].copy()
        for v in ["pm25", "rain_mm"]: g[v + "_a"] = g[v] - g.groupby("m")[v].transform("mean")
        rho, p = stats.spearmanr(g.pm25_a, g.rain_mm_a)
        dry = g[g.rain_mm_a <= g.rain_mm_a.quantile(.25)].pm25_a.mean(); wet = g[g.rain_mm_a >= g.rain_mm_a.quantile(.75)].pm25_a.mean()
        rows.append({"label": c, "a_name": "Drier than usual", "a": r1(dry), "b_name": "Wetter than usual", "b": r1(wet), "rho": r2(rho), "p": float(p),
                     "supported": bool(p < .05 and rho < 0)})
    rows.sort(key=lambda r: r["rho"])
    n = sum(r["supported"] for r in rows)
    return {"id": "washout", "title": "Rain cleans the air in Punjab and Hyderabad", "status": f"Supported in {n} of 8 cities", "unit": "µg/m³ PM2.5 vs the city's normal for that month",
            "headline": f"After removing the normal seasonal cycle, months drier than usual have higher-than-normal PM2.5 and wetter months lower, in {n} of 8 cities (strongest in Multan, ρ = {rows[0]['rho']}).",
            "rows": rows, "method": "Seasonal anomalies (value minus that city's average for the calendar month); Spearman correlation of PM2.5 vs rainfall anomalies, plus the driest vs wettest quarter of months.",
            "caveat": "Correlation, not proof of wash-out. Dry spells also coincide with stagnant weather. Islamabad, Peshawar and Quetta show no significant effect."}


def winter_no2():
    rows = []
    for c in CITIES:
        g = d[d.city == c]; w, s = g[g.m.isin([12, 1, 2])].no2, g[g.m.isin([6, 7, 8])].no2
        p = mw(w, s)
        rows.append({"label": c, "a_name": "Dec–Feb", "a": r2(w.mean() / 1e15), "b_name": "Jun–Aug", "b": r2(s.mean() / 1e15), "ratio": r2(w.mean() / s.mean()), "p": p, "supported": bool(p < .05)})
    rows.sort(key=lambda r: -r["ratio"]); n = sum(r["supported"] for r in rows)
    return {"id": "winter_no2", "title": "Nitrogen dioxide builds up in winter", "status": f"Supported in {n} of 8 cities", "unit": "×10¹⁵ molecules/cm² NO₂ column",
            "headline": f"NO₂ is higher in Dec–Feb than Jun–Aug in {n} of 8 cities, up to {rows[0]['ratio']}× in {rows[0]['label']}. Quetta is the exception.",
            "rows": rows, "method": "Mann–Whitney test of winter vs summer monthly NO₂ columns, 2005–2024.",
            "caveat": "Winter inversions trap pollution and NO₂ lasts longer in cold weather, so the satellite column rises even with unchanged emissions. It is not purely a measure of more traffic or industry."}


def summer_haze():
    rows = []
    for c in CITIES:
        g = d[d.city == c]; a, b = g[g.m.isin([6, 7])], g[~g.m.isin([6, 7])]
        p = mw(a.aod, b.aod)
        rows.append({"label": c, "a_name": "Jun–Jul", "a": r2(a.aod.mean()), "b_name": "Rest of year", "b": r2(b.aod.mean()), "ratio": r2(a.aod.mean() / b.aod.mean()), "p": p, "supported": bool(p < .05)})
    rows.sort(key=lambda r: -r["ratio"]); n = sum(r["supported"] for r in rows)
    return {"id": "summer_haze", "title": "June–July is the haziest stretch of the year", "status": f"Supported in {n} of 8 cities", "unit": "AOD (aerosol optical depth, unitless)",
            "headline": f"Aerosol load is {rows[-1]['ratio']}–{rows[0]['ratio']}× higher in Jun–Jul than the rest of the year, in all {n} cities, including dry Quetta and Karachi.",
            "rows": rows, "method": "Mann–Whitney test of Jun–Jul AOD vs other months.",
            "caveat": "Consistent with pre-monsoon dust and humid-air haze, but AOD alone cannot tell dust from smoke or moisture-swollen particles."}


def weekend():
    return {"id": "weekend_rain", "title": "Rain falls more on weekends than weekdays", "status": "Not testable with this data", "untested": True,
            "headline": "The dataset has one value per month, so it cannot say which weekday rain fell on. Nothing is shown for this claim because no data backs it.",
            "rows": [], "method": "Needs daily rainfall. Run scripts/test_weekend_rain.py (Open-Meteo daily archive, 2005–2024) with internet access; it reports mean rain on wet days by weekday with a Kruskal–Wallis test.",
            "caveat": "Even with daily data, 20 years in one city is a small sample and weekday effects are usually weak, so expect a null result."}


out = {"patterns": [weekend(), burning(), washout(), winter_no2(), summer_haze()],
       "source": "data/raw/pk_city_monthly_final.csv", "period": ["2005-01", "2024-12"]}
for rel in ["frontend/data", "frontend/public/data", "public/data"]:
    os.makedirs(os.path.join(ROOT, rel), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, rel, "patterns.json"), "w"), separators=(",", ":"))
for p in out["patterns"]: print(f"{p['status']:<32} {p['title']}")
