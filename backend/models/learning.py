"""
Trend Detector — Learning Mode models
SRD §12 Learning Mode ("Explain Like I'm 15")
"""

from pydantic import BaseModel, Field
from typing import List


class LearningTerm(BaseModel):
    """A statistical term with plain-language explanation (SRD §12 FR-LEARN-001 through FR-LEARN-005)."""
    id: str
    term: str = Field(..., examples=["Mann-Kendall test"])
    plain_explanation: str = Field(
        ...,
        examples=["Checks whether values consistently move up or down over time."]
    )
    example: str = Field(
        "",
        description="An example with a real value",
        examples=["Mann-Kendall p = 0.02 → The pattern is unlikely to be caused by random variation alone."]
    )
    category: str = Field(
        "statistics",
        description="statistics | data | methodology"
    )


class LearningTermsResponse(BaseModel):
    """Response for GET /api/learning/terms."""
    terms: List[LearningTerm]
    count: int
    note: str = Field(
        default="Significance does not prove causation or guarantee future continuation.",
        description="General scientific note (SRD §12 FR-LEARN-005)"
    )
