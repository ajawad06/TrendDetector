"""
Trend Detector — Data Router
Serves prepared time series data.
SRD §4, §15, §17
"""

from fastapi import APIRouter, Query
from typing import Optional
from services.data_service import data_service
from core.exceptions import DataNotAvailableError, VariableNotFoundError, RegionNotFoundError
from core.statistics import compute_anomalies

router = APIRouter(prefix="/api/data", tags=["Data"])


@router.get("/{variable_id}/{region_id}")
async def get_time_series(
    variable_id: str,
    region_id: str,
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM)"),
):
    """
    Get prepared monthly time series for a variable × region combination.

    Returns raw values and seasonal anomalies (SRD §15, §16.2).
    Each data point contains date, value (null if missing), and anomaly.
    Missing data appears as null, never zero or interpolated (SRD FR-QUAL-005).
    """
    # Validate
    variable = data_service.get_variable(variable_id)
    if not variable:
        raise VariableNotFoundError(variable_id)

    region = data_service.get_region(region_id)
    if not region:
        raise RegionNotFoundError(region_id)

    # Load data
    ts_data = data_service.get_time_series(variable_id, region_id, start_date, end_date)
    if not ts_data:
        raise DataNotAvailableError(variable_id, region_id)

    series = ts_data.get("series", [])
    metadata = ts_data.get("metadata", {})

    # Compute anomalies if not already present
    has_anomalies = any(p.get("anomaly") is not None for p in series if p.get("value") is not None)
    if not has_anomalies and series:
        dates = [p["date"] for p in series]
        values = [p.get("value") for p in series]
        baseline_start = metadata.get("baseline_period", {}).get("start") if metadata.get("baseline_period") else None
        baseline_end = metadata.get("baseline_period", {}).get("end") if metadata.get("baseline_period") else None

        anomalies, bs, be = compute_anomalies(dates, values, baseline_start, baseline_end)
        for i, p in enumerate(series):
            p["anomaly"] = anomalies[i] if i < len(anomalies) else None
        if bs and be:
            metadata["baseline_period"] = {"start": bs, "end": be}

    # Compute summary stats
    n_total = len(series)
    n_valid = sum(1 for p in series if p.get("value") is not None)
    n_missing = n_total - n_valid
    pct_missing = round((n_missing / n_total) * 100, 1) if n_total > 0 else 0.0

    return {
        "metadata": {
            "variable": variable_id,
            "region": region_id,
            "unit": variable["unit"],
            "cadence": metadata.get("cadence", "monthly"),
            "dataset": variable["dataset"],
            "dataset_version": metadata.get("dataset_version", "V07"),
            "provider": variable["provider"],
            "data_type": variable["data_type"],
            "retrieval_date": metadata.get("retrieval_date", "2026-11-10"),
            "processing_steps": metadata.get("processing_steps", []),
            "baseline_period": metadata.get("baseline_period"),
            "is_sample_data": metadata.get("is_sample_data", True),
            "citation": variable.get("citation", "")
        },
        "series": series,
        "n_total": n_total,
        "n_valid": n_valid,
        "n_missing": n_missing,
        "pct_missing": pct_missing
    }


@router.get("/{variable_id}/{region_id}/availability")
async def check_availability(variable_id: str, region_id: str):
    """Check if prepared data exists for this variable × region combination."""
    available = data_service.check_data_availability(variable_id, region_id)
    return {
        "variable": variable_id,
        "region": region_id,
        "available": available
    }
