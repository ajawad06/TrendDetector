#!/usr/bin/env python3
"""
make_reference.py — Computes reference statistical results for all 32 series
using standard SciPy and PyMannKendall.
Saves reference values to tests/reference_results.json.
"""

import json
import os
import numpy as np
import scipy.stats as stats
import pymannkendall as pmk

CITIES = ["lahore", "karachi", "islamabad", "peshawar", "quetta", "faisalabad", "multan", "hyderabad"]
VARIABLES = ["pm25", "aod", "rain_mm", "no2"]
UNITS = {
    "pm25": "µg/m³",
    "aod": "dimensionless",
    "rain_mm": "mm/month",
    "no2": "molecules/cm²"
}

def compute_series_stats(dates, values, unit, is_anomaly=False):
    n = len(values)
    times = np.array([int(d[:4]) + (int(d[5:7]) - 0.5) / 12.0 for d in dates], dtype=np.float64)
    
    # 1. OLS Linear Regression
    x_mean = np.mean(times)
    y_mean = np.mean(values)
    ss_xx = np.sum((times - x_mean)**2)
    ss_xy = np.sum((times - x_mean) * (values - y_mean))
    ss_yy = np.sum((values - y_mean)**2)
    slope = float(ss_xy / ss_xx)
    intercept = float(y_mean - slope * x_mean)
    y_pred = slope * times + intercept
    residuals = values - y_pred
    ss_res = np.sum(residuals**2)
    
    r_squared = float(max(0.0, 1.0 - (ss_res / ss_yy))) if ss_yy > 0 else 0.0
    s2 = ss_res / (n - 2)
    se_slope = float(np.sqrt(s2 / ss_xx))
    t_stat = float(abs(slope / se_slope)) if se_slope > 0 else 0.0
    p_value = float(2.0 * stats.t.sf(t_stat, df=n - 2))
    
    # 95% Confidence interval on slope
    t_crit = float(stats.t.ppf(0.975, df=n - 2))
    ci_lower = float(slope - t_crit * se_slope)
    ci_upper = float(slope + t_crit * se_slope)
    
    period_years = 240.0 / 12.0  # 20 full observation years
    total_change = float(slope * period_years)
    total_change_pct = None
    if not is_anomaly and abs(y_mean) > 1e-12:
        total_change_pct = float((total_change / abs(y_mean)) * 100.0)

    # 2. Lag-1 Autocorrelation of residuals
    res_mean = np.mean(residuals)
    num = np.sum((residuals[:-1] - res_mean) * (residuals[1:] - res_mean))
    den = np.sum((residuals - res_mean)**2)
    r1 = float(num / den) if den > 0 else 0.0
    
    # Effective sample size n_eff clamped to [10, n]
    if r1 >= 1.0:
        n_eff = 10.0
    elif r1 <= -1.0:
        n_eff = float(n)
    else:
        n_eff = float(n * (1.0 - r1) / (1.0 + r1))
    n_eff_clamped = float(max(10.0, min(float(n), n_eff)))
    
    # Recomputed p-value using n_eff
    df_eff = max(1.0, n_eff_clamped - 2.0)
    t_stat_adj = t_stat * np.sqrt(df_eff / (n - 2.0))
    p_value_adj = float(2.0 * stats.t.sf(t_stat_adj, df=df_eff))
    
    # 3. Mann-Kendall Trend Test with tie correction
    mk = pmk.original_test(values)
    
    # 4. Theil-Sen Median Slope
    ts_res = stats.theilslopes(values, times)
    ts_slope = float(ts_res[0])
    
    # 5. Linearity check
    non_linear = False
    if abs(ts_slope) > 1e-12:
        rel_diff = abs(slope - ts_slope) / abs(ts_slope)
        non_linear = bool(rel_diff > 0.3)
        
    high_autocorr = bool(abs(r1) >= 0.3)
    
    # Tiered verdict
    if mk.p < 0.05 and p_value_adj < 0.05 and not non_linear and not high_autocorr:
        tier = "significant"
    elif (mk.p < 0.05 or p_value < 0.05):
        tier = "caution"
    else:
        tier = "no_trend"
        
    if tier == "no_trend":
        direction = "stable"
    else:
        direction = "increasing" if slope > 0 else "decreasing"
        
    return {
        "n_observations": n,
        "pct_missing": 0.0,
        "ols": {
            "slope_per_year": slope,
            "slope_unit": f"{unit}/year",
            "intercept": intercept,
            "p_value": p_value,
            "p_value_adjusted": p_value_adj,
            "ci_95_lower": ci_lower,
            "ci_95_upper": ci_upper,
            "r_squared": r_squared,
            "total_change": total_change,
            "total_change_pct": total_change_pct
        },
        "theil_sen": {
            "slope_per_year": ts_slope,
            "slope_unit": f"{unit}/year"
        },
        "mann_kendall": {
            "tau": float(mk.Tau),
            "p_value": float(mk.p),
            "z_statistic": float(mk.z),
            "direction": mk.trend
        },
        "autocorrelation": {
            "r1": r1,
            "n_eff": n_eff_clamped,
            "warning": high_autocorr
        },
        "flags": {
            "non_linear": non_linear,
            "high_autocorrelation": high_autocorr
        },
        "verdict": {
            "tier": tier,
            "direction": direction
        }
    }

def main():
    series_file = os.path.join("frontend", "data", "series.json")
    if not os.path.exists(series_file):
        print(f"File {series_file} not found. Running build_data.py first...")
        import subprocess
        subprocess.run(["python", "scripts/build_data.py"], check=True)
        
    with open(series_file, "r", encoding="utf-8") as f:
        series_data = json.load(f)
        
    results = {}
    
    for city_id in CITIES:
        results[city_id] = {}
        city_info = series_data[city_id]
        
        for var_id in VARIABLES:
            raw_pts = city_info["variables"][var_id]
            dates = [p["date"] for p in raw_pts]
            raw_vals = np.array([p["value"] for p in raw_pts], dtype=np.float64)
            unit = UNITS[var_id]
            
            # Compute climatological anomalies
            months = np.array([int(d[5:7]) for d in dates])
            anom_vals = np.zeros_like(raw_vals)
            month_means = {}
            for m in range(1, 13):
                m_mask = (months == m)
                mean_m = float(np.mean(raw_vals[m_mask]))
                month_means[m] = mean_m
                anom_vals[m_mask] = raw_vals[m_mask] - mean_m
                
            raw_stats = compute_series_stats(dates, raw_vals, unit, is_anomaly=False)
            anom_stats = compute_series_stats(dates, anom_vals, unit, is_anomaly=True)
            
            results[city_id][var_id] = {
                "variable": var_id,
                "region": city_id,
                "unit": unit,
                "period": {"start": "2005-01-01", "end": "2024-12-01"},
                "month_means": month_means,
                "raw": raw_stats,
                "anomalies": anom_stats
            }
            
    out_file = os.path.join("tests", "reference_results.json")
    os.makedirs("tests", exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
        
    print(f"\n[SUCCESS] Generated reference results for 32 series -> {out_file}")

if __name__ == "__main__":
    main()
