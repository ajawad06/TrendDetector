"""
Trend Detector — Comparison / Trend Opposites Service
SRD §9: Trend Opposites Explorer
"""

from typing import Optional, Dict, Any, List
from services.analysis_service import analysis_service
from services.story_service import story_service
from services.data_service import data_service
from core.exceptions import VariableNotFoundError


class CompareService:
    """Compares trends between two regions for the same variable."""

    def compare(
        self,
        variable_id: str,
        region_a_id: str,
        region_b_id: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        use_anomalies: bool = True
    ) -> Dict[str, Any]:
        """
        Run analysis on two regions and compare results.
        SRD §9 FR-OPP-001 through FR-OPP-006.
        """
        variable = data_service.get_variable(variable_id)
        if not variable:
            raise VariableNotFoundError(variable_id)

        # Run analysis for both regions
        result_a = analysis_service.analyze(
            variable_id, region_a_id, start_date, end_date, use_anomalies
        )
        result_b = analysis_service.analyze(
            variable_id, region_b_id, start_date, end_date, use_anomalies
        )

        # Determine comparison verdict
        verdict = self._determine_verdict(result_a, result_b, variable["name"])

        # Generate comparison narrative
        comparison_narrative = story_service.generate_comparison_narrative(
            variable["name"], result_a, result_b
        )

        return {
            "variable": variable_id,
            "variable_name": variable["name"],
            "region_a": result_a,
            "region_b": result_b,
            "verdict": {
                **verdict,
                "narrative": comparison_narrative
            },
            "disclaimer": "A trend does not by itself prove its cause or guarantee it will continue."
        }

    def get_presets(self) -> List[Dict]:
        """Get preset comparisons (SRD §9)."""
        return data_service.get_comparison_presets()

    def _determine_verdict(
        self, result_a: Dict, result_b: Dict, variable_name: str
    ) -> Dict[str, Any]:
        """Determine the relationship between two trends (SRD §9 FR-OPP-003)."""
        dir_a = result_a["significance"]["verdict"]
        dir_b = result_b["significance"]["verdict"]

        # Map verdicts to simple directions and colors
        def to_direction(verdict: str) -> str:
            if "increase" in verdict:
                return "increasing"
            elif "decrease" in verdict:
                return "decreasing"
            else:
                return "no_significant_trend"

        def to_color(verdict: str) -> str:
            if "increase" in verdict:
                return "blue"
            elif "decrease" in verdict:
                return "orange"
            else:
                return "grey"

        d_a = to_direction(dir_a)
        d_b = to_direction(dir_b)

        # Determine relationship
        if d_a == "increasing" and d_b == "decreasing":
            relationship = "opposite"
        elif d_a == "decreasing" and d_b == "increasing":
            relationship = "opposite"
        elif d_a == d_b and d_a != "no_significant_trend":
            # Compare rates
            rate_a = abs(result_a["ols"]["slope_per_year"])
            rate_b = abs(result_b["ols"]["slope_per_year"])
            ratio = max(rate_a, rate_b) / min(rate_a, rate_b) if min(rate_a, rate_b) > 0 else 1
            if ratio > 2:
                relationship = "same_direction_different_rate"
            else:
                relationship = "same_direction_similar_rate"
        elif "no_significant_trend" in (d_a, d_b):
            relationship = "mixed_significance"
        else:
            relationship = "mixed_significance"

        return {
            "relationship": relationship,
            "region_a_direction": d_a,
            "region_b_direction": d_b,
            "region_a_color": to_color(dir_a),
            "region_b_color": to_color(dir_b)
        }


# Singleton
compare_service = CompareService()
