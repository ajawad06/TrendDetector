"""
Trend Detector — Hotspots and Featured Story Router
SRD §14: Featured Trends and Story
"""

from fastapi import APIRouter
from services.data_service import data_service

router = APIRouter(prefix="/api", tags=["Hotspots & Stories"])


@router.get("/hotspots")
async def list_hotspots():
    """
    List curated global trend hotspots based on precomputed, verified analyses.
    SRD §14 FR-HOT-001 through FR-HOT-005.
    """
    hotspots = data_service.get_hotspots()
    return {
        "hotspots": hotspots,
        "count": len(hotspots)
    }


@router.get("/featured-story")
async def get_featured_story():
    """
    Get the Earth Story of the Week.
    SRD §14 FR-STORYWEEK-001 through FR-STORYWEEK-004.
    """
    story = {
        "id": "lahore_smog_investigation",
        "title": "The Lahore Smog Mystery: Is Air Pollution Really Rising?",
        "question": "Is aerosol optical depth (smog & haze) intensifying over the Lahore airshed?",
        "variable": "aod",
        "variable_name": "Aerosol Optical Depth",
        "region": "lahore_airshed",
        "region_name": "Lahore Metropolitan Airshed",
        "period": {
            "start": "2000-03",
            "end": "2024-12"
        },
        "trend_result": "Aerosol optical depth increased by +0.008 per year over the Lahore airshed.",
        "significance_verdict": "Statistically significant at the 95% confidence level (p < 0.01).",
        "mission_id": "lahore_smog",
        "image_caption": "MODIS Terra Satellite retrieval showing aerosol plume over Eastern Punjab during winter post-harvest inversion.",
        "last_updated": "2026-11-10"
    }
    return {"story": story}
