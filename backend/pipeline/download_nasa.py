"""
Trend Detector — NASA Data Acquisition Pipeline
SRD §15 Data Acquisition and Pakistan Support
Queries NASA CMR (Common Metadata Repository) and downloads raw/aggregated granules
using NASA Earthdata credentials configured in .env.
"""

import os
import sys
import logging
from typing import List, Dict, Optional
import httpx

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from core.config import settings
from pipeline.earthdata_auth import earthdata_auth

logger = logging.getLogger("trend_detector.pipeline.download")

CMR_BASE = "https://cmr.earthdata.nasa.gov/search/granules.json"

DATASET_SHORTNAMES = {
    "rainfall": "GPM_3IMERGM",          # GPM IMERG Final Precipitation Monthly L3 0.1 deg
    "soil_moisture": "GLDAS_NOAH025_M",  # GLDAS Noah Land Surface Model L4 Monthly 0.25 deg
    "aod": "MOD08_M3",                  # MODIS/Terra Aerosol Cloud & Water Vapor Monthly Global
    "temperature": "M2TMNXSLV"          # MERRA-2 Monthly 2-meter air temperature
}


class NasaDataPipeline:
    """Acquires NASA satellite and model data granules."""

    def __init__(self):
        self.auth = earthdata_auth

    async def query_cmr_granules(
        self,
        variable: str,
        start_date: str = "2020-01-01T00:00:00Z",
        end_date: str = "2024-12-31T23:59:59Z",
        bbox: Optional[List[float]] = None,
        limit: int = 12
    ) -> List[Dict]:
        """
        Query NASA Common Metadata Repository (CMR) for available granules.
        Bounding box format: [west, south, east, north] (e.g. Pakistan: [60.87, 23.63, 77.84, 37.08])
        """
        short_name = DATASET_SHORTNAMES.get(variable)
        if not short_name:
            logger.error(f"Unknown variable for CMR query: {variable}")
            return []

        params = {
            "short_name": short_name,
            "temporal": f"{start_date},{end_date}",
            "page_size": limit,
            "sort_key": "-start_date"
        }

        if bbox:
            params["bounding_box"] = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.get(CMR_BASE, params=params)
                if res.status_code == 200:
                    data = res.json()
                    entries = data.get("feed", {}).get("entry", [])
                    logger.info(f"CMR found {len(entries)} granules for {variable} ({short_name}).")
                    
                    results = []
                    for entry in entries:
                        download_url = None
                        for link in entry.get("links", []):
                            if "data#" in link.get("rel", "") or link.get("inherited") is False:
                                href = link.get("href", "")
                                if href.endswith((".nc4", ".hdf", ".nc", ".HDF5")):
                                    download_url = href
                                    break

                        results.append({
                            "title": entry.get("title"),
                            "time_start": entry.get("time_start"),
                            "time_end": entry.get("time_end"),
                            "download_url": download_url
                        })
                    return results
                else:
                    logger.warning(f"CMR query returned status {res.status_code}: {res.text[:200]}")
                    return []
        except Exception as e:
            logger.error(f"Failed to query NASA CMR: {e}")
            return []

    async def download_granule(self, url: str, target_path: str) -> bool:
        """Download a protected NASA GES DISC / LAADS granule with authentication."""
        if not self.auth.is_configured():
            logger.error("Cannot download NASA granule: Earthdata credentials not configured.")
            return False

        auth_tuple = self.auth.get_auth_tuple()
        try:
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
                async with client.stream("GET", url, auth=auth_tuple) as res:
                    if res.status_code == 200:
                        with open(target_path, "wb") as f:
                            async for chunk in res.aiter_bytes():
                                f.write(chunk)
                        logger.info(f"Successfully downloaded NASA granule to {target_path}")
                        return True
                    else:
                        logger.error(f"Failed to download granule from {url} (status {res.status_code})")
                        return False
        except Exception as e:
            logger.error(f"Download exception: {e}")
            return False


pipeline = NasaDataPipeline()
