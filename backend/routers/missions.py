"""
Trend Detector — Missions Router
SRD §6: Guided Demo Missions
"""

from fastapi import APIRouter
from services.data_service import data_service
from core.exceptions import MissionNotFoundError

router = APIRouter(prefix="/api/missions", tags=["Missions"])


@router.get("")
async def list_missions():
    """
    List all guided demo missions.
    SRD §6 FR-DEMO-001: At least three one-click missions using real NASA-derived data.
    """
    missions = data_service.get_missions()
    return {
        "missions": missions,
        "count": len(missions)
    }


@router.get("/{mission_id}")
async def get_mission(mission_id: str):
    """
    Get a specific mission configuration.
    SRD §6 FR-DEMO-002: Each mission loads its complete config automatically.
    """
    mission = data_service.get_mission(mission_id)
    if not mission:
        raise MissionNotFoundError(mission_id)
    return mission
