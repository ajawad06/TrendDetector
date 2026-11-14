"""
Trend Detector — AI Assistant Router
SRD §13: AI Trend Detective Assistant
"""

from fastapi import APIRouter
from models.assistant import AssistantChatRequest, AssistantChatResponse
from services.assistant_service import assistant_service

router = APIRouter(prefix="/api/assistant", tags=["AI Assistant"])


@router.post("/chat", response_model=AssistantChatResponse)
async def chat_with_assistant(request: AssistantChatRequest):
    """
    Process natural language queries to guide users through NASA Earth science data.
    SRD §13 FR-AI-001 through FR-AI-007.
    """
    result = await assistant_service.chat(
        message=request.message,
        conversation_history=[msg.model_dump() for msg in request.conversation_history]
    )
    return result
