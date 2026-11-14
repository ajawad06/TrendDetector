"""
Trend Detector — Topics Router
SRD §5.2: Investigation wizard
"""

from fastapi import APIRouter
from services.data_service import data_service
from core.exceptions import TopicNotFoundError

router = APIRouter(prefix="/api/topics", tags=["Topics"])


@router.get("")
async def list_topics():
    """
    List all investigation topics.
    SRD §5.2 FR-FLOW-002: Topic-based investigation choices.
    Topics with no data are marked as unavailable / 'coming soon'.
    """
    topics = data_service.get_topics()
    return {
        "topics": topics,
        "count": len(topics)
    }


@router.get("/{topic_id}")
async def get_topic(topic_id: str):
    """
    Get a topic with its recommendation.
    SRD §5.2 FR-FLOW-003: Recommend variables, regions and plain-language reason.
    """
    topic = data_service.get_topic(topic_id)
    if not topic:
        raise TopicNotFoundError(topic_id)
    return topic


@router.get("/{topic_id}/recommendation")
async def get_topic_recommendation(topic_id: str):
    """
    Get the recommendation for a specific topic.
    Returns up to 3 variables, up to 3 regions, and a plain-language reason.
    SRD §5.2 FR-FLOW-003.
    """
    topic = data_service.get_topic(topic_id)
    if not topic:
        raise TopicNotFoundError(topic_id)
    return topic.get("recommendation", {})
