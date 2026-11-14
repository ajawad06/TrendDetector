"""
Trend Detector — Regions Router
SRD §15: Data Acquisition and Pakistan Support
"""

from fastapi import APIRouter, Query
from typing import Optional
from services.data_service import data_service
from core.exceptions import RegionNotFoundError

router = APIRouter(prefix="/api/regions", tags=["Regions"])


@router.get("")
async def list_regions(
    country: Optional[str] = Query(None, description="Filter by country"),
    variable: Optional[str] = Query(None, description="Filter by available variable"),
):
    """
    List all available regions.
    SRD §15 FR-PAK-001: Pakistan as selectable country.
    SRD §15 FR-PAK-002: At least four Pakistan-focused preset regions.
    """
    regions = data_service.get_regions()

    if country:
        regions = [r for r in regions if r.get("country", "").lower() == country.lower()]

    if variable:
        regions = [r for r in regions if variable in r.get("available_variables", [])]

    return {
        "regions": regions,
        "count": len(regions)
    }


@router.get("/{region_id}")
async def get_region(region_id: str):
    """
    Get detailed information about a specific region.
    Includes boundary type, aggregation method, and available variables.
    SRD §15 FR-PAK-006.
    """
    region = data_service.get_region(region_id)
    if not region:
        raise RegionNotFoundError(region_id)
    return region
