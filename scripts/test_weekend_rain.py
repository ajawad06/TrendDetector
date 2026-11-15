#!/usr/bin/env python3
"""Tests 'rain falls more on weekends'. Needs internet (Open-Meteo archive, free, no key). Not run by the site."""
import requests, pandas as pd
from scipy import stats
CITIES = {"Lahore": (31.52, 74.36), "Karachi": (24.86, 67.01), "Islamabad": (33.68, 73.05), "Peshawar": (34.01, 71.58),
          "Quetta": (30.18, 66.98), "Faisalabad": (31.42, 73.08), "Multan": (30.20, 71.47), "Hyderabad": (25.40, 68.37)}
for city, (lat, lon) in CITIES.items():
    j = requests.get("https://archive-api.open-meteo.com/v1/archive", params={"latitude": lat, "longitude": lon, "start_date": "2005-01-01",
        "end_date": "2024-12-31", "daily": "precipitation_sum", "timezone": "GMT"}, timeout=60).json()["daily"]
    d = pd.DataFrame({"date": pd.to_datetime(j["time"]), "rain": j["precipitation_sum"]}).dropna()
    d["dow"] = d.date.dt.dayofweek; d["weekend"] = d.dow >= 5
    wet = d[d.rain >= 1]
    p = stats.kruskal(*[wet[wet.dow == k].rain for k in range(7)]).pvalue
    print(f"{city:<11} wet-day share weekend {wet.weekend.mean():.3f} (expected 0.286) | mean rain on wet days: weekday {wet[~wet.weekend].rain.mean():.1f} mm, weekend {wet[wet.weekend].rain.mean():.1f} mm | Kruskal p={p:.3f}")
