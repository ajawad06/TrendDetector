"""
Trend Detector — Constants and thresholds
SRD §16 significance rules and scientific constraints.
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
CONFIDENCE_MISSING_LOW = 5.0             # < 5% missing = strong
CONFIDENCE_MISSING_MODERATE = 15.0       # 5-15% missing = moderate

# ── Variable IDs ──
VALID_VARIABLE_IDS = [
    "rainfall", "soil_moisture", "aod", "no2",
    "temperature", "ndvi", "co2", "forest_loss"
]

# ── Priority Levels ──
PRIORITY_P0 = "P0"  # Must have
PRIORITY_P1 = "P1"  # Should have
PRIORITY_P2 = "P2"  # Nice to have

# ── Data Types ──
DATA_TYPE_SATELLITE = "satellite"
DATA_TYPE_MODEL = "model_reanalysis"
DATA_TYPE_REFERENCE = "reference"

# ── Cadence ──
CADENCE_MONTHLY = "monthly"
CADENCE_ANNUAL = "annual"

# ── Percentage Change Rules (SRD §7) ──
# Variables where percentage change is meaningful (true zero exists)
PCT_CHANGE_ALLOWED = ["rainfall", "no2", "aod", "ndvi", "forest_loss"]
# Variables where percentage change should NOT be used
PCT_CHANGE_FORBIDDEN = ["temperature"]  # Report degrees/year instead
# Variables needing special handling
PCT_CHANGE_CONDITIONAL = ["soil_moisture"]  # Only if baseline is defined

# ── Trend Directions ──
DIRECTION_INCREASING = "increasing"
DIRECTION_DECREASING = "decreasing"
DIRECTION_NO_TREND = "no_significant_trend"
DIRECTION_INSUFFICIENT = "insufficient_data"

# ── Confidence Meter Levels ──
CONFIDENCE_HIGH = "High"
CONFIDENCE_MEDIUM = "Medium"
CONFIDENCE_LOW = "Low"

# ── Topic IDs ──
VALID_TOPIC_IDS = [
    "air_pollution", "drought", "rainfall_patterns",
    "forest_loss", "climate_change", "agriculture", "ocean_health"
]
