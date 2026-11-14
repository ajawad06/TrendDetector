"""
Trend Detector — Region models
SRD §15 Data Acquisition and Pakistan Support
"""

from pydantic import BaseModel, Field
from typing import Optional, List


class BoundingBox(BaseModel):
    """Geographic bounding box [west, south, east, north]."""
    west: float
    south: float
    east: float
    north: float


class RegionBase(BaseModel):
    """Core region definition."""
    id: str = Field(..., description="Unique region identifier", examples=["pakistan"])
    name: str = Field(..., description="Display name", examples=["Pakistan"])
    boundary_type: str = Field(
        ...,
        description="country_polygon | province_boundary | bounding_box | basin_polygon",
        examples=["country_polygon"]
    )
    bbox: BoundingBox
    country: str = Field("Pakistan", description="Parent country")
    available_variables: List[str] = Field(..., description="Variable IDs available for this region")
    boundary_source: str = Field("Natural Earth / GADM", description="Source of boundary data")


class RegionDetail(RegionBase):
    """Full region detail with aggregation info (SRD §15 FR-PAK-006)."""
    aggregation_method: str = Field(
        "area_weighted_mean",
        description="How grid cells are aggregated (area_weighted_mean | unweighted_mean)"
    )
    aggregation_note: str = Field(
        "Area-weighted mean using cosine-latitude cell weights.",
        description="Human-readable aggregation description"
    )
    subregion_of: Optional[str] = Field(None, description="Parent region ID if this is a subregion")


class RegionListResponse(BaseModel):
    """Response for GET /api/regions."""
    regions: List[RegionBase]
    count: int
