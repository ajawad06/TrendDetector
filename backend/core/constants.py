"""
Trend Detector — Constants and thresholds
SRD §16 significance rules and scientific constraints.
Operating strictly on real dataset (pk_city_monthly_final.csv).
"""

# ── Significance Thresholds (SRD §16.3) ──
SIGNIFICANCE_ALPHA = 0.05          # p < 0.05 for 95% confidence
CONFIDENCE_LEVEL = 0.95

# ── Minimum Data Requirements (SRD §16.3) ──
MIN_MONTHLY_OBSERVATIONS = 120     # 10 years of monthly data
MIN_ANNUAL_OBSERVATIONS = 10       # 10 years of annual data

# ── Autocorrelation Warning Threshold (SRD §16.3) ──
AUTOCORRELATION_WARNING_THRESHOLD = 0.3  # lag-1 > 0.3 triggers warning

# ── Confidence Meter Thresholds (SRD §11) ──
CONFIDENCE_RECORD_LENGTH_STRONG = 240    # 20+ years
CONFIDENCE_RECORD_LENGTH_MODERATE = 120  # 10-20 years
CONFIDENCE_MISSING_LOW = 0.0             # 0% missing = strong
CONFIDENCE_MISSING_MODERATE = 5.0        # < 5% missing = moderate

# ── Valid Variable IDs (Strictly Real Dataset) ──
VALID_VARIABLE_IDS = ["pm25", "aod", "rain_mm", "no2"]

# ── Priority Levels ──
PRIORITY_P0 = "P0"

# ── Cadence ──
CADENCE_MONTHLY = "monthly"

# ── Percentage Change Rules ──
PCT_CHANGE_ALLOWED = ["pm25", "aod", "rain_mm", "no2"]
PCT_CHANGE_FORBIDDEN = []

# ── Trend Directions ──
DIRECTION_INCREASING = "increasing"
DIRECTION_DECREASING = "decreasing"
DIRECTION_NO_TREND = "stable"
DIRECTION_INSUFFICIENT = "insufficient_data"

# ── Confidence Meter Levels ──
CONFIDENCE_HIGH = "High"
CONFIDENCE_MEDIUM = "Medium"
CONFIDENCE_LOW = "Low"

# ── Supported Topic IDs ──
VALID_TOPIC_IDS = ["air_pollution", "rainfall_patterns"]
