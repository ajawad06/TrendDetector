"""
Trend Detector — Hotspot and Featured Story models
SRD §14 Featured Trends and Story
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from .common import TemporalCoverage


class HotspotCard(BaseModel):
    """A global trend hotspot card (SRD §14 FR-HOT-001 through FR-HOT-005)."""
    id: str
    title: str
    variable: str
    variable_name: str
    region: str
    region_name: str
    direction: str = Field(..., description="increasing | decreasing")
    rate: str = Field(..., description="Rate as display string", examples=["+2.1 ppm/year"])
    significance: str = Field(..., description="Significance statement")
    dataset: str
    period: TemporalCoverage
    is_precomputed: bool = Field(True, description="Always true — hotspots use verified results only")
    icon: str = "🌍"


class FeaturedStory(BaseModel):
    """Earth Story of the Week (SRD §14 FR-STORYWEEK-001 through FR-STORYWEEK-004)."""
    id: str
    title: str
    question: str
    variable: str
    variable_name: str
    region: str
    region_name: str
    period: TemporalCoverage
    trend_result: str = Field(..., description="One-sentence trend result")
    significance_verdict: str
    mission_id: Optional[str] = Field(None, description="Mission ID to open for full investigation")
    image_caption: Optional[str] = None
    last_updated: str = Field(..., description="When this story was last verified")


class HotspotListResponse(BaseModel):
    """Response for GET /api/hotspots."""
    hotspots: List[HotspotCard]
    count: int


class FeaturedStoryResponse(BaseModel):
    """Response for GET /api/featured-story."""
    story: FeaturedStory
