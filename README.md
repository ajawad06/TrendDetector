# Trend Detector: Earth System Trend Detective

**NASA Space Apps Challenge 2026**  
*Challenge: "Earth System Trend Detective"*  
*Repository: [(https://github.com/fuzailfaraz/TrendDetector)](https://github.com/fuzailfaraz/TrendDetector)]

---

## 🌍 Overview

**Trend Detector** is an interactive Earth-system investigation platform designed to empower students, researchers, and citizen scientists to become data detectives.

The system is built **exclusively on verified real-world monthly observations** from `data/raw/pk_city_monthly_final.csv`:
- **Period**: 2005-01-01 to 2024-12-01 (240 consecutive monthly observations per city, 20 years).
- **Locations**: 8 Pakistani cities (Lahore, Karachi, Islamabad, Peshawar, Quetta, Faisalabad, Multan, Hyderabad).
- **Variables**:
  - `pm25`: Fine Particulate Matter ($\mu\text{g/m}^3$)
  - `aod`: Aerosol Optical Depth (dimensionless)
  - `rain_mm`: Monthly Rainfall ($\text{mm/month}$, 39 legitimate zeros preserved)
  - `no2`: Tropospheric $\text{NO}_2$ Column Density ($\text{molecules/cm}^2$, displayed as $\times 10^{15}$)
- **Completeness**: 1,920 records (8 cities × 240 months). 100% complete with 0 null values.
- **Zero Mock / Synthetic Fallbacks**: If the dataset is unavailable, the application displays an explicit error screen rather than fallback numbers.

---

## 🚀 Key Features

### 1. Earth Detective Investigation Flow ("What do you want to investigate?")
Instead of a dry database query, users start with curiosity-driven investigation topics:
- **Air Pollution**: Recommends PM2.5, AOD, and $\text{NO}_2$ Column across industrial and urban corridors.
- **Rainfall Patterns**: Recommends Monthly Rainfall across highland and coastal zones.

### 2. Trend Story Generator (Priority 2)
Translates dense numerical regressions into a clear, narrative result card answering:
- **WHAT CHANGED?**: Direction and significance of historical pattern.
- **WHERE?**: Specific city and geographic coordinates.
- **HOW MUCH?**: Annual rate of change and cumulative total change over 2005–2024.
- **IS IT SIGNIFICANT?**: Clear statistical verdict supported by Mann-Kendall and OLS.
- **WHY MIGHT IT MATTER?**: Real-world systemic implications for agriculture, water security, and public health.
- **Show the Numbers**: Transparent statistical drawer displaying exact slopes, p-values, CI intervals, $R^2$, and autocorrelation.

### 3. Trend Opposites Explorer (Priority 3)
Addresses NASA's core challenge theme: *how the same variable moves in opposite directions across different regions over identical time periods*.
- **Contrasting NO₂ Trajectories**: Peshawar (surging $+4.46 \times 10^{13}$) vs. Multan (declining $-1.70 \times 10^{13}$).
- **Precipitation Divergence**: Northwestern drying in Peshawar ($-1.32\text{ mm/yr}$) vs. stable coastal conditions in Karachi.
- **Nearby Cities Caveat**: Explicit scientific caveat when comparing neighboring cities (e.g. Lahore & Faisalabad) that share underlying satellite grid columns.

### 4. Guided Demo Missions (Priority 4)
Four curated missions highlighting real planetary trends:
1. **Lahore Smog Mystery**: Is PM2.5 rising over the Lahore metropolitan corridor?
2. **Opposite NO₂ Trends**: Why is nitrogen dioxide surging in Peshawar while dropping in Multan?
3. **Quetta Clearing Skies**: Investigating significant high-altitude AOD decline over the western valley.
4. **Peshawar Rainfall Decline vs. Karachi**: Northwestern highland precipitation shifts compared to the coast.

### 5. Interactive City Trend Map (Leaflet)
- Centered on Pakistan displaying all 8 cities at true latitude/longitude coordinates.
- Directional arrow markers showing trend direction (↑ increasing, ↓ decreasing, → stable) and significance rings.
- Clicking any marker immediately focuses the investigation workspace on that city.

### 6. Dataset Confidence Meter (Priority 7)
Transparent data quality indicator evaluating:
- Record length (240 monthly points, 20 years).
- Missing values (0% missing).
- Residual autocorrelation ($r_1$).
- Point coordinate spatial resolution.

### 7. Learning Mode ("Explain Like I'm 15") (Priority 8)
One-click toggle translating statistical terms into plain language:
- *Mann-Kendall p-value* $\rightarrow$ "The trend is unlikely to be caused by random chance."
- *Theil-Sen slope* $\rightarrow$ "A robust estimate of how quickly the variable changes, resistant to outliers."
- *Lag-1 Autocorrelation* $\rightarrow$ "Whether nearby months carry over, requiring extra caution before calling a trend real."

### 8. AI Trend Detective Assistant
- Built with Gemini 2.5 Flash and server-side statistical grounding in `frontend/server.js`.
- Strictly constrained to the 4 variables and 8 cities of the dataset.
- Rejects out-of-scope inquiries with an explanation of data boundaries.
- Adheres to non-causal language guidelines (a trend does not prove a single cause or guarantee future continuation).

---

## 🔬 Statistical Methodology

All statistics run client-side in `frontend/src/js/stats.js` for 0ms lag, and match reference benchmarks in `scripts/make_reference.py`:

1. **Ordinary Least Squares (OLS)**:
   $$\text{Slope} = \frac{\sum (t_i - \bar{t})(y_i - \bar{y})}{\sum (t_i - \bar{t})^2}$$
   Reports slope per year, intercept, $R^2$, standard error, t-statistic, two-tailed p-value, and 95% confidence intervals.
2. **Mann-Kendall Non-Parametric Test**:
   Rank correlation test with tied-ranks variance adjustment:
   $$\text{Var}(S) = \frac{n(n-1)(2n+5) - \sum t_i(t_i-1)(2t_i+5)}{18}$$
   Reports Kendall's $\tau$, $S$ statistic, standardized $Z$, and two-tailed p-value.
3. **Theil-Sen Median Slope**:
   Median of all $N(N-1)/2$ pairwise slopes $\frac{y_j - y_i}{t_j - t_i}$, robust against extreme values.
4. **Autocorrelation & Effective Sample Size**:
   Computes lag-1 autocorrelation $r_1$ on OLS residuals.
   Adjusts degrees of freedom via:
   $$n_{\text{eff}} = n \frac{1 - r_1}{1 + r_1} \quad (\text{clamped to } [10, n])$$
   Computes $p_{\text{adj}}$ using adjusted t-statistic.
5. **Three-Tiered Verdict System**:
   - **Significant**: $p < 0.05$, $p_{\text{adj}} < 0.05$, and OLS/Theil-Sen sign concordance.
   - **Significant with Caution**: $p < 0.05$ but $|r_1| \ge 0.3$ or non-linear divergence between OLS and Theil-Sen.
   - **No Significant Trend**: $p \ge 0.05$.

---

## 🎨 Design System & Color Palette

Built to adhere strictly to the project color specification:
- **Main / Primary**: Meadow & Forest Green (`#476E2A`, `#B8DB94`, `#5D8C3A`) for navigation, badges, hero, and significant trends.
- **Secondary**: Deep Espresso Earth Brown (`#4A3528`, `#5C4333`) for headings, primary time-series lines, and buttons.
- **Tertiary**: Warm Sand Camel Light Brown (`#CBAB8D`, `#F6F1EA`) for cards, borders, and baseline guides.
- **Background**: Crisp Linen Canvas (`#FBFBF9`).

---

## 🛠️ Installation & Reproduction

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Build Observational Data
Verify and compile the raw CSV into JSON series:
```bash
python scripts/build_data.py
```
*Validation checks 240 consecutive months, 0 nulls, consistent coordinates, and 39 legitimate rain zeros.*

### 2. Run Test Suite
Verify that statistical calculations match SciPy and PyMannKendall benchmarks:
```bash
# Run statistical verification suite (384 checks)
node tests/test_stats.js

# Run data validation failure tests
python tests/test_validation.py

# Run full integrity suite (7,758 checks)
node backend/tests/verify_integrity.js

# Run frontend assets verification
node frontend/tests/verify_frontend.js
```

### 3. Launch Web Application
Start the integrated server:
```bash
node frontend/server.js
```
Open **`http://localhost:5173`** in your browser.

---

## ⚠️ Scientific Limitations & Caveats

1. **Non-Causal Notice**: A statistical trend identifies temporal association in historical observations; it does not prove a cause or guarantee future continuation.
2. **Nearby Cities Dependency**: Cities in close geographic proximity (Lahore and Faisalabad; Islamabad and Peshawar; Karachi and Hyderabad) may share satellite footprint grid columns and are not statistically independent.
3. **Data Provenance**: Column names (`pm25`, `aod`, `rain_mm`, `no2`) are sourced from `pk_city_monthly_final.csv`. Hardware, sensor, and provider citations in `data/metadata.json` are initialized to `null` and displayed as `"Source: not specified"` until updated by researchers.
