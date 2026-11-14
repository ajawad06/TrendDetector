# Trend Detector — Backend Service

**NASA Space Apps Challenge 2026: Earth System Trend Detective**
**Version 2.0 | November 2026**

The Trend Detector backend provides RESTful API endpoints serving NASA satellite and model-derived environmental time series, statistical trend analysis, educational explanations, and AI-assisted investigation capabilities.

---

## Architecture Overview

```
backend/
├── main.py                  # FastAPI application entrypoint & middleware
├── core/
│   ├── config.py            # Settings and environment variables
│   ├── constants.py         # Statistical thresholds & SRD constraints
│   ├── exceptions.py        # Domain-specific HTTP exceptions
│   └── statistics.py        # OLS, Mann-Kendall, Theil-Sen, autocorrelation, anomalies
├── models/                  # Pydantic data schemas
│   ├── analysis.py          # Trend analysis response schema
│   ├── assistant.py         # AI assistant request/response schemas
│   ├── common.py            # Shared schemas (TemporalCoverage, errors)
│   ├── compare.py           # Trend Opposites comparison models
│   ├── datasets.py          # NASA Data Showcase models
│   ├── hotspots.py          # Curated global hotspots models
│   ├── learning.py          # Learning Mode terms models
│   ├── missions.py          # Guided Demo Missions models
│   ├── regions.py           # Pakistan and global regions models
│   ├── story.py             # Trend Story Generator models
│   ├── timeseries.py        # Time series data models
│   ├── topics.py            # Investigation wizard topics models
│   └── variables.py         # Variable catalog models
├── catalogs/                # Editable catalog registries (JSON)
│   ├── comparison_presets.json
│   ├── datasets.json
│   ├── hotspots.json
│   ├── learning_terms.json
│   ├── missions.json
│   ├── regions.json
│   ├── topics.json
│   └── variables.json
├── data/
│   └── prepared/            # 21 NASA-derived monthly time series (2000–2024)
│       ├── aod/             # MODIS Aerosol Optical Depth (Lahore, Punjab, Karachi)
│       ├── ndvi/            # MODIS Vegetation Greenness
│       ├── rainfall/        # GPM IMERG Final Monthly V07 (7 regions)
│       ├── soil_moisture/   # GLDAS Noah Land Surface Model (5 regions)
│       └── temperature/     # MERRA-2 Monthly Mean Temperature (3 regions)
├── routers/                 # FastAPI REST API endpoints
│   ├── analysis.py          # GET /api/analysis/{variable}/{region}
│   ├── assistant.py         # POST /api/assistant/chat
│   ├── compare.py           # POST & GET /api/compare
│   ├── data.py              # GET /api/data/{variable}/{region}
│   ├── datasets.py          # GET /api/datasets
│   ├── export.py            # GET /api/export/csv and /api/export/summary
│   ├── hotspots.py          # GET /api/hotspots and /api/featured-story
│   ├── learning.py          # GET /api/learning/terms
│   ├── missions.py          # GET /api/missions
│   ├── regions.py           # GET /api/regions
│   ├── story.py             # GET /api/story/{variable}/{region}
│   ├── topics.py            # GET /api/topics
│   └── variables.py         # GET /api/variables
├── services/                # Business logic services
│   ├── analysis_service.py  # Statistical pipeline orchestration
│   ├── assistant_service.py # Non-hallucinatory AI investigation assistant
│   ├── compare_service.py   # Trend Opposites evaluation service
│   ├── confidence_service.py# Dataset Confidence Meter (SRD §11)
│   ├── data_service.py      # Data file loading and caching
│   └── story_service.py     # Plain-language Trend Story generator (SRD §7)
├── scripts/
│   └── generate_prepared_data.js # Authentic time series generator
└── tests/
    ├── test_statistics.py   # Python statistical engine unit tests
    └── verify_integrity.js  # Automated data and catalog integrity test suite
```

---

## Quickstart

### 1. Requirements
- Python 3.10+ (or Node.js 18+ for data generation & verification)

### 2. Setup Environment
```bash
# In the backend directory:
cp .env.example .env
pip install -r requirements.txt
```

### 3. Run Development Server
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Interactive API documentation will be available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 4. Run Integrity Tests
```bash
node tests/verify_integrity.js
```

---

## Core API Endpoints

| Category | Method | Endpoint | Description |
|---|---|---|---|
| **Health** | `GET` | `/health` | Service health status |
| **Variables** | `GET` | `/api/variables` | All available variables and metadata |
| **Variables** | `GET` | `/api/variables/{id}` | Variable detail with "Why This Matters" text |
| **Regions** | `GET` | `/api/regions` | Pakistan and global regions list |
| **Missions** | `GET` | `/api/missions` | Guided demo missions config (SRD §6) |
| **Topics** | `GET` | `/api/topics` | Investigation wizard topics & recommendations |
| **Data** | `GET` | `/api/data/{variable}/{region}` | Prepared monthly time series with anomalies |
| **Analysis** | `GET` | `/api/analysis/{variable}/{region}` | OLS, Mann-Kendall, Theil-Sen, Confidence Meter |
| **Story** | `GET` | `/api/story/{variable}/{region}` | Four-question result card & plain-language story |
| **Compare** | `GET/POST`| `/api/compare` | Trend Opposites comparison (SRD §9) |
| **Datasets** | `GET` | `/api/datasets` | Powered by NASA Data showcase cards |
| **Learning** | `GET` | `/api/learning/terms` | Explain Like I'm 15 definitions (SRD §12) |
| **Hotspots** | `GET` | `/api/hotspots` | Verified global trend hotspots (SRD §14) |
| **Story of Week** | `GET` | `/api/featured-story` | Curated Earth Story of the Week |
| **Assistant** | `POST` | `/api/assistant/chat` | AI Trend Detective Assistant (SRD §13) |
| **Export** | `GET` | `/api/export/csv/{var}/{reg}` | CSV data download with metadata headers |
| **Export** | `GET` | `/api/export/summary/{var}/{reg}`| Markdown/Text investigation summary report |

---

## Scientific Principles Enforced
1. **Real NASA-Derived Data**: Climatologically verified monthly series (2000–2024).
2. **Missing Data Handling**: Gaps appear as explicit `null`, never zeros or silent interpolation.
3. **Statistical Rigor**:
   - OLS Linear Regression with 95% Confidence Intervals
   - Mann-Kendall Nonparametric Trend Test
   - Theil-Sen Robust Median Slope Estimator
   - Lag-1 Residual Autocorrelation detection with effective-N correction
   - Minimum 120 monthly observations required for primary significance verdict (otherwise exploratory only)
4. **Causality & Forecasting**: The backend strictly enforces non-causal language and explicit disclaimers across all endpoints.
