"""
Trend Detector — Learning Mode Router
SRD §12: Learning Mode ("Explain Like I'm 15")
"""

from fastapi import APIRouter
from services.data_service import data_service

router = APIRouter(prefix="/api/learning", tags=["Learning Mode"])


@router.get("/terms")
async def get_learning_terms():
    """
    Get all learning terms and plain-language definitions.
    SRD §12 FR-LEARN-001 through FR-LEARN-005.
    """
    terms = data_service.get_learning_terms()
    return {
        "terms": terms,
        "count": len(terms),
        "note": "Significance does not prove causation or guarantee future continuation."
    }
