# AUDIT.md — Synthetic & Mock Data Audit

This document records the audit of all synthetic, mock, generated, randomized, and unsupported data in the Trend Detector repository, conducted in accordance with Phase 1 requirements of the Real Dataset Overhaul.

Every item listed below has been identified for deletion or replacement with real computations derived strictly from `data/raw/pk_city_monthly_final.csv`.

---

## 1. Synthetic Data Generators & Pipelines

| File | Line(s) | Description / Finding | Action Taken |
|---|---|---|---|
| `backend/scripts/generate_prepared_data.js` | 1–280 | Script using `generateSeries()` with sine waves, trends, and Gaussian pseudo-random noise (`Math.random()`, seed-based jitter) to create synthetic JSON files for rainfall, soil moisture, aod, temperature, ndvi, co2 across 12 regions. | Deleted entirely. |
| `backend/pipeline/earthdata_auth.py` | 1–95 | Unused NASA Earthdata authentication pipeline code. | Deleted. |
| `backend/pipeline/download_nasa.py` | 1–110 | Placeholder Earthdata download scripts referencing GPM, GLDAS, MODIS. | Deleted. |

---

## 2. Prepared Synthetic Time Series Files

All JSON files in the prepared data directories contain generated time series (2000–2024 or 2015–2024) containing synthetic values, synthetic anomalies, and pre-calculated synthetic OLS statistics:

- `backend/data/prepared/aod/karachi.json`
- `backend/data/prepared/aod/lahore_airshed.json`
- `backend/data/prepared/aod/punjab.json`
- `backend/data/prepared/co2/global.json`
- `backend/data/prepared/ndvi/amazon.json`
- `backend/data/prepared/ndvi/balochistan.json`
- `backend/data/prepared/ndvi/pakistan.json`
- `backend/data/prepared/ndvi/punjab.json`
- `backend/data/prepared/rainfall/balochistan.json`
- `backend/data/prepared/rainfall/indus_basin.json`
- `backend/data/prepared/rainfall/northern_pakistan.json`
- `backend/data/prepared/rainfall/pakistan.json`
- `backend/data/prepared/rainfall/punjab.json`
- `backend/data/prepared/rainfall/sindh.json`
- `backend/data/prepared/rainfall/southern_pakistan.json`
- `backend/data/prepared/soil_moisture/balochistan.json`
- `backend/data/prepared/soil_moisture/california.json`
- `backend/data/prepared/soil_moisture/indus_basin.json`
- `backend/data/prepared/soil_moisture/pakistan.json`
- `backend/data/prepared/soil_moisture/punjab.json`
- `backend/data/prepared/temperature/northern_pakistan.json`
- `backend/data/prepared/temperature/pakistan.json`
- `backend/data/prepared/temperature/southern_pakistan.json`
- `frontend/data/prepared/**` (all duplicates of above)

**Action Taken**: Deleted all 23+ synthetic prepared JSON files in both `backend/data/prepared/` and `frontend/data/prepared/`.

---

## 3. Frontend Fallback & Mock Data in Code

| File | Line(s) | Description / Finding | Action Taken |
|---|---|---|---|
| `frontend/src/js/app.js` | 14–21 | `DEFAULT_VARIABLES` array containing unsupported variables: `soil_moisture`, `temperature`, `ndvi`, `co2`, along with unverified dataset names (GPM, GLDAS, MERRA-2, OCO-2). | Replaced with strict 4 variables: `pm25`, `aod`, `rain_mm`, `no2`. |
| `frontend/src/js/app.js` | 23–36 | `DEFAULT_REGIONS` array containing polygons and fictitious bounding boxes (`pakistan`, `indus_basin`, `northern_pakistan`, `southern_pakistan`, `california`, `amazon`, `global`, `lahore_airshed`). | Replaced with strict 8 point cities. |
| `frontend/src/js/app.js` | 38–44 | `DEFAULT_MISSIONS` array containing synthetic missions (`amazon_forest`, `california_drought`, `global_co2`, `pakistan_rainfall`). | Replaced with 4 real missions based on `pk_city_monthly_final.csv`. |
| `frontend/src/js/api.js` | 69–85 | `getFeaturedStory()` returning hardcoded synthetic story results for `lahore_smog`. | Replaced with live statistical computation. |
| `frontend/src/js/api.js` | 104–134 | Local fallback attempting to load nonexistent/synthetic files; error fallback was silent. | Replaced with strict error raising when data fails. |
| `frontend/src/js/api.js` | 183–206 | `chatAssistant()` local fallback with hardcoded numbers: "+0.0084 per year", "+18%", "+1.82 mm/month", "-0.118 kg/m²", "-9.8%", "+2.45 ppm/year". | Removed; assistant only reports live-computed metrics. |
| `frontend/server.js` | 200–225 | Entity extraction and mapping for `soil_moisture`, `temperature`, `ndvi`, `co2`, `amazon`, `california`, `indus_basin`. | Cleaned to 4 variables and 8 cities only. |
| `frontend/server.js` | 310–329 | Local fallback containing hardcoded story metrics. | Removed mock fallback; replaced with live dataset stats. |

---

## 4. Catalogs & Unsupported Domain Features

| Catalog File | Content to Remove | Action Taken |
|---|---|---|
| `catalogs/variables.json` | Entries for `soil_moisture`, `temperature`, `ndvi`, `co2`. | Retained only `pm25`, `aod`, `rain_mm`, `no2`. Set provider/product fields to null. |
| `catalogs/regions.json` | Entries for `pakistan`, `punjab`, `sindh`, `balochistan`, `indus_basin`, `northern_pakistan`, `southern_pakistan`, `california`, `amazon`, `global`. | Replaced with 8 point cities: Lahore, Karachi, Islamabad, Peshawar, Quetta, Faisalabad, Multan, Hyderabad. |
| `catalogs/missions.json` | Unsupported missions: `amazon_forest`, `california_drought`, `global_co2`, `pakistan_rainfall`. | Replaced with 4 verified real missions: Lahore Smog Mystery, Opposite NO2 Trends, Quetta Clearing Skies, Peshawar Rainfall Decline vs Karachi. |
| `catalogs/topics.json` | Wizard topics: Drought, Forest Loss, Climate Change, Agriculture, Ocean Health. | Replaced with supported topics: Air Pollution, Rainfall Patterns. |
| `catalogs/hotspots.json` | Unsupported global locations: Amazon, California, Arctic, Global. | Replaced with real trend rankings across the 32 city×variable series. |
| `catalogs/datasets.json` | Unverified sensor references (GPM, SMAP, GLDAS, OCO-2, Hansen). | Kept only verified citations or marked "Source: not specified" per specification. |
| `catalogs/comparison_presets.json` | Comparisons for Amazon vs Congo, California vs Indus. | Replaced with real city comparisons (e.g. Multan vs Peshawar, Lahore vs Faisalabad with shared-cell caveat). |

---

## 5. UI Layout Removals (`index.html`)

- Removed hero pills and badges referencing GPM IMERG, GLDAS Root-Zone, OCO-2, MODIS Forest, Amazon, California.
- Removed hardcoded trend narrative cards in "Trend Opposites Explorer" containing synthetic numbers (+1.82 mm/month/year, -0.118 kg/m²/year, etc.).
- Replaced with dynamic generation from real CSV data.
- Added explicit error screen banner when data fails to load (no fallback to fake data allowed).
