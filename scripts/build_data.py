#!/usr/bin/env python3
"""
build_data.py — Data Layer Build & Validation Script for Trend Detector

Reads data/raw/pk_city_monthly_final.csv, performs strict validation,
and writes frontend/data/series.json and frontend/data/regions.json.

Validation fails loudly if:
- Columns differ from expected schema
- Any city does not have exactly 240 consecutive months (2005-01 to 2024-12)
- Any value is null or non-numeric
- City coordinates change across rows
No filling, no interpolation, and no resampling are permitted.
"""

import sys
import os
import csv
import json
from collections import defaultdict

EXPECTED_COLUMNS = ['month', 'pm25', 'aod', 'rain_mm', 'no2', 'city', 'lat', 'lon']
EXPECTED_VARIABLES = ['pm25', 'aod', 'rain_mm', 'no2']
EXPECTED_MONTHS_COUNT = 240
START_MONTH = "2005-01-01"
END_MONTH = "2024-12-01"

EXPECTED_CITIES = {
    "Lahore": {"lat": 31.52, "lon": 74.36},
    "Karachi": {"lat": 24.86, "lon": 67.01},
    "Islamabad": {"lat": 33.68, "lon": 73.05},
    "Peshawar": {"lat": 34.01, "lon": 71.58},
    "Quetta": {"lat": 30.18, "lon": 66.98},
    "Faisalabad": {"lat": 31.42, "lon": 73.08},
    "Multan": {"lat": 30.20, "lon": 71.47},
    "Hyderabad": {"lat": 25.40, "lon": 68.37}
}

def generate_expected_months():
    months = []
    for y in range(2005, 2025):
        for m in range(1, 13):
            months.append(f"{y:04d}-{m:02d}-01")
    return months

def validate_and_build(csv_path):
    print(f"--> Validating raw dataset: {csv_path}")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"FATAL: Raw dataset not found at {csv_path}")

    expected_timeline = generate_expected_months()
    assert len(expected_timeline) == EXPECTED_MONTHS_COUNT

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header != EXPECTED_COLUMNS:
            raise ValueError(f"FATAL: Column schema mismatch! Expected {EXPECTED_COLUMNS}, got {header}")

        rows = list(reader)

    print(f"--> Total records in CSV: {len(rows)}")
    city_rows = defaultdict(list)
    
    for row_idx, r in enumerate(rows, start=2):
        if len(r) != len(EXPECTED_COLUMNS):
            raise ValueError(f"FATAL at line {row_idx}: Row has {len(r)} columns, expected {len(EXPECTED_COLUMNS)}")
        
        month, pm25_s, aod_s, rain_s, no2_s, city, lat_s, lon_s = r
        
        # Check non-empty strings
        for val, col in zip(r, EXPECTED_COLUMNS):
            if val is None or val.strip() == "":
                raise ValueError(f"FATAL at line {row_idx}: Null or empty value in column '{col}'")
        
        # Check numeric conversions
        try:
            pm25 = float(pm25_s)
            aod = float(aod_s)
            rain_mm = float(rain_s)
            no2 = float(no2_s)
            lat = round(float(lat_s), 4)
            lon = round(float(lon_s), 4)
        except ValueError as e:
            raise ValueError(f"FATAL at line {row_idx}: Non-numeric value in record: {e}")

        # Check for NaN / Infinity
        for col_name, num_val in [("pm25", pm25), ("aod", aod), ("rain_mm", rain_mm), ("no2", no2), ("lat", lat), ("lon", lon)]:
            if num_val != num_val or abs(num_val) == float('inf'):
                raise ValueError(f"FATAL at line {row_idx}: Invalid numeric value (NaN/Inf) in column '{col_name}'")

        city_rows[city].append({
            "month": month,
            "pm25": pm25,
            "aod": aod,
            "rain_mm": rain_mm,
            "no2": no2,
            "lat": lat,
            "lon": lon
        })

    # Validate cities
    found_cities = set(city_rows.keys())
    expected_cities_set = set(EXPECTED_CITIES.keys())
    if found_cities != expected_cities_set:
        raise ValueError(f"FATAL: Cities mismatch! Expected {expected_cities_set}, found {found_cities}")

    series_data = {}
    regions_list = []

    for city_name, recs in city_rows.items():
        if len(recs) != EXPECTED_MONTHS_COUNT:
            raise ValueError(f"FATAL: City {city_name} has {len(recs)} months, expected exactly {EXPECTED_MONTHS_COUNT}")
        
        # Check consecutive timeline
        actual_months = [r["month"] for r in recs]
        if actual_months != expected_timeline:
            raise ValueError(f"FATAL: City {city_name} months timeline is broken or non-consecutive!")

        # Check lat/lon consistency
        expected_coord = EXPECTED_CITIES[city_name]
        for idx, r in enumerate(recs):
            if abs(r["lat"] - expected_coord["lat"]) > 0.01 or abs(r["lon"] - expected_coord["lon"]) > 0.01:
                raise ValueError(f"FATAL: Inconsistent coordinates for {city_name} at month {r['month']}: expected {expected_coord}, got ({r['lat']}, {r['lon']})")

        city_id = city_name.lower()
        regions_list.append({
            "id": city_id,
            "name": city_name,
            "lat": expected_coord["lat"],
            "lon": expected_coord["lon"],
            "boundary_type": "point",
            "n_observations": EXPECTED_MONTHS_COUNT,
            "period": {"start": START_MONTH, "end": END_MONTH}
        })

        series_data[city_id] = {
            "name": city_name,
            "lat": expected_coord["lat"],
            "lon": expected_coord["lon"],
            "variables": {
                "pm25": [{"date": r["month"], "value": r["pm25"]} for r in recs],
                "aod": [{"date": r["month"], "value": r["aod"]} for r in recs],
                "rain_mm": [{"date": r["month"], "value": r["rain_mm"]} for r in recs],
                "no2": [{"date": r["month"], "value": r["no2"]} for r in recs]
            }
        }

    # Verify zero rain preserved
    total_zeros = sum(1 for c in series_data.values() for p in c["variables"]["rain_mm"] if p["value"] == 0.0)
    print(f"--> Verified legitimate rain_mm zeros preserved: {total_zeros} (expected 39)")
    if total_zeros != 39:
        raise ValueError(f"FATAL: Expected exactly 39 legitimate rain_mm zero values, found {total_zeros}")

    # Output targets
    output_dirs = [os.path.join("frontend", "data")]
    for od in output_dirs:
        os.makedirs(od, exist_ok=True)
        series_file = os.path.join(od, "series.json")
        regions_file = os.path.join(od, "regions.json")
        
        with open(series_file, "w", encoding="utf-8") as f:
            json.dump(series_data, f, indent=2)
        with open(regions_file, "w", encoding="utf-8") as f:
            json.dump({"regions": regions_list}, f, indent=2)
        print(f"--> Wrote {series_file} and {regions_file}")

    print("\n[SUCCESS] Dataset validated and built cleanly with 0 synthetic values!")

if __name__ == "__main__":
    raw_csv = os.path.join("data", "raw", "pk_city_monthly_final.csv")
    if len(sys.argv) > 1:
        raw_csv = sys.argv[1]
    try:
        validate_and_build(raw_csv)
    except Exception as ex:
        print(f"ERROR: {ex}", file=sys.stderr)
        sys.exit(1)
