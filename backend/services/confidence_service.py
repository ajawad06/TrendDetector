"""
Trend Detector — Confidence Meter Service
SRD §11: Dataset Confidence Meter

A compact trust indicator built from:
- Record length
- Percentage of missing values
- Spatial coverage in the region
- Quality flags or retrieval uncertainty
- Residual autocorrelation
- Data type (observation vs. model)
"""

from typing import Dict, Any
from core.constants import (
    CONFIDENCE_RECORD_LENGTH_STRONG, CONFIDENCE_RECORD_LENGTH_MODERATE,
    CONFIDENCE_MISSING_LOW, CONFIDENCE_MISSING_MODERATE,
    AUTOCORRELATION_WARNING_THRESHOLD,
    CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, CONFIDENCE_LOW
)


def compute_confidence_meter(
    n_observations: int,
    pct_missing: float,
    lag1_autocorr: float,
    data_type: str = "satellite",
    cadence: str = "monthly",
    spatial_coverage_pct: float = 95.0
) -> Dict[str, Any]:
    """
    Compute the Dataset Confidence Meter (SRD §11 FR-QUAL-001 through FR-QUAL-006).

    Returns overall level (High/Medium/Low) and individual factor assessments.
    """
    factors = {}
    scores = []  # numeric scores for averaging

    # 1. Record Length
    if n_observations >= CONFIDENCE_RECORD_LENGTH_STRONG:
        years = n_observations // 12 if cadence == "monthly" else n_observations
        factors["record_length"] = {
            "rating": "Strong",
            "detail": f"{n_observations} {cadence} observations ({years}+ years)"
        }
        scores.append(3)
    elif n_observations >= CONFIDENCE_RECORD_LENGTH_MODERATE:
        years = n_observations // 12 if cadence == "monthly" else n_observations
        factors["record_length"] = {
            "rating": "Moderate",
            "detail": f"{n_observations} {cadence} observations ({years} years)"
        }
        scores.append(2)
    else:
        years = n_observations // 12 if cadence == "monthly" else n_observations
        factors["record_length"] = {
            "rating": "Weak",
            "detail": f"Only {n_observations} {cadence} observations ({years} years); short records limit trend detection."
        }
        scores.append(1)

    # 2. Missing Values
    if pct_missing <= CONFIDENCE_MISSING_LOW:
        factors["missing_values"] = {
            "rating": "Strong",
            "detail": f"{pct_missing:.1f}% missing"
        }
        scores.append(3)
    elif pct_missing <= CONFIDENCE_MISSING_MODERATE:
        factors["missing_values"] = {
            "rating": "Moderate",
            "detail": f"{pct_missing:.1f}% missing; some gaps in the record"
        }
        scores.append(2)
    else:
        factors["missing_values"] = {
            "rating": "Weak",
            "detail": f"{pct_missing:.1f}% missing; many gaps weaken trend estimates"
        }
        scores.append(1)

    # 3. Spatial Coverage
    if spatial_coverage_pct >= 90:
        factors["spatial_coverage"] = {
            "rating": "Strong",
            "detail": f"Good spatial coverage within the selected region"
        }
        scores.append(3)
    elif spatial_coverage_pct >= 60:
        factors["spatial_coverage"] = {
            "rating": "Moderate",
            "detail": f"Partial spatial coverage; some areas of the region may be underrepresented"
        }
        scores.append(2)
    else:
        factors["spatial_coverage"] = {
            "rating": "Weak",
            "detail": f"Limited spatial coverage; results may not represent the full region"
        }
        scores.append(1)

    # 4. Autocorrelation
    abs_r1 = abs(lag1_autocorr)
    if abs_r1 < 0.2:
        factors["autocorrelation"] = {
            "rating": "Strong",
            "detail": f"Low autocorrelation (lag-1 = {lag1_autocorr:.2f}); p-values are reliable."
        }
        scores.append(3)
    elif abs_r1 < AUTOCORRELATION_WARNING_THRESHOLD:
        factors["autocorrelation"] = {
            "rating": "Moderate",
            "detail": f"Mild autocorrelation (lag-1 = {lag1_autocorr:.2f}); p-values may be slightly optimistic."
        }
        scores.append(2)
    else:
        factors["autocorrelation"] = {
            "rating": "Weak",
            "detail": (
                f"Material autocorrelation (lag-1 = {lag1_autocorr:.2f}); "
                f"nearby months tend to be similar, which can make the p-value "
                f"look stronger than it is. Interpret significance with caution."
            )
        }
        scores.append(1)

    # 5. Data Type
    if data_type == "satellite":
        factors["data_type"] = {
            "rating": "Strong",
            "detail": "Direct satellite observation"
        }
        scores.append(3)
    elif data_type == "model_reanalysis":
        factors["data_type"] = {
            "rating": "Moderate",
            "detail": "Model/reanalysis product — blends observations with model physics; not a direct measurement."
        }
        scores.append(2)
    else:
        factors["data_type"] = {
            "rating": "Moderate",
            "detail": f"Non-NASA reference data ({data_type})"
        }
        scores.append(2)

    # Overall rating
    avg_score = sum(scores) / len(scores) if scores else 1
    if avg_score >= 2.5:
        overall = CONFIDENCE_HIGH
    elif avg_score >= 1.5:
        overall = CONFIDENCE_MEDIUM
    else:
        overall = CONFIDENCE_LOW

    # Override: never show "High" for very short records (SRD §11 FR-QUAL-004)
    if n_observations < CONFIDENCE_RECORD_LENGTH_MODERATE:
        overall = CONFIDENCE_LOW

    return {
        "overall": overall,
        "factors": factors
    }
