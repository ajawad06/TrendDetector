"""
Trend Detector — Dataset / NASA Showcase models
SRD §10 NASA Data Showcase
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from .common import TemporalCoverage


class DatasetCard(BaseModel):
    """A NASA dataset card for the showcase (SRD §10 FR-NASA-001 through FR-NASA-005)."""
    id: str
    mission_or_instrument: str = Field(..., examples=["GPM (Global Precipitation Measurement)"])
    product_name: str = Field(..., examples=["IMERG Final Monthly V07"])
    measured_variable: str = Field(..., examples=["Precipitation"])
    temporal_coverage: TemporalCoverage
    provider: str = Field(..., examples=["NASA GES DISC"])
    data_type: str = Field(..., description="NASA satellite | NASA model/reanalysis | Non-NASA reference")
    url: str = Field(..., description="Link to the dataset page")
    doi: Optional[str] = None
    citation: str = Field("", description="Recommended citation")
    used_in_demo: bool = Field(True, description="Whether this dataset is used in the submitted version")


class DatasetListResponse(BaseModel):
    """Response for GET /api/datasets."""
    datasets: List[DatasetCard]
    count: int
