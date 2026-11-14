"""
Trend Detector — Compare / Trend Opposites Router
SRD §9: Trend Opposites Explorer
"""

from fastapi import APIRouter, Query
from typing import Optional
from pydantic import BaseModel, Field
from services.compare_service import compare_service

router = APIRouter(prefix="/api/compare", tags=["Compare"])


class CompareRequest(BaseModel):
    variable: str
    region_a: str
    region_b: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    use_anomalies: bool = True


@router.get("/presets")
async def get_comparison_presets():
    """
    Get preset comparisons for quick access.
    SRD §9 FR-OPP-005: At least one preset for Pakistan.
    """
    presets = compare_service.get_presets()
    return {
        "presets": presets,
        "count": len(presets)
    }


@router.post("")
async def compare_regions(request: CompareRequest):
    """
    Compare one variable across two regions over an identical period.
    SRD §9 FR-OPP-001 through FR-OPP-006.

    Returns both analyses, trend comparison verdict, and narrative.
    Colours: blue for increasing, orange for decreasing, grey for not significant.
    """
    result = compare_service.compare(
        variable_id=request.variable,
        region_a_id=request.region_a,
        region_b_id=request.region_b,
        start_date=request.start_date,
        end_date=request.end_date,
        use_anomalies=request.use_anomalies
    )
    return result


@router.get("/{variable_id}/{region_a_id}/{region_b_id}")
async def compare_regions_get(
    variable_id: str,
    region_a_id: str,
    region_b_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    use_anomalies: bool = Query(True),
):
    """GET variant of comparison for easy linking and shareable URLs."""
    result = compare_service.compare(
        variable_id=variable_id,
        region_a_id=region_a_id,
        region_b_id=region_b_id,
        start_date=start_date,
        end_date=end_date,
        use_anomalies=use_anomalies
    )
    return result
