"""
Trend Detector — Comparison / Trend Opposites models
SRD §9 Trend Opposites Explorer
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from .analysis import AnalysisResult


class ComparisonVerdict(BaseModel):
    """Whether trends agree, differ or are opposite (SRD §9 FR-OPP-003)."""
    relationship: str = Field(
        ...,
        description="opposite | same_direction_different_rate | same_direction_similar_rate | mixed_significance"
    )
    narrative: str = Field(
        ...,
        description="Plain-language comparison statement"
    )
    region_a_direction: str = Field(..., description="increasing | decreasing | no_significant_trend")
    region_b_direction: str = Field(..., description="increasing | decreasing | no_significant_trend")
    region_a_color: str = Field("grey", description="blue | orange | grey")
    region_b_color: str = Field("grey", description="blue | orange | grey")


class ComparisonPreset(BaseModel):
    """A preset comparison for quick access (SRD §9)."""
    id: str
    name: str
    variable: str
    region_a: str
    region_b: str
    region_a_name: str
    region_b_name: str
    insight: str


class ComparisonResult(BaseModel):
    """Full comparison result (SRD §9 FR-OPP-001 through FR-OPP-006)."""
    variable: str
    variable_name: str
    region_a: AnalysisResult
    region_b: AnalysisResult
    verdict: ComparisonVerdict
    disclaimer: str = "A trend does not by itself prove its cause or guarantee it will continue."


class ComparisonRequest(BaseModel):
    """Request body for POST /api/compare."""
    variable: str
    region_a: str
    region_b: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    use_anomalies: bool = True


class ComparisonPresetsResponse(BaseModel):
    """Response for GET /api/compare/presets."""
    presets: List[ComparisonPreset]
    count: int
