"""
Trend Detector — Mission models
SRD §6 Guided Demo Missions
"""

from pydantic import BaseModel, Field
from typing import Optional, List


class MissionConfig(BaseModel):
    """A guided demo mission (SRD §6 FR-DEMO-001 through FR-DEMO-006)."""
    id: str = Field(..., description="Unique mission identifier")
    title: str = Field(..., description="Mission title", examples=["Lahore Smog Mystery"])
    question: str = Field(..., description="Scientific question", examples=["Is air pollution changing over Lahore?"])
    variable: str = Field(..., description="Primary variable ID")
    variable_name: str = Field(..., description="Display name of the variable")
    region: str = Field(..., description="Primary region ID")
    region_name: str = Field(..., description="Display name of the region")
    region_b: Optional[str] = Field(None, description="Second region ID for comparison missions")
    region_b_name: Optional[str] = Field(None, description="Display name of second region")
    dataset: str = Field(..., description="Dataset used")
    treatment: str = Field(
        ...,
        description="What the mission demonstrates",
        examples=["Trend, significance, seasonal pattern, uncertainty"]
    )
    is_comparison: bool = Field(False, description="Whether this is a two-region comparison")
    cadence: str = Field("monthly", description="Data cadence")
    use_anomalies: bool = Field(True, description="Whether to show anomalies by default")
    icon: str = Field("🔍", description="Emoji icon for the mission card")
    description: str = Field("", description="One-sentence description for the card")


class MissionListResponse(BaseModel):
    """Response for GET /api/missions."""
    missions: List[MissionConfig]
    count: int
