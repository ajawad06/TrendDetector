"""
Trend Detector — NASA Earthdata Authentication Module
Uses credentials configured in .env (EARTHDATA_USERNAME & EARTHDATA_PASSWORD).
Authenticates against NASA EOSDIS Earthdata Login (URS) for GES DISC and LAADS DAAC.
"""

import os
import sys
import logging
from typing import Optional, Dict
import httpx

# Ensure core config is importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from core.config import settings

logger = logging.getLogger("trend_detector.pipeline.auth")

URS_URL = "https://urs.earthdata.nasa.gov"


class EarthdataAuth:
    """Manages NASA Earthdata Login authentication."""

    def __init__(self):
        self.username = settings.earthdata_username
        self.password = settings.earthdata_password

    def is_configured(self) -> bool:
        return bool(self.username and self.password)

    def get_auth_tuple(self) -> Optional[tuple]:
        if not self.is_configured():
            return None
        return (self.username, self.password)

    def setup_netrc(self) -> bool:
        """
        Creates or updates a ~/.netrc file for seamless downloads via curl,
        earthaccess, or python requests without exposing passwords on the CLI.
        """
        if not self.is_configured():
            logger.warning("Earthdata credentials not provided in .env.")
            return False

        home_dir = os.path.expanduser("~")
        netrc_file = os.path.join(home_dir, "_netrc" if sys.platform.startswith("win") else ".netrc")

        entry = f"machine urs.earthdata.nasa.gov login {self.username} password {self.password}\n"

        try:
            existing_lines = []
            if os.path.exists(netrc_file):
                with open(netrc_file, "r") as f:
                    existing_lines = f.readlines()

            # Remove existing urs.earthdata entry if present
            filtered_lines = [line for line in existing_lines if "urs.earthdata.nasa.gov" not in line]
            filtered_lines.append(entry)

            with open(netrc_file, "w") as f:
                f.writelines(filtered_lines)

            logger.info(f"Updated NASA Earthdata netrc credentials at {netrc_file}")
            return True
        except Exception as e:
            logger.error(f"Failed to write netrc file: {e}")
            return False

    async def verify_credentials(self) -> bool:
        """Verify NASA Earthdata Login credentials with URS."""
        if not self.is_configured():
            return False

        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
                res = await client.get(
                    f"{URS_URL}/api/users/tokens",
                    auth=self.get_auth_tuple()
                )
                if res.status_code in (200, 201):
                    logger.info(f"NASA Earthdata credentials verified successfully for {self.username}.")
                    return True
                elif res.status_code == 401:
                    logger.warning("NASA Earthdata authentication failed: Invalid username or password.")
                    return False
                else:
                    # Earthdata often redirects, consider successful if authenticated
                    return res.status_code < 400
        except Exception as e:
            logger.warning(f"Could not verify NASA credentials online: {e}")
            return False


earthdata_auth = EarthdataAuth()
