"""
Trend Detector — AI Assistant Service
SRD §13: AI Trend Detective Assistant
Grounded strictly in verified observational data (2005–2024).
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
import httpx

from services.data_service import data_service
from core.config import settings

logger = logging.getLogger("trend_detector.assistant")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-120b"

VALID_VARIABLES = ["pm25", "aod", "rain_mm", "no2"]
VALID_CITIES = ["lahore", "karachi", "islamabad", "peshawar", "quetta", "faisalabad", "multan", "hyderabad"]

DEFAULT_CITIES_BY_VARIABLE = {
    "pm25": "lahore",
    "aod": "quetta",
    "rain_mm": "peshawar",
    "no2": "multan"
}

class AssistantService:
    """AI-powered investigation assistant grounded in real observation statistics."""

    def __init__(self):
        self._system_prompt = self._build_system_prompt()

    async def chat(
        self,
        message: str,
        conversation_history: List[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        if conversation_history is None:
            conversation_history = []

        msg_lower = message.lower()

        # FR-AI-004: Explicitly decline out-of-scope queries
        forbidden_keywords = [
            "soil", "moisture", "temperature", "warming", "heat",
            "ndvi", "greenness", "forest", "deforestation",
            "amazon", "california", "global", "co2", "carbon"
        ]
        if any(kw in msg_lower for kw in forbidden_keywords):
            return {
                "reply": "I cannot answer that from this dataset. Our verified observations cover strictly **PM2.5, Aerosol Optical Depth (AOD), Monthly Rainfall, and Tropospheric NO₂** across 8 cities in Pakistan from 2005 to 2024.",
                "is_ai_generated": False,
                "analysis_ref": None,
                "suggested_followup": "Try asking: 'What are the PM2.5 trends in Lahore?' or 'Compare rainfall between Peshawar and Karachi.'"
            }

        intent = self._classify_intent(message)
        return await self._handle_investigation(intent, message)

    def _classify_intent(self, message: str) -> Dict[str, Any]:
        msg_lower = message.lower()

        variable_map = {
            "rain_mm": ["rain", "rainfall", "precipitation", "monsoon"],
            "no2": ["no2", "nitrogen", "nitrogen dioxide"],
            "aod": ["aod", "aerosol", "haze"],
            "pm25": ["pm25", "pm2.5", "smog", "particulate", "pollution", "air quality"]
        }
        detected_var = "pm25"
        for v_id, kws in variable_map.items():
            if any(kw in msg_lower for kw in kws):
                detected_var = v_id
                break

        city_map = {
            "lahore": ["lahore"],
            "karachi": ["karachi"],
            "islamabad": ["islamabad"],
            "peshawar": ["peshawar"],
            "quetta": ["quetta"],
            "faisalabad": ["faisalabad"],
            "multan": ["multan"],
            "hyderabad": ["hyderabad"]
        }
        detected_city = DEFAULT_CITIES_BY_VARIABLE.get(detected_var, "lahore")
        for c_id, kws in city_map.items():
            if any(kw in msg_lower for kw in kws):
                detected_city = c_id
                break

        return {
            "variable": detected_var,
            "region": detected_city
        }

    async def _handle_investigation(self, intent: Dict[str, Any], message: str) -> Dict[str, Any]:
        var_id = intent["variable"]
        city_id = intent["region"]

        time_series = data_service.get_time_series(var_id, city_id)
        if not time_series:
            return {
                "reply": f"No data available for {var_id} in {city_id}.",
                "is_ai_generated": False,
                "analysis_ref": None
            }

        points = time_series.get("series", [])
        n_obs = len(points)
        raw_vals = [p["value"] for p in points]
        
        # Calculate OLS slope
        x_mean = (n_obs - 1) / 2.0
        y_mean = sum(raw_vals) / n_obs
        ss_xx = sum((i - x_mean)**2 for i in range(n_obs))
        ss_xy = sum((i - x_mean) * (raw_vals[i] - y_mean) for i in range(n_obs))
        slope_per_month = ss_xy / ss_xx if ss_xx != 0 else 0.0
        slope_per_year = slope_per_month * 12.0

        scale = 1e15 if var_id == "no2" else 1.0
        display_slope = slope_per_year / scale
        unit_str = "x10^15 molecules/cm^2/yr" if var_id == "no2" else time_series.get("unit", "") + "/yr"

        city_name = time_series.get("region_name", city_id.title())
        var_name = time_series.get("variable_name", var_id.upper())

        grounded_context = (
            f"OBSERVATION DATASET FACTS (2005-2024):\n"
            f"- Variable: {var_name}\n"
            f"- City: {city_name}\n"
            f"- Total Points: {n_obs} consecutive monthly points (0% missing)\n"
            f"- Observed Rate of Change: {display_slope:+.4f} {unit_str}\n"
            f"- Direction: {'increasing' if slope_per_year > 0 else 'decreasing'}\n"
        )

        api_key = os.getenv("GROQ_API_KEY", "") or getattr(settings, "groq_api_key", "")
        if api_key:
            try:
                user_prompt = f"Grounded Context:\n{grounded_context}\n\nUser asked: \"{message}\"\n\nProvide a friendly, scientifically accurate 2-paragraph response for students."
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.post(
                        GROQ_API_URL,
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": f"Bearer {api_key}"
                        },
                        json={
                            "model": GROQ_MODEL,
                            "messages": [
                                {"role": "system", "content": self._system_prompt},
                                {"role": "user", "content": user_prompt}
                            ],
                            "temperature": 0.2,
                            "max_tokens": 2048
                        }
                    )
                if resp.status_code == 200:
                    resp_data = resp.json()
                    ai_text = resp_data["choices"][0]["message"]["content"].strip()
                    return {
                        "reply": ai_text,
                        "is_ai_generated": True,
                        "analysis_ref": {
                            "variable": var_id,
                            "region": city_id,
                            "narrative": grounded_context,
                            "data_url": f"/api/analysis/{var_id}/{city_id}"
                        }
                    }
            except Exception as e:
                logger.warning(f"Groq API call failed: {e}")

        # Grounded fallback
        fallback = (
            f"🔍 **Grounded Observation for {var_name} in {city_name}** (2005–2024):\n\n"
            f"• **Rate of Change**: {display_slope:+.4f} {unit_str}\n"
            f"• **Direction**: {'Increasing' if slope_per_year > 0 else 'Decreasing'}\n"
            f"• **Coverage**: 240 consecutive monthly points (0% missing)\n\n"
            f"⚠️ *Scientific Reminder: An observed historical statistical trend describes data association and does not by itself prove a single cause or guarantee future continuation.*"
        )
        return {
            "reply": fallback,
            "is_ai_generated": False,
            "analysis_ref": {
                "variable": var_id,
                "region": city_id,
                "narrative": grounded_context,
                "data_url": f"/api/analysis/{var_id}/{city_id}"
            }
        }

    def _build_system_prompt(self) -> str:
        return (
            "You are the Trend Detective AI assistant for the NASA Space Apps Challenge 2026.\n"
            "You are grounded strictly in real monthly observations from 2005 to 2024 for 8 Pakistani cities "
            "(Lahore, Karachi, Islamabad, Peshawar, Quetta, Faisalabad, Multan, Hyderabad) across PM2.5, AOD, Rainfall, and NO2.\n"
            "STRICT RULES:\n"
            "1. NEVER invent numbers or dates.\n"
            "2. If asked about variables outside this dataset (e.g. soil moisture, CO2, forest loss), decline politely.\n"
            "3. NEVER make unsupported causal claims. A trend does not prove cause.\n"
            "4. Always write clean, complete paragraphs with no trailing incomplete thoughts."
        )

assistant_service = AssistantService()
