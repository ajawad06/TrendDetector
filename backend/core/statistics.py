"""
Trend Detector — Statistical Analysis Engine
SRD §16: OLS, Mann-Kendall, Theil-Sen, autocorrelation, anomalies.

This module provides all statistical computations for the backend.
The frontend mirrors these in src/lib/stats.js for instant browser-side updates.
"""

import numpy as np
from scipy import stats as sp_stats
from typing import Optional, Tuple, List, Dict, Any
import math


# ────────────────────────────────────────────────────────
# 1. OLS Linear Regression (SRD §16.1)
# ────────────────────────────────────────────────────────

def compute_ols(
    times: np.ndarray,
    values: np.ndarray,
    unit: str,
    pct_change_ok: bool = True,
    period_years: float = 1.0
) -> Dict[str, Any]:
    """
    Ordinary Least Squares linear regression with t-test and 95% CI.

    Args:
        times: Numeric time axis (e.g., fractional years).
        values: Corresponding data values (no NaNs).
        unit: Native unit string.
        pct_change_ok: Whether percentage change is meaningful for this variable.
        period_years: Length of the analysis period in years.

    Returns:
        Dict with slope_per_year, intercept, p_value, ci_95, r_squared, total_change.
    """
    n = len(values)
    if n < 3:
        return _empty_ols(unit)

    slope, intercept, r_value, p_value, std_err = sp_stats.linregress(times, values)

    # 95% confidence interval for the slope
    t_crit = sp_stats.t.ppf(0.975, df=n - 2)
    ci_lower = slope - t_crit * std_err
    ci_upper = slope + t_crit * std_err

    # Total change over the period
    total_change = slope * period_years

    # Percentage change (only if scientifically appropriate)
    total_change_pct = None
    if pct_change_ok:
        baseline_value = intercept  # value at start of period
        if abs(baseline_value) > 1e-10:
            total_change_pct = round((total_change / abs(baseline_value)) * 100, 1)

    return {
        "slope_per_year": round(slope, 6),
        "slope_unit": f"{unit}/year",
        "intercept": round(intercept, 4),
        "p_value": round(float(p_value), 6),
        "ci_95_lower": round(ci_lower, 6),
        "ci_95_upper": round(ci_upper, 6),
        "r_squared": round(r_value ** 2, 4),
        "total_change": round(total_change, 4),
        "total_change_pct": total_change_pct
    }


def _empty_ols(unit: str) -> Dict[str, Any]:
    return {
        "slope_per_year": 0.0, "slope_unit": f"{unit}/year",
        "intercept": 0.0, "p_value": 1.0,
        "ci_95_lower": 0.0, "ci_95_upper": 0.0,
        "r_squared": 0.0, "total_change": 0.0, "total_change_pct": None
    }


# ────────────────────────────────────────────────────────
# 2. Mann-Kendall Trend Test (SRD §16.1)
# ────────────────────────────────────────────────────────

def compute_mann_kendall(values: np.ndarray) -> Dict[str, Any]:
    """
    Mann-Kendall nonparametric trend test.

    Returns direction, Z statistic, p-value and Kendall's tau.
    """
    n = len(values)
    if n < 4:
        return {"direction": "insufficient_data", "z_statistic": 0.0, "p_value": 1.0, "tau": 0.0}

    # Compute S statistic
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            diff = values[j] - values[i]
            if diff > 0:
                s += 1
            elif diff < 0:
                s -= 1

    # Compute variance of S
    # Account for ties
    unique, counts = np.unique(values, return_counts=True)
    tie_sum = sum(t * (t - 1) * (2 * t + 5) for t in counts if t > 1)
    var_s = (n * (n - 1) * (2 * n + 5) - tie_sum) / 18.0

    # Compute Z statistic
    if s > 0:
        z = (s - 1) / math.sqrt(var_s) if var_s > 0 else 0.0
    elif s < 0:
        z = (s + 1) / math.sqrt(var_s) if var_s > 0 else 0.0
    else:
        z = 0.0

    # Two-tailed p-value
    p_value = 2.0 * (1.0 - sp_stats.norm.cdf(abs(z)))

    # Kendall's tau
    n_pairs = n * (n - 1) / 2
    tau = s / n_pairs if n_pairs > 0 else 0.0

    # Direction
    if p_value < 0.05:
        direction = "increasing" if s > 0 else "decreasing"
    else:
        direction = "no_trend"

    return {
        "direction": direction,
        "z_statistic": round(z, 4),
        "p_value": round(float(p_value), 6),
        "tau": round(tau, 4)
    }


# ────────────────────────────────────────────────────────
# 3. Theil-Sen Estimator (SRD §16.1)
# ────────────────────────────────────────────────────────

def compute_theil_sen(times: np.ndarray, values: np.ndarray, unit: str) -> Dict[str, Any]:
    """
    Theil-Sen median slope estimator — robust to outliers.

    Args:
        times: Numeric time axis (fractional years).
        values: Corresponding data values (no NaNs).
        unit: Native unit string.

    Returns:
        Dict with slope_per_year and slope_unit.
    """
    n = len(values)
    if n < 3:
        return {"slope_per_year": 0.0, "slope_unit": f"{unit}/year"}

    # Compute all pairwise slopes
    slopes = []
    for i in range(n):
        for j in range(i + 1, n):
            dt = times[j] - times[i]
            if abs(dt) > 1e-10:
                slopes.append((values[j] - values[i]) / dt)

    if not slopes:
        return {"slope_per_year": 0.0, "slope_unit": f"{unit}/year"}

    median_slope = float(np.median(slopes))

    return {
        "slope_per_year": round(median_slope, 6),
        "slope_unit": f"{unit}/year"
    }


# ────────────────────────────────────────────────────────
# 4. Autocorrelation (SRD §16.1, §16.3)
# ────────────────────────────────────────────────────────

def compute_autocorrelation(
    times: np.ndarray,
    values: np.ndarray,
    threshold: float = 0.3
) -> Dict[str, Any]:
    """
    Compute lag-1 autocorrelation of OLS residuals.

    SRD §16.3: Strong residual autocorrelation triggers a warning
    and optionally provides an adjusted p-value.
    """
    n = len(values)
    if n < 10:
        return {
            "lag1": 0.0, "warning": False,
            "message": "Too few observations for autocorrelation assessment.",
            "effective_n": n, "adjusted_p_value": None
        }

    # Compute OLS residuals
    slope, intercept, _, _, _ = sp_stats.linregress(times, values)
    residuals = values - (slope * times + intercept)

    # Lag-1 autocorrelation
    r1 = float(np.corrcoef(residuals[:-1], residuals[1:])[0, 1])

    # Effective sample size (Bretherton et al., 1999)
    if abs(r1) < 1.0:
        effective_n = max(3, int(n * (1 - r1) / (1 + r1)))
    else:
        effective_n = 3

    # Adjusted p-value using effective N
    adjusted_p = None
    if effective_n < n and effective_n >= 3:
        se_adj = np.std(residuals, ddof=1) / (
            np.std(times) * math.sqrt(effective_n - 2)
        ) if np.std(times) > 0 else float('inf')
        if se_adj < float('inf') and se_adj > 0:
            t_stat = slope / se_adj
            adjusted_p = round(float(2 * sp_stats.t.sf(abs(t_stat), df=effective_n - 2)), 6)

    warning = abs(r1) >= threshold
    message = ""
    if warning:
        message = (
            f"Moderate autocorrelation detected (lag-1 = {r1:.2f}). "
            f"Nearby months tend to be similar, which can make the p-value look "
            f"stronger than it is. Effective sample size ≈ {effective_n} "
            f"(vs. {n} actual observations). Interpret significance with caution."
        )

    return {
        "lag1": round(r1, 4),
        "warning": warning,
        "message": message,
        "effective_n": effective_n,
        "adjusted_p_value": adjusted_p
    }


# ────────────────────────────────────────────────────────
# 5. Seasonal Anomalies (SRD §16.2)
# ────────────────────────────────────────────────────────

def compute_anomalies(
    dates: List[str],
    values: List[Optional[float]],
    baseline_start: Optional[str] = None,
    baseline_end: Optional[str] = None
) -> Tuple[List[Optional[float]], str, str]:
    """
    Compute monthly anomalies: value - long-term mean of that calendar month.

    Args:
        dates: List of date strings (YYYY-MM).
        values: Corresponding values (None for missing).
        baseline_start: Optional baseline start (YYYY-MM). Defaults to full record.
        baseline_end: Optional baseline end (YYYY-MM). Defaults to full record.

    Returns:
        Tuple of (anomaly_list, baseline_start_used, baseline_end_used).
    """
    if not dates or not values:
        return [], "", ""

    # Determine baseline period
    valid_dates = [d for d, v in zip(dates, values) if v is not None]
    if not valid_dates:
        return [None] * len(values), "", ""

    bs = baseline_start or valid_dates[0]
    be = baseline_end or valid_dates[-1]

    # Compute monthly climatology from baseline period
    monthly_sums: Dict[int, List[float]] = {m: [] for m in range(1, 13)}
    for d, v in zip(dates, values):
        if v is not None and bs <= d <= be:
            month = int(d.split("-")[1])
            monthly_sums[month].append(v)

    monthly_means: Dict[int, float] = {}
    for m, vals in monthly_sums.items():
        monthly_means[m] = sum(vals) / len(vals) if vals else 0.0

    # Compute anomalies
    anomalies = []
    for d, v in zip(dates, values):
        if v is not None:
            month = int(d.split("-")[1])
            anom = v - monthly_means.get(month, 0.0)
            anomalies.append(round(anom, 4))
        else:
            anomalies.append(None)

    return anomalies, bs, be


# ────────────────────────────────────────────────────────
# 6. Significance Verdict (SRD §16.3)
# ────────────────────────────────────────────────────────

def determine_significance(
    ols_p: float,
    mk_direction: str,
    mk_p: float,
    n_observations: int,
    lag1_autocorr: float,
    cadence: str = "monthly",
    alpha: float = 0.05
) -> Dict[str, Any]:
    """
    Determine overall significance verdict following SRD §16.3 rules.
    """
    min_obs = 120 if cadence == "monthly" else 10
    exploratory = n_observations < min_obs

    caveats = []
    if exploratory:
        caveats.append(
            f"Only {n_observations} observations available "
            f"(minimum {min_obs} for a primary significance verdict). "
            f"This result is exploratory only."
        )

    if abs(lag1_autocorr) >= 0.3:
        caveats.append(
            f"Residual autocorrelation (lag-1 = {lag1_autocorr:.2f}) "
            f"may inflate the apparent significance. Interpret with caution."
        )

    # Determine verdict
    if exploratory:
        verdict = "insufficient_data"
    elif ols_p < alpha and mk_p < alpha:
        # Both tests agree
        if mk_direction == "increasing":
            verdict = "significant_increase"
        elif mk_direction == "decreasing":
            verdict = "significant_decrease"
        else:
            verdict = "no_significant_trend"
    elif ols_p < alpha or mk_p < alpha:
        # Tests disagree — use the more conservative result
        if ols_p >= alpha:
            verdict = "no_significant_trend"
            caveats.append(
                "The Mann-Kendall test suggests a trend, but the OLS test does not confirm it at the 95% level."
            )
        else:
            verdict = "no_significant_trend"
            caveats.append(
                "The OLS test suggests a trend, but the Mann-Kendall test does not confirm it at the 95% level."
            )
    else:
        verdict = "no_significant_trend"

    return {
        "verdict": verdict,
        "confidence_level": 1.0 - alpha,
        "exploratory_only": exploratory,
        "caveats": caveats
    }


# ────────────────────────────────────────────────────────
# 7. Full Analysis Pipeline
# ────────────────────────────────────────────────────────

def run_full_analysis(
    dates: List[str],
    values: List[Optional[float]],
    unit: str,
    pct_change_ok: bool = True,
    cadence: str = "monthly",
    use_anomalies: bool = True,
    baseline_start: Optional[str] = None,
    baseline_end: Optional[str] = None
) -> Dict[str, Any]:
    """
    Run the complete statistical analysis pipeline.

    Returns all results needed for the analysis response model.
    """
    # Filter valid (non-null) observations
    valid_pairs = [(d, v) for d, v in zip(dates, values) if v is not None]
    n_total = len(dates)
    n_valid = len(valid_pairs)
    n_missing = n_total - n_valid
    pct_missing = round((n_missing / n_total) * 100, 1) if n_total > 0 else 0.0

    if n_valid < 3:
        return _empty_analysis(unit, n_total, n_valid, n_missing, pct_missing)

    valid_dates = [d for d, _ in valid_pairs]
    valid_values = np.array([v for _, v in valid_pairs], dtype=float)

    # Compute anomalies if requested
    baseline_start_used = ""
    baseline_end_used = ""
    if use_anomalies:
        anomalies, baseline_start_used, baseline_end_used = compute_anomalies(
            dates, values, baseline_start, baseline_end
        )
        # Re-extract valid anomalies
        anom_valid = [(d, a) for d, a in zip(dates, anomalies) if a is not None]
        if anom_valid:
            valid_dates = [d for d, _ in anom_valid]
            valid_values = np.array([a for _, a in anom_valid], dtype=float)
            n_valid = len(valid_dates)

    # Convert dates to fractional years for regression
    times = np.array([_date_to_fractional_year(d) for d in valid_dates])
    period_years = times[-1] - times[0] if len(times) > 1 else 1.0

    # Run all analyses
    ols = compute_ols(times, valid_values, unit, pct_change_ok, period_years)
    mk = compute_mann_kendall(valid_values)
    ts = compute_theil_sen(times, valid_values, unit)
    ac = compute_autocorrelation(times, valid_values)
    sig = determine_significance(
        ols["p_value"], mk["direction"], mk["p_value"],
        n_valid, ac["lag1"], cadence
    )

    return {
        "n_total": n_total,
        "n_valid": n_valid,
        "n_missing": n_missing,
        "pct_missing": pct_missing,
        "ols": ols,
        "mann_kendall": mk,
        "theil_sen": ts,
        "autocorrelation": ac,
        "significance": sig,
        "baseline_start": baseline_start_used,
        "baseline_end": baseline_end_used,
        "uses_anomalies": use_anomalies,
        "period_start": dates[0] if dates else "",
        "period_end": dates[-1] if dates else ""
    }


def _date_to_fractional_year(date_str: str) -> float:
    """Convert YYYY-MM to a fractional year (e.g., 2020-07 → 2020.5)."""
    parts = date_str.split("-")
    year = int(parts[0])
    month = int(parts[1]) if len(parts) > 1 else 1
    return year + (month - 0.5) / 12.0


def _empty_analysis(unit, n_total, n_valid, n_missing, pct_missing):
    """Return empty analysis for insufficient data."""
    return {
        "n_total": n_total, "n_valid": n_valid,
        "n_missing": n_missing, "pct_missing": pct_missing,
        "ols": _empty_ols(unit),
        "mann_kendall": {"direction": "insufficient_data", "z_statistic": 0.0, "p_value": 1.0, "tau": 0.0},
        "theil_sen": {"slope_per_year": 0.0, "slope_unit": f"{unit}/year"},
        "autocorrelation": {"lag1": 0.0, "warning": False, "message": "", "effective_n": 0, "adjusted_p_value": None},
        "significance": {"verdict": "insufficient_data", "confidence_level": 0.95, "exploratory_only": True, "caveats": ["Insufficient valid observations for analysis."]},
        "baseline_start": "", "baseline_end": "",
        "uses_anomalies": False,
        "period_start": "", "period_end": ""
    }
