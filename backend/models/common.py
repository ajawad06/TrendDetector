"""
Trend Detector — Common/shared Pydantic models
"""

from pydantic import BaseModel, Field
from typing import Optional, List


class TemporalCoverage(BaseModel):
    """Date range for a dataset or analysis."""
    start: str = Field(..., description="Start date (YYYY-MM)", examples=["2000-06"])
    end: str = Field(..., description="End date (YYYY-MM)", examples=["2024-12"])


class ErrorResponse(BaseModel):
    """Standard error response."""
    detail: str


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    version: str = "2.0"
    project: str = "Trend Detector"
    challenge: str = "NASA Space Apps 2026 — Earth System Trend Detective"


class PaginationMeta(BaseModel):
    """Pagination metadata."""
    total: int
    returned: int
