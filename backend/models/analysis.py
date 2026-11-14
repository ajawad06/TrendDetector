"""
Trend Detector — Statistical analysis result models
SRD §16 Statistical Analysis, §11 Dataset Confidence Meter
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from .common import TemporalCoverage


# ── OLS Regression (SRD §16.1) ──

class OLSResult(BaseModel):
    """Ordinary Least Squares regression result."""
    slope_per_year: float = Field(..., description="OLS slope in native units per year")
    slope_unit: str = Field(..., description="Unit of the slope", examples=["mm/month/year"])
    intercept: float
    p_value: float = Field(..., description="t-test p-value for the slope")
    ci_95_lower: float = Field(..., description="Lower bound of 95% CI for slope")
    ci_95_upper: float = Field(..., description="Upper bound of 95% CI for slope")
    r_squared: float = Field(..., description="Coefficient of determination")
    total_change: float = Field(..., description="Total change over the analysis period in native units")
    total_change_pct: Optional[float] = Field(
        None, description="Total change as percentage (only for variables where meaningful)"
    )


# ── Mann-Kendall (SRD §16.1) ──

class MannKendallResult(BaseModel):
    """Mann-Kendall trend test result."""
    direction: str = Field(..., description="increasing | decreasing | no_trend")
    z_statistic: float
    p_value: float
    tau: float = Field(..., description="Kendall's tau correlation coefficient")


# ── Theil-Sen (SRD §16.1) ──

class TheilSenResult(BaseModel):
    """Theil-Sen median slope estimator result."""
    slope_per_year: float = Field(..., description="Median slope in native units per year")
    slope_unit: str


# ── Autocorrelation (SRD §16.1) ──

class AutocorrelationResult(BaseModel):
    """Lag-1 autocorrelation of OLS residuals (SRD §16.3)."""
    lag1: float = Field(..., description="Lag-1 autocorrelation coefficient")
    warning: bool = Field(..., description="True if autocorrelation is material")
    message: str = Field("", description="Human-readable warning message")
    effective_n: Optional[int] = Field(None, description="Effective sample size after correction")
    adjusted_p_value: Optional[float] = Field(None, description="Autocorrelation-adjusted p-value")


# ── Significance Verdict (SRD §16.3) ──

class SignificanceVerdict(BaseModel):
    """Overall significance assessment following SRD §16.3 rules."""
    verdict: str = Field(
        ...,
        description="significant_increase | significant_decrease | no_significant_trend | insufficient_data"
    )
    confidence_level: float = Field(0.95, description="Confidence level used")
    exploratory_only: bool = Field(
        False,
        description="True if fewer than 120 monthly (or 10 annual) observations"
    )
    caveats: List[str] = Field(
        default_factory=list,
        description="List of caveats (autocorrelation, short record, etc.)"
    )


# ── Confidence Meter (SRD §11) ──

class ConfidenceFactor(BaseModel):
    """A single factor in the confidence meter."""
    rating: str = Field(..., description="Strong | Moderate | Weak")
    detail: str = Field(..., description="Human-readable explanation")


class ConfidenceMeter(BaseModel):
    """Dataset Confidence Meter (SRD §11 FR-QUAL-001 through FR-QUAL-006)."""
    overall: str = Field(..., description="High | Medium | Low")
    factors: dict[str, ConfidenceFactor] = Field(
        ...,
        description="Individual factors: record_length, missing_values, spatial_coverage, autocorrelation, data_type"
    )


# ── Full Analysis Result ──

class AnalysisResult(BaseModel):
    """Complete trend analysis result (SRD §16)."""
    variable: str
    variable_name: str
    region: str
    region_name: str
    unit: str
    cadence: str = "monthly"
    period: TemporalCoverage
    n_observations: int
    pct_missing: float
    dataset: str
    dataset_version: str
    provider: str
    data_type: str
    is_sample_data: bool = False

    # Statistical results
    ols: OLSResult
    mann_kendall: MannKendallResult
    theil_sen: TheilSenResult
    autocorrelation: AutocorrelationResult
    significance: SignificanceVerdict
    confidence_meter: ConfidenceMeter

    # Anomaly info
    baseline_period: Optional[TemporalCoverage] = None
    uses_anomalies: bool = False

    # Disclaimers
    disclaimer: str = "A trend does not by itself prove its cause or guarantee it will continue."


class AnalysisRequest(BaseModel):
    """Optional query parameters for analysis."""
    start_date: Optional[str] = Field(None, description="Override start date (YYYY-MM)")
    end_date: Optional[str] = Field(None, description="Override end date (YYYY-MM)")
    use_anomalies: bool = Field(True, description="Whether to use seasonal anomalies")
