"""
Trend Detector Backend — Main Application Entrypoint
FastAPI application for NASA Space Apps Challenge 2026: Earth System Trend Detective.
Serves both REST API endpoints and mounts the integrated frontend UI.
"""

import os
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from core.config import settings
from core.exceptions import (
    VariableNotFoundError, RegionNotFoundError, DataNotAvailableError,
    MissionNotFoundError, TopicNotFoundError, InsufficientDataError,
    InvalidDateRangeError, AssistantUnavailableError
)

# Import all API routers
from routers.variables import router as variables_router
from routers.regions import router as regions_router
from routers.missions import router as missions_router
from routers.topics import router as topics_router
from routers.data import router as data_router
from routers.analysis import router as analysis_router
from routers.story import router as story_router
from routers.compare import router as compare_router
from routers.datasets import router as datasets_router
from routers.learning import router as learning_router
from routers.hotspots import router as hotspots_router
from routers.assistant import router as assistant_router
from routers.export import router as export_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("trend_detector")

app = FastAPI(
    title="Trend Detector API",
    version="2.0.0",
    description="Earth System Trend Detective Backend serving NASA satellite and model-derived time series.",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
origins = settings.cors_origin_list
if not origins or "*" in origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Exception Handlers
@app.exception_handler(VariableNotFoundError)
async def variable_not_found_handler(request: Request, exc: VariableNotFoundError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(RegionNotFoundError)
async def region_not_found_handler(request: Request, exc: RegionNotFoundError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(DataNotAvailableError)
async def data_not_available_handler(request: Request, exc: DataNotAvailableError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(MissionNotFoundError)
async def mission_not_found_handler(request: Request, exc: MissionNotFoundError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(TopicNotFoundError)
async def topic_not_found_handler(request: Request, exc: TopicNotFoundError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(InsufficientDataError)
async def insufficient_data_handler(request: Request, exc: InsufficientDataError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(InvalidDateRangeError)
async def invalid_date_handler(request: Request, exc: InvalidDateRangeError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

@app.exception_handler(AssistantUnavailableError)
async def assistant_unavailable_handler(request: Request, exc: AssistantUnavailableError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "app": "Trend Detector API",
        "version": "2.0.0",
        "challenge": "NASA Space Apps Challenge 2026 — Earth System Trend Detective"
    }


# Include Routers under /api
app.include_router(variables_router)
app.include_router(regions_router)
app.include_router(missions_router)
app.include_router(topics_router)
app.include_router(data_router)
app.include_router(analysis_router)
app.include_router(story_router)
app.include_router(compare_router)
app.include_router(datasets_router)
app.include_router(learning_router)
app.include_router(hotspots_router)
app.include_router(assistant_router)
app.include_router(export_router)


# ── Full Frontend Integration ──
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

if os.path.exists(frontend_dir):
    # Mount frontend static directories
    src_dir = os.path.join(frontend_dir, "src")
    if os.path.exists(src_dir):
        app.mount("/src", StaticFiles(directory=src_dir), name="frontend_src")

    catalogs_dir = os.path.join(frontend_dir, "catalogs")
    if os.path.exists(catalogs_dir):
        app.mount("/catalogs", StaticFiles(directory=catalogs_dir), name="frontend_catalogs")

    data_dir = os.path.join(frontend_dir, "data")
    if os.path.exists(data_dir):
        app.mount("/data", StaticFiles(directory=data_dir), name="frontend_data")

    # Serve index.html at root
    @app.get("/", tags=["Frontend"])
    async def serve_frontend_root():
        index_file = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"status": "healthy", "app": "Trend Detector API"}


@app.on_event("startup")
async def startup_event():
    logger.info("Trend Detector integrated backend + frontend initialized successfully.")
