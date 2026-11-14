"""
Trend Detector — Trend Story models
SRD §7 Trend Story Generator, §8 Why This Matters
"""

from pydantic import BaseModel, Field
from typing import Optional, List


class TrendStoryCard(BaseModel):
    """The four-question result card (SRD §7 FR-STORY-001 through FR-STORY-006)."""
    what_changed: str = Field(
        ..., description="What variable changed", examples=["Nitrogen dioxide levels increased."]
    )
    where: str = Field(
        ..., description="Where it changed", examples=["Lahore Metropolitan Region."]
    )
    how_much: str = Field(
        ..., description="Magnitude of change", examples=["+18% since 2015."]
    )
    significant: str = Field(
        ..., description="Significance verdict", examples=["Yes, at the 95% confidence level."]
    )


class TrendStory(BaseModel):
    """Complete trend story with result card, narrative and context."""
    card: TrendStoryCard
    narrative: str = Field(
        ...,
        description="Full plain-language story sentence (SRD §7 wording templates)"
    )
    why_it_matters: str = Field(
        ...,
        description="Variable-specific impact explanation (SRD §8)"
    )
    disclaimer: str = Field(
        "A trend does not by itself prove its cause or guarantee it will continue.",
        description="Scientific disclaimer (SRD §7 FR-STORY-004)"
    )
    show_the_numbers: dict = Field(
        ...,
        description="Expandable statistics section (SRD §7 FR-STORY-005)"
    )
    comparison_narrative: Optional[str] = Field(
        None,
        description="Narrative for opposite/comparison trends (SRD §9)"
    )


class TrendStoryResponse(BaseModel):
    """Response for GET /api/story/{variable}/{region}."""
    story: TrendStory
    variable: str
    region: str
    period_start: str
    period_end: str
