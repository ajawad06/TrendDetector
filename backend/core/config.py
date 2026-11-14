"""
Trend Detector — Application Configuration
Reads from .env file and environment variables.
FR-AI-007: API keys stay server-side, never in frontend bundle.
"""

from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ── Server ──
    environment: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    debug: bool = True

    # ── CORS ──
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # ── AI Assistant ──
    gemini_api_key: str = ""

    # ── Data Paths ──
    data_dir: str = "./data/prepared"
    catalog_dir: str = "./catalogs"

    @property
    def resolved_catalog_dir(self):
        from pathlib import Path
        p = Path(self.catalog_dir)
        if not p.exists():
            backend_p = Path(__file__).resolve().parent.parent / self.catalog_dir.lstrip("./")
            if backend_p.exists():
                return backend_p
        return p

    @property
    def resolved_data_dir(self):
        from pathlib import Path
        p = Path(self.data_dir)
        if not p.exists():
            backend_p = Path(__file__).resolve().parent.parent / self.data_dir.lstrip("./")
            if backend_p.exists():
                return backend_p
        return p

    # ── NASA Earthdata (pipeline only) ──
    earthdata_username: str = ""
    earthdata_password: str = ""

    @property
    def cors_origin_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    class Config:
        env_file = os.path.join(os.path.dirname(__file__), "..", ".env")
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "allow"


# Singleton settings instance
settings = Settings()
