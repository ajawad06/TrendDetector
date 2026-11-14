# CHANGES.md — Project Overhaul & Real Dataset Migration Log

This document lists all changes, deleted files, additions, and architectural decisions made during the overhaul of **Trend Detector** (NASA Space Apps Challenge 2026: *Earth System Trend Detective*).

The system has been completely restructured to run **exclusively** on the verified observational dataset:
`data/raw/pk_city_monthly_final.csv` (1,920 rows = 8 cities × 240 months, 2005-01 to 2024-12).

---

## 1. Summary of Changes by Phase

### Phase 1: Audit and Removal of Synthetic Data
- Conducted exhaustive audit across frontend, backend, pipelines, tests, and documentation for synthetic data, pseudorandom generators, and unsupported variables.
- Documented all findings in `AUDIT.md`.
- **Deleted Generators & Synthetic Pipelines**:
  - `backend/scripts/generate_prepared_data.js` (deleted)
  - `backend/pipeline/earthdata_auth.py` (deleted)
  - `backend/pipeline/download_nasa.py` (deleted)
  - `backend/data/prepared/**` (all 23+ synthetic prepared JSON files deleted)
  - `frontend/data/prepared/**` (all duplicates deleted)
- **Eliminated Unsupported Variables & Regions**:
  - Removed `soil_moisture`, `temperature`, `ndvi`, `co2`, and `forest_loss`.
  - Removed fictitious polygon regions (`amazon`, `california`, `global`, `indus_basin`, `northern_pakistan`, `southern_pakistan`).
  - Removed unsupported satellite references (`GPM`, `GLDAS`, `MERRA-2`, `SMAP`, `OCO-2`, `Hansen`).
  - Removed polygon masking, area-weighted mean simulations, and fake grid-cell maps.

### Phase 2: Data Layer and Statistics Engine
- **Data Ingestion & Validation (`scripts/build_data.py`)**:
  - Validates `data/raw/pk_city_monthly_final.csv` against strict schema rules.
  - Validates 240 consecutive months (2005-01 to 2024-12) per city with 0 nulls.
  - Fails loudly on schema mismatch, missing months, non-numeric values, or inconsistent coordinates.
  - Generates `public/data/series.json` and `public/data/regions.json`.
  - Preserves all 39 legitimate zero rainfall values as real measurements.
- **Data Metadata (`data/metadata.json`)**:
  - Created metadata dictionary for `pm25`, `aod`, `rain_mm`, and `no2`.
  - `provider`, `product`, `version`, and `citation` set to `null` initially (user will fill in).
  - Displays `"Source: not specified"` in UI with console warning.
- **Statistical Benchmark (`scripts/make_reference.py`)**:
  - Computes SciPy & PyMannKendall reference stats for all 32 city × variable combinations.
  - Saves to `tests/reference_results.json`.
- **Browser Statistics Engine (`frontend/src/js/stats.js`)**:
  - OLS Linear Regression (slope, intercept, $R^2$, standard error, p-value, 95% CI).
  - Mann-Kendall Trend Test with tied-ranks adjustment ($S$, $\text{var}(S)$, $Z$, $\tau$, p-value).
  - Theil-Sen Median Slope estimator.
  - Lag-1 Autocorrelation ($r_1$) on OLS residuals.
  - Effective sample size: $n_{\text{eff}} = n \frac{1 - r_1}{1 + r_1}$, clamped to $[10, n]$.
  - Autocorrelation-adjusted p-value using $n_{\text{eff}}$.
  - Linearity concordance check comparing OLS slope to Theil-Sen slope.
  - Climatological anomaly calculation (subtracting monthly multi-year means).
  - Three-tiered verdict classification:
    - `significant`: $p < 0.05$ and $p_{\text{adj}} < 0.05$ with linear agreement.
    - `caution`: $p < 0.05$ but moderate persistence ($|r_1| \ge 0.3$) or non-linear divergence.
    - `no_trend`: $p \ge 0.05$.
- **Test Suites (`tests/test_stats.js`, `tests/test_validation.py`, `backend/tests/verify_integrity.js`, `frontend/tests/verify_frontend.js`)**:
  - 384 mathematical assertions matching SciPy reference outputs.
  - Validation failure checks testing corrupted headers, missing files, and NaN rejections.
  - 7,758 real data point integrity checks passing cleanly.

### Phase 3: UI, Missions, and Interactive Features
- **Frontend Architecture (`frontend/src/js/api.js`, `app.js`, `chart.js`, `map.js`)**:
  - Single data entry point loading `public/data/series.json` with zero synthetic fallback.
  - Fatal error screen presented if dataset fails to load.
- **Investigation Flow Wizard ("What do you want to investigate?")**:
  - 2 topics: *Air Pollution* (recommends PM2.5, AOD, NO₂) and *Rainfall Patterns* (recommends Monthly Rainfall).
- **Trend Story Generator (Priority 2)**:
  - Natural language template answering WHAT CHANGED?, WHERE?, HOW MUCH?, IS IT SIGNIFICANT?, WHY MIGHT IT MATTER?
  - All figures calculated live from real series.
- **Guided Demo Missions (Priority 4)**:
  1. *Lahore Smog Mystery* (PM2.5 in Lahore, with tabs for AOD and NO₂).
  2. *Opposite NO₂ Trends* (Multan vs. Peshawar).
  3. *Quetta Clearing Skies* (AOD in Quetta).
  4. *Peshawar Rainfall Decline vs. Karachi* (Monthly rainfall shift).
- **Trend Opposites Explorer (Priority 3)**:
  - Live side-by-side contrast of opposite trends.
  - Includes shared-cell caveat for nearby cities (Lahore/Faisalabad, Islamabad/Peshawar, Karachi/Hyderabad).
- **City Trend Map (Leaflet)**:
  - 8 point markers at real coordinates with directional arrows and significance rings.
- **Featured Trends Leaderboard**:
  - Ranked multi-decadal trends across all 32 series with FDR validation.
- **Dataset Confidence Meter (Priority 7)**:
  - 4 objective factors: 240 monthly points (20 years), 0% missing, autocorrelation $r_1$, and point coordinates.
- **Learning Mode ("Explain Like I'm 15") (Priority 8)**:
  - Translates statistical terminology into plain high-school explanations.
- **AI Trend Detective Assistant**:
  - Grounded strictly in the 4 observational variables and 8 cities.
  - Rejects queries outside dataset scope.
  - Never invents numbers or makes unsupported causal claims.
  - Keeps API key server-side in `frontend/server.js`.
- **Export Capabilities**:
  - Live CSV download of observed series and anomalies.
  - PNG snapshot of HTML5 canvas.
  - Markdown investigation report.
  - Shareable URL parameters (`?var=pm25&reg=lahore&mode=anomaly`).

### Phase 5: UI Redesign & Monochromatic Deep Forest System
- **Deep Forest Monochromatic Palette**:
  - Implemented 6-tone color system: `#051F20` (Obsidian canvas), `#0B2B26` (Forest card surface), `#163832` (Pine border/elevated), `#235347` (Mid forest action), `#8EB69B` (Sage green muted labels/series line), `#DAF1DE` (Mint text highlights/OLS line).
- **Dashboard Visual Architecture**:
  - Redesigned card layouts with 14px–20px rounded geometry, subtle borders, ambient backdrop blur, glowing mint and sage accents.
  - Redesigned status indicators, interactive curiosity topics, and directional contrast cards.
- **High-Performance Canvas Rendering**:
  - Time series canvas visualizer updated to dark mode with `#8EB69B` observed series line, `#DAF1DE` glowing OLS fit line, subtle grid lines, and high-contrast dark tooltip.
- **Leaflet Dark Map Theme**:
  - Integrated custom dark cartography styling without external API key requirements.
  - Updated city station markers with glowing directional indicators and significance rings.

---

## 2. Reasonable Architectural Decisions

1. **Standard Library Python for Build Script**:
   - `scripts/build_data.py` uses Python's built-in `csv`, `json`, and `math` libraries rather than third-party C extensions that could trigger local Windows AppLocker policy restrictions.
2. **NO₂ Display Scaling**:
   - NO₂ column densities ($\approx 10^{15} \text{ molecules/cm}^2$) are scaled by $10^{15}$ for user-facing UI labels and charts (`×10¹⁵ molecules/cm²`), while retaining raw unscaled floating-point numbers in all internal statistical computations.
3. **Rainfall Zero Preservation**:
   - 39 legitimate monthly zero values in `rain_mm` are strictly preserved as true observations and never treated as null or missing.
4. **Shared Data Cell Caveats**:
   - Nearby cities (Lahore/Faisalabad, Islamabad/Peshawar, Karachi/Hyderabad) include explicit scientific caveats regarding spatial independence.
5. **Data Provenance**:
   - In accordance with instructions, since original satellite product names were not in the CSV header, `provider`, `product`, `version`, and `citation` are set to `null` in `data/metadata.json`. The UI displays `"Source: not specified"` and logs a warning for unpopulated fields until filled in.

---

## 3. Verification Status

| Test Suite | File | Checks Passed | Status |
|---|---|---|---|
| Statistical Benchmark | `tests/test_stats.js` | 384 / 384 | **PASS** |
| Validation Failure Modes | `tests/test_validation.py` | 3 / 3 | **PASS** |
| Data & Catalog Integrity | `backend/tests/verify_integrity.js` | 7,758 / 7,758 | **PASS** |
| Frontend Assets & Selectors | `frontend/tests/verify_frontend.js` | 20 / 20 | **PASS** |
