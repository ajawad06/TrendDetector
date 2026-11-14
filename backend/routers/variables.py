"""
Trend Detector — Variables Router
SRD §2.1, §8
"""

from fastapi import APIRouter
from services.data_service import data_service
from core.exceptions import VariableNotFoundError

router = APIRouter(prefix="/api/variables", tags=["Variables"])


@router.get("")
async def list_variables():
    """
    List all available variables with metadata.
    SRD §2.1: Variable catalog with priority, dataset, and availability.
    """
    variables = data_service.get_variables()
    return {
        "variables": variables,
        "count": len(variables)
    }


@router.get("/{variable_id}")
async def get_variable(variable_id: str):
    """
    Get detailed information about a specific variable.
    Includes "Why This Matters" text (SRD §8 FR-IMPACT-001).
    """
    variable = data_service.get_variable(variable_id)
    if not variable:
        raise VariableNotFoundError(variable_id)
    return variable
