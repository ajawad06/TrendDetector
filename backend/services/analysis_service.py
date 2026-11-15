"""
Trend Detector — Analysis Service
Orchestrates the statistical analysis pipeline.
SRD §16: Statistical Analysis
"""

from typing import Optional, Dict, Any, List
from services.data_service import data_service
from services.confidence_service import compute_confidence_meter
from core.statistics import run_full_analysis
from core.exceptions import DataNotAvailableError, VariableNotFoundError, RegionNotFoundError


class AnalysisService:
    """Runs the full analysis pipeline for a variable × region."""

    def analyze(
        self,
        variable_id: str,
        region_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        use_anomalies: bool = True
    ) -> Dict[str, Any]:
        """
        Run complete trend analysis for a variable × region combination.

        Returns a dict matching the AnalysisResult model.
        """
        # Validate variable and region
        variable = data_service.get_variable(variable_id)
        if not variable:
            raise VariableNotFoundError(variable_id)

        region = data_service.get_region(region_id)
        if not region:
            raise RegionNotFoundError(region_id)

        # Load time series
        ts_data = data_service.get_time_series(variable_id, region_id, start_date, end_date)
        if not ts_data:
            raise DataNotAvailableError(variable_id, region_id)

        series = ts_data.get("series", [])
        dates = [p["date"] for p in series]
        values = [p.get("value") for p in series]

        metadata = ts_data.get("metadata", {})

        # Run statistical analysis
        stats = run_full_analysis(
            dates=dates,
            values=values,
            unit=variable["unit"],
            pct_change_ok=variable.get("pct_change_ok", True),
            cadence=metadata.get("cadence", "monthly"),
            use_anomalies=use_anomalies,
            baseline_start=metadata.get("baseline_period", {}).get("start") if metadata.get("baseline_period") else None,
            baseline_end=metadata.get("baseline_period", {}).get("end") if metadata.get("baseline_period") else None,
        )

        # Compute confidence meter
        confidence = compute_confidence_meter(
            n_observations=stats["n_valid"],
            pct_missing=stats["pct_missing"],
            lag1_autocorr=stats["autocorrelation"]["lag1"],
            data_type=variable.get("data_type", "satellite"),
            cadence=metadata.get("cadence", "monthly")
        )

        # Build the full result
        period_start = start_date or (dates[0] if dates else "")
        period_end = end_date or (dates[-1] if dates else "")

        return {
            "variable": variable_id,
            "variable_name": variable["name"],
            "region": region_id,
            "region_name": region["name"],
            "unit": variable["unit"],
            "cadence": metadata.get("cadence", "monthly"),
            "period": {"start": period_start, "end": period_end},
            "n_observations": stats["n_valid"],
            "pct_missing": stats["pct_missing"],
            "dataset": variable.get("dataset") or variable.get("product") or "Source: not specified",
            "dataset_version": metadata.get("dataset_version", "") or variable.get("version") or "",
            "provider": variable.get("provider") or "Source: not specified",
            "data_type": variable.get("data_type", "satellite"),
            "is_sample_data": metadata.get("is_sample_data", False),
            "ols": stats["ols"],
            "mann_kendall": stats["mann_kendall"],
            "theil_sen": stats["theil_sen"],
            "autocorrelation": stats["autocorrelation"],
            "significance": stats["significance"],
            "confidence_meter": confidence,
            "baseline_period": {
                "start": stats["baseline_start"],
                "end": stats["baseline_end"]
            } if stats["baseline_start"] else None,
            "uses_anomalies": stats["uses_anomalies"],
            "disclaimer": variable.get(
                "disclaimer",
                "A trend does not by itself prove its cause or guarantee it will continue."
            )
        }


# Singleton
analysis_service = AnalysisService()
