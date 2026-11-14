"""
Trend Detector — Datasets / NASA Showcase Router
SRD §10: NASA Data Showcase
"""

from fastapi import APIRouter
from services.data_service import data_service

router = APIRouter(prefix="/api/datasets", tags=["Datasets"])


@router.get("")
async def list_datasets():
    """
    List all datasets used in the submitted version.
    SRD §10 FR-NASA-001: Homepage lists datasets used.
    SRD §10 FR-NASA-005: Distinguish satellite, model/reanalysis, and non-NASA reference.
    """
    datasets = data_service.get_datasets()
    return {
        "datasets": datasets,
        "count": len(datasets)
    }


@router.get("/used")
async def list_used_datasets():
    """
    List only datasets actually used in the demo.
    SRD §10 FR-NASA-001: Lists only datasets used in the submitted version.
    """
    datasets = data_service.get_datasets()
    used = [d for d in datasets if d.get("used_in_demo", False)]
    return {
        "datasets": used,
        "count": len(used)
    }
