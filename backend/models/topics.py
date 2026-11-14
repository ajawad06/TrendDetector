"""
Trend Detector — Topic / Investigation models
SRD §5.2 Investigation wizard
"""

from pydantic import BaseModel, Field
from typing import Optional, List


class TopicRecommendation(BaseModel):
    """Recommendation for a topic (SRD §5.2 FR-FLOW-003)."""
    variables: List[str] = Field(..., description="Up to 3 recommended variable IDs")
    variable_names: List[str] = Field(..., description="Display names")
    regions: List[str] = Field(..., description="Up to 3 recommended region IDs")
    region_names: List[str] = Field(..., description="Display names")
    reason: str = Field(
        ...,
        description="Plain-language reason for the recommendation",
        examples=["NO₂ and AOD directly measure pollution and haze."]
    )


class Topic(BaseModel):
    """An investigation topic (SRD §5.2 FR-FLOW-002)."""
    id: str
    name: str = Field(..., examples=["Air Pollution"])
    icon: str = Field("🔍", examples=["💨"])
    available: bool = Field(True, description="False if no data available — shown as 'coming soon'")
    description: str = Field("", description="One-line description")
    recommendation: TopicRecommendation


class TopicListResponse(BaseModel):
    """Response for GET /api/topics."""
    topics: List[Topic]
    count: int


class ExportRequest(BaseModel):
    """Request for export endpoints (SRD §18)."""
    variable: str
    region: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    use_anomalies: bool = True
    format: str = Field("csv", description="csv | text | markdown")
