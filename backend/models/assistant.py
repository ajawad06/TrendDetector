"""
Trend Detector — AI Assistant models
SRD §13 AI Trend Detective Assistant
"""

from pydantic import BaseModel, Field
from typing import Optional, List


class AssistantMessage(BaseModel):
    """A single message in the assistant conversation."""
    role: str = Field(..., description="user | assistant | system")
    content: str


class AssistantChatRequest(BaseModel):
    """Request for POST /api/assistant/chat (SRD §13 FR-AI-001)."""
    message: str = Field(..., description="User's natural-language question")
    conversation_history: List[AssistantMessage] = Field(
        default_factory=list, description="Previous messages for context"
    )


class AssistantAnalysisRef(BaseModel):
    """Reference to an analysis result surfaced by the assistant."""
    variable: str
    region: str
    narrative: str
    data_url: str = Field(..., description="API URL to fetch the full analysis")


class AssistantChatResponse(BaseModel):
    """Response for POST /api/assistant/chat (SRD §13)."""
    reply: str = Field(..., description="Assistant's response text")
    is_ai_generated: bool = Field(True, description="Disclosure (SRD §13 FR-AI-006)")
    analysis_ref: Optional[AssistantAnalysisRef] = Field(
        None, description="Reference to analysis if one was triggered"
    )
    suggested_followup: Optional[str] = Field(
        None, description="Suggested follow-up question"
    )
    limitations: List[str] = Field(
        default_factory=list,
        description="Known limitations of this response"
    )
    sources: List[str] = Field(
        default_factory=list,
        description="Dataset and methodology references"
    )
