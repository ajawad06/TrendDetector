"""
Trend Detector — Trend Story Generator Service
SRD §7: Trend Story Generator
SRD §8: Why This Matters

Generates plain-language stories from computed results.
The story is built from the computed result, never hardcoded.
"""

from typing import Optional, Dict, Any
from services.data_service import data_service
from core.constants import PCT_CHANGE_ALLOWED, PCT_CHANGE_FORBIDDEN


class StoryService:
    """Generates trend stories from analysis results."""

    def generate_story(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate a complete trend story from an analysis result.

        Returns a dict matching the TrendStory model.
        """
        variable_id = analysis["variable"]
        variable_name = analysis["variable_name"]
        region_name = analysis["region_name"]
        unit = analysis["unit"]
        verdict = analysis["significance"]["verdict"]
        ols = analysis["ols"]
        mk = analysis["mann_kendall"]
        ts = analysis["theil_sen"]
        period = analysis["period"]

        # ── Build the four-question card (SRD §7) ──
        card = self._build_card(
            variable_name, region_name, unit, verdict,
            ols, period, variable_id
        )

        # ── Build the narrative (SRD §7 wording templates) ──
        narrative = self._build_narrative(
            variable_name, region_name, unit, verdict,
            ols, ts, period, variable_id
        )

        # ── Get "Why This Matters" (SRD §8) ──
        variable_data = data_service.get_variable(variable_id)
        why_it_matters = (
            variable_data.get("why_it_matters", "")
            if variable_data
            else ""
        )

        # ── "Show the numbers" section (SRD §7 FR-STORY-005) ──
        show_numbers = {
            "ols_slope": f"{ols['slope_per_year']:.4f} {ols['slope_unit']}",
            "ols_p_value": f"{ols['p_value']:.4f}",
            "ols_95_ci": f"[{ols['ci_95_lower']:.4f}, {ols['ci_95_upper']:.4f}] {ols['slope_unit']}",
            "ols_r_squared": f"{ols['r_squared']:.4f}",
            "theil_sen_slope": f"{ts['slope_per_year']:.4f} {ts['slope_unit']}",
            "mann_kendall_direction": mk["direction"],
            "mann_kendall_z": f"{mk['z_statistic']:.4f}",
            "mann_kendall_p": f"{mk['p_value']:.4f}",
            "mann_kendall_tau": f"{mk['tau']:.4f}",
            "total_change": f"{ols['total_change']:.2f} {unit}",
            "n_observations": analysis["n_observations"],
            "pct_missing": f"{analysis['pct_missing']:.1f}%",
            "autocorrelation_lag1": f"{analysis['autocorrelation']['lag1']:.4f}",
            "method": "OLS linear regression with t-test; Mann-Kendall nonparametric test; Theil-Sen median slope"
        }

        if ols.get("total_change_pct") is not None:
            show_numbers["total_change_pct"] = f"{ols['total_change_pct']:.1f}%"

        return {
            "card": card,
            "narrative": narrative,
            "why_it_matters": why_it_matters,
            "disclaimer": "A trend does not by itself prove its cause or guarantee it will continue.",
            "show_the_numbers": show_numbers,
            "comparison_narrative": None
        }

    def generate_comparison_narrative(
        self,
        variable_name: str,
        analysis_a: Dict[str, Any],
        analysis_b: Dict[str, Any]
    ) -> str:
        """Generate a narrative comparing two regions (SRD §9 FR-OPP-003)."""
        dir_a = analysis_a["significance"]["verdict"]
        dir_b = analysis_b["significance"]["verdict"]
        region_a = analysis_a["region_name"]
        region_b = analysis_b["region_name"]

        if "increase" in dir_a and "decrease" in dir_b:
            return (
                f"{variable_name} is increasing in {region_a} "
                f"but decreasing in {region_b} over the same period."
            )
        elif "decrease" in dir_a and "increase" in dir_b:
            return (
                f"{variable_name} is decreasing in {region_a} "
                f"but increasing in {region_b} over the same period."
            )
        elif "increase" in dir_a and "increase" in dir_b:
            return (
                f"Both {region_a} and {region_b} show an increasing trend "
                f"in {variable_name}, but the rate differs."
            )
        elif "decrease" in dir_a and "decrease" in dir_b:
            return (
                f"Both {region_a} and {region_b} show a decreasing trend "
                f"in {variable_name}, but the rate differs."
            )
        else:
            return (
                f"{variable_name} shows no statistically significant trend "
                f"in one or both regions over the selected period."
            )

    # ── Internal Methods ──

    def _build_card(
        self, variable_name, region_name, unit, verdict, ols, period, variable_id
    ) -> Dict[str, str]:
        """Build the four-question result card."""
        # WHAT CHANGED
        if "increase" in verdict:
            what = f"{variable_name} levels increased."
        elif "decrease" in verdict:
            what = f"{variable_name} levels decreased."
        elif verdict == "insufficient_data":
            what = f"Insufficient data to determine whether {variable_name} changed."
        else:
            what = f"{variable_name} shows no statistically significant change."

        # WHERE
        where = f"{region_name}."

        # HOW MUCH
        total = ols["total_change"]
        pct = ols.get("total_change_pct")
        start_year = period["start"][:4] if period.get("start") else "?"
        end_year = period["end"][:4] if period.get("end") else "?"

        if variable_id in PCT_CHANGE_FORBIDDEN:
            how_much = f"{total:+.2f} {unit} from {start_year} to {end_year}."
        elif pct is not None and variable_id in PCT_CHANGE_ALLOWED:
            how_much = f"{pct:+.1f}% ({total:+.2f} {unit}) from {start_year} to {end_year}."
        else:
            how_much = f"{total:+.2f} {unit} from {start_year} to {end_year}."

        # SIGNIFICANT
        if "significant" in verdict and verdict != "no_significant_trend":
            significant = "Yes, at the 95% confidence level."
        elif verdict == "insufficient_data":
            significant = "Cannot be determined — insufficient data for a robust assessment."
        else:
            significant = "No, the observed change is not statistically significant at the 95% level."

        return {
            "what_changed": what,
            "where": where,
            "how_much": how_much,
            "significant": significant
        }

    def _build_narrative(
        self, variable_name, region_name, unit, verdict,
        ols, ts, period, variable_id
    ) -> str:
        """Build the full plain-language narrative sentence."""
        rate = ols["slope_per_year"]
        start_year = period.get("start", "")[:4]
        end_year = period.get("end", "")[:4]

        if verdict == "significant_increase":
            return (
                f"{variable_name} increased by {abs(rate):.3f} {ols['slope_unit']} "
                f"in {region_name} from {start_year} to {end_year}. "
                f"This trend is statistically significant at the 95% confidence level."
            )
        elif verdict == "significant_decrease":
            return (
                f"{variable_name} decreased by {abs(rate):.3f} {ols['slope_unit']} "
                f"in {region_name} from {start_year} to {end_year}. "
                f"This trend is statistically significant at the 95% confidence level."
            )
        elif verdict == "insufficient_data":
            return (
                f"There is not enough reliable data in {region_name} "
                f"to assess a robust trend in {variable_name} over the selected period."
            )
        else:
            return (
                f"{variable_name} shows no statistically significant trend "
                f"in {region_name} over {start_year}–{end_year}. "
                f"The observed rate of change ({rate:+.3f} {ols['slope_unit']}) "
                f"is within the range expected from natural variability."
            )


# Singleton
story_service = StoryService()
