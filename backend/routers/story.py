"""
Trend Detector — Story Router
SRD §7: Trend Story Generator
SRD §8: Why This Matters
"""

from fastapi import APIRouter, Query
from typing import Optional
from services.analysis_service import analysis_service
from services.story_service import story_service

router = APIRouter(prefix="/api/story", tags=["Story"])


@router.get("/{variable_id}/{region_id}")
async def get_trend_story(
    variable_id: str,
    region_id: str,
    start_date: Optional[str] = Query(None, description="Override start date (YYYY-MM)"),
    end_date: Optional[str] = Query(None, description="Override end date (YYYY-MM)"),
    use_anomalies: bool = Query(True, description="Whether to use seasonal anomalies"),
):
    """
    Generate a trend story for a variable × region.

    Returns the four-question result card, plain-language narrative,
    "Why This Matters" explanation, and expandable statistics.
    (SRD §7 FR-STORY-001 through FR-STORY-006, §8 FR-IMPACT-001 through FR-IMPACT-005)
    """
    # Run analysis first
    analysis = analysis_service.analyze(
        variable_id=variable_id,
        region_id=region_id,
        start_date=start_date,
        end_date=end_date,
        use_anomalies=use_anomalies
    )

    # Generate story
    story = story_service.generate_story(analysis)

    return {
        "story": story,
        "variable": variable_id,
        "region": region_id,
        "period_start": analysis["period"]["start"],
        "period_end": analysis["period"]["end"]
    }
