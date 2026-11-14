"""
Trend Detector — Time series data models
SRD §4 Data Flow, §15 Pipeline Steps, §17 Visualization
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from .common import TemporalCoverage


class DataPoint(BaseModel):
    """A single time-series observation (SRD §15 — missing as null, never zero)."""
    date: str = Field(..., description="Date string (YYYY-MM)", examples=["2000-06"])
    value: Optional[float] = Field(None, description="Raw observed value (null if missing)")
    anomaly: Optional[float] = Field(None, description="Seasonal anomaly (null if missing)")


class TimeSeriesMetadata(BaseModel):
    """Provenance metadata for a time series (SRD §10, §11, §19)."""
    variable: str
    region: str
    unit: str
    cadence: str = "monthly"
    dataset: str
    dataset_version: str
    provider: str
    data_type: str = Field(..., description="satellite | model_reanalysis | reference")
    retrieval_date: str = Field(..., description="When data was retrieved from source")
    processing_steps: List[str] = Field(
        default_factory=list,
        description="Pipeline steps applied to produce this series"
    )
    baseline_period: Optional[TemporalCoverage] = Field(
        None, description="Baseline period used for anomaly computation"
    )
    is_sample_data: bool = Field(
        False,
        description="True if this is sample/synthetic data, not real NASA data (SRD §19)"
    )
    citation: str = Field("", description="Dataset citation or DOI")


class TimeSeriesResponse(BaseModel):
    """Response for GET /api/data/{variable}/{region} (SRD §4, §15)."""
    metadata: TimeSeriesMetadata
    series: List[DataPoint]
    n_total: int = Field(..., description="Total number of time steps")
    n_valid: int = Field(..., description="Number of non-null observations")
    n_missing: int = Field(..., description="Number of null/missing observations")
    pct_missing: float = Field(..., description="Percentage of missing values")
