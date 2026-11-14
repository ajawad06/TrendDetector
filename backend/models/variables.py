"""
Trend Detector — Variable models
SRD §2.1 Variables, §8 Why This Matters, §7 Percentage-change rule
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from .common import TemporalCoverage


class VariableBase(BaseModel):
    """Core variable definition from the catalog."""
    id: str = Field(..., description="Unique variable identifier", examples=["rainfall"])
    name: str = Field(..., description="Display name", examples=["Rainfall"])
    dataset: str = Field(..., description="Primary dataset name", examples=["GPM IMERG Final Monthly V07"])
    provider: str = Field(..., description="Data provider", examples=["NASA GES DISC"])
    data_type: str = Field(..., description="satellite | model_reanalysis | reference")
    unit: str = Field(..., description="Native unit", examples=["mm/month"])
    priority: str = Field(..., description="P0 | P1 | P2")
    pct_change_ok: bool = Field(..., description="Whether percentage change is scientifically appropriate")
    temporal_coverage: TemporalCoverage
    available_regions: List[str] = Field(..., description="Region IDs with prepared data")


class VariableDetail(VariableBase):
    """Full variable detail including impact text and disclaimers (SRD §8)."""
    why_it_matters: str = Field(
        ...,
        description="Variable-specific educational impact explanation (SRD §8 FR-IMPACT-001)"
    )
    disclaimer: str = Field(
        default="A trend does not by itself prove its cause or guarantee it will continue.",
        description="Scientific disclaimer (SRD §7 FR-STORY-004)"
    )
    description: str = Field("", description="One-line description of what this variable measures")
    doi: Optional[str] = Field(None, description="Dataset DOI or product page URL")
    mission_or_instrument: str = Field("", description="NASA mission or instrument name")
    citation: str = Field("", description="Recommended citation text")


class VariableListResponse(BaseModel):
    """Response for GET /api/variables."""
    variables: List[VariableBase]
    count: int
