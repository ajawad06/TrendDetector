"""
Trend Detector — Data Service
Loads real observation series and catalog data.
Strict single source of truth: reads from frontend/data/series.json.
"""

import json
import os
from typing import Optional, List, Dict, Any
from pathlib import Path
from functools import lru_cache

from core.config import settings

class DataService:
    """Loads and caches prepared data and catalog files from the real dataset."""

    def __init__(self):
        self.data_dir = settings.resolved_data_dir
        self.catalog_dir = settings.resolved_catalog_dir
        self._series_cache: Optional[Dict[str, Any]] = None

    # ── Catalog Loading ──

    @lru_cache(maxsize=None)
    def get_variables(self) -> List[Dict]:
        return self._load_catalog("variables.json")

    @lru_cache(maxsize=None)
    def get_regions(self) -> List[Dict]:
        res = self._load_catalog("regions.json")
        if isinstance(res, dict) and "regions" in res:
            return res["regions"]
        return res if isinstance(res, list) else []

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
        res = self._load_catalog("learning_terms.json")
        if isinstance(res, dict) and "terms" in res:
            return res["terms"]
        return res if isinstance(res, list) else []

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

    # ── Time Series Data from frontend/data/series.json ──

    def _load_series_json(self) -> Optional[Dict[str, Any]]:
        if self._series_cache is not None:
            return self._series_cache

        possible_paths = [
            Path(__file__).resolve().parent.parent.parent / "frontend" / "data" / "series.json",
            Path(__file__).resolve().parent.parent / "data" / "series.json",
            Path(os.getcwd()) / "frontend" / "data" / "series.json"
        ]

        for p in possible_paths:
            if p.exists():
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        self._series_cache = json.load(f)
                        return self._series_cache
                except Exception:
                    pass
        return None

    def get_time_series(
        self,
        variable_id: str,
        region_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Optional[Dict]:
        series_all = self._load_series_json()
        if not series_all:
            return None

        city_key = region_id.lower()
        var_key = variable_id.lower()

        if city_key not in series_all:
            return None

        city_data = series_all[city_key]
        if "variables" not in city_data or var_key not in city_data["variables"]:
            return None

        points = city_data["variables"][var_key]
        if start_date or end_date:
            points = [
                pt for pt in points
                if (not start_date or pt["date"] >= start_date) and (not end_date or pt["date"] <= end_date)
            ]

        var_info = self.get_variable(var_key) or {}
        return {
            "variable": var_key,
            "variable_name": var_info.get("name", var_key.upper()),
            "region": city_key,
            "region_name": city_data.get("name", city_key.title()),
            "unit": var_info.get("unit", ""),
            "n_observations": len(points),
            "pct_missing": 0.0,
            "period": {
                "start": points[0]["date"] if points else "",
                "end": points[-1]["date"] if points else ""
            },
            "series": points
        }

    def check_data_availability(self, variable_id: str, region_id: str) -> bool:
        series_all = self._load_series_json()
        if not series_all:
            return False
        city_key = region_id.lower()
        var_key = variable_id.lower()
        return city_key in series_all and var_key in series_all[city_key].get("variables", {})

    # ── Internal ──

    def _load_catalog(self, filename: str) -> Any:
        path = self.catalog_dir / filename
        if not path.exists():
            # Try frontend/catalogs
            alt_path = Path(__file__).resolve().parent.parent.parent / "frontend" / "catalogs" / filename
            if alt_path.exists():
                path = alt_path
            else:
                return []
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []


# Singleton instance
data_service = DataService()
