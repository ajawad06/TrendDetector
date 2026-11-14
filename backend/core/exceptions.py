"""
Trend Detector — Custom exceptions
Provides clear, actionable error messages (SRD §19 Reliability).
"""

from fastapi import HTTPException, status


class VariableNotFoundError(HTTPException):
    def __init__(self, variable_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Variable '{variable_id}' not found. Use GET /api/variables for available variables."
        )


class RegionNotFoundError(HTTPException):
    def __init__(self, region_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Region '{region_id}' not found. Use GET /api/regions for available regions."
        )


class DataNotAvailableError(HTTPException):
    def __init__(self, variable_id: str, region_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No prepared data available for variable '{variable_id}' "
                f"in region '{region_id}'. This combination may not have been processed yet."
            )
        )


class MissionNotFoundError(HTTPException):
    def __init__(self, mission_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Mission '{mission_id}' not found. Use GET /api/missions for available missions."
        )


class TopicNotFoundError(HTTPException):
    def __init__(self, topic_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Topic '{topic_id}' not found. Use GET /api/topics for available topics."
        )


class InsufficientDataError(HTTPException):
    def __init__(self, n_observations: int, minimum: int):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Only {n_observations} valid observations available; "
                f"minimum {minimum} required for robust analysis. "
                f"Result is marked as exploratory only."
            )
        )


class InvalidDateRangeError(HTTPException):
    def __init__(self, start: str, end: str):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid date range: start '{start}' must be before end '{end}'."
        )


class AssistantUnavailableError(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI assistant is currently unavailable. Please use the manual investigation flow."
        )
