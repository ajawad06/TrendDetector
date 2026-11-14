"""
Trend Detector — Analysis Router
Runs the full statistical analysis pipeline.
SRD §16: Statistical Analysis
"""

from fastapi import APIRouter, Query
from typing import Optional
from services.analysis_service import analysis_service

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])


@router.get("/{variable_id}/{region_id}")
async def get_analysis(
    variable_id: str,
    region_id: str,
    start_date: Optional[str] = Query(None, description="Override start date (YYYY-MM)"),
    end_date: Optional[str] = Query(None, description="Override end date (YYYY-MM)"),
    use_anomalies: bool = Query(True, description="Whether to use seasonal anomalies"),
):
    """
    Run complete trend analysis for a variable × region.

    Returns OLS regression, Mann-Kendall test, Theil-Sen slope,
    autocorrelation, significance verdict, and confidence meter.
    (SRD §16 FR-STAT-001 through FR-STAT-010)
    """
    result = analysis_service.analyze(
        variable_id=variable_id,
        region_id=region_id,
        start_date=start_date,
        end_date=end_date,
        use_anomalies=use_anomalies
    )
    return result
