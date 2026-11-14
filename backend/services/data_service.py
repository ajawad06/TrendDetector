"""
Trend Detector — Data Service
Loads prepared JSON time series and catalog data.
SRD §4: All data access through one interface.
"""

import json
import os
from typing import Optional, List, Dict, Any
from pathlib import Path
from functools import lru_cache

from core.config import settings


class DataService:
    """Loads and caches prepared data and catalog files."""

    def __init__(self):
        self.data_dir = settings.resolved_data_dir
        self.catalog_dir = settings.resolved_catalog_dir
        self._cache: Dict[str, Any] = {}

    # ── Catalog Loading ──

    @lru_cache(maxsize=None)
    def get_variables(self) -> List[Dict]:
        return self._load_catalog("variables.json")

    @lru_cache(maxsize=None)
    def get_regions(self) -> List[Dict]:
        return self._load_catalog("regions.json")

    @lru_cache(maxsize=None)
    def get_missions(self) -> List[Dict]:
        return self._load_catalog("missions.json")

    @lru_cache(maxsize=None)
    def get_datasets(self) -> List[Dict]:
        return self._load_catalog("datasets.json")

    @lru_cache(maxsize=None)
    def get_topics(self) -> List[Dict]:
        return self._load_catalog("topics.json")

    @lru_cache(maxsize=None)
    def get_learning_terms(self) -> List[Dict]:
        return self._load_catalog("learning_terms.json")

    @lru_cache(maxsize=None)
    def get_hotspots(self) -> List[Dict]:
        return self._load_catalog("hotspots.json")

    @lru_cache(maxsize=None)
    def get_comparison_presets(self) -> List[Dict]:
        return self._load_catalog("comparison_presets.json")

    # ── Variable/Region Lookups ──

    def get_variable(self, variable_id: str) -> Optional[Dict]:
        for v in self.get_variables():
            if v["id"] == variable_id:
                return v
        return None

    def get_region(self, region_id: str) -> Optional[Dict]:
        for r in self.get_regions():
            if r["id"] == region_id:
                return r
        return None

    def get_mission(self, mission_id: str) -> Optional[Dict]:
        for m in self.get_missions():
            if m["id"] == mission_id:
                return m
        return None

    def get_topic(self, topic_id: str) -> Optional[Dict]:
        for t in self.get_topics():
            if t["id"] == topic_id:
                return t
        return None

    # ── Time Series Data ──

    def get_time_series(
        self,
        variable_id: str,
        region_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Optional[Dict]:
        """
        Load prepared time series JSON for a variable × region combination.

        File path: data/prepared/{variable_id}/{region_id}.json
        """
        cache_key = f"{variable_id}/{region_id}"
        if cache_key not in self._cache:
            file_path = self.data_dir / variable_id / f"{region_id}.json"
            if not file_path.exists():
                return None
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    self._cache[cache_key] = json.load(f)
            except (json.JSONDecodeError, IOError):
                return None

        data = self._cache[cache_key]

        # Apply date filtering if requested
        if start_date or end_date:
            filtered_series = []
            for point in data.get("series", []):
                d = point.get("date", "")
                if start_date and d < start_date:
                    continue
                if end_date and d > end_date:
                    continue
                filtered_series.append(point)
            data = {**data, "series": filtered_series}

        return data

    def check_data_availability(self, variable_id: str, region_id: str) -> bool:
        """Check if prepared data exists for this combination."""
        file_path = self.data_dir / variable_id / f"{region_id}.json"
        return file_path.exists()

    # ── Internal ──

    def _load_catalog(self, filename: str) -> List[Dict]:
        path = self.catalog_dir / filename
        if not path.exists():
            return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []


# Singleton instance
data_service = DataService()
