# Trend Detector — Frontend

**NASA Space Apps Challenge 2026: Earth System Trend Detective**
**Version 2.0 | November 2026**

The Trend Detector frontend is an interactive, responsive web application that turns NASA satellite and model-derived data into a data detective investigation.

---

## Color Palette Hierarchy

Based on your design specifications:

| Role | Color Swatch | Hex Code | Applied Elements |
|---|---|---|---|
| **1. MAIN COLOR** | **Meadow & Forest Green** | `#476E2A` & `#B8DB94` | Brand identity, navbar background, hero banner, primary action buttons (`btn-primary`), OLS trend line, active navigation states, story verdict tags |
| **2. SECOND COLOR** | **Deep Espresso Earth Brown** | `#4A3528` & `#5C4333` | Core headings, primary typography, observed data series line on chart, metric values, secondary buttons |
| **3. THIRD COLOR** | **Warm Sand Camel Light Brown** | `#CBAB8D` & `#F6F1EA` | Card borders, soft beige card backgrounds, tertiary chips, map subregion outlines, climatological baseline |

---

## Full Frontend & Backend Integration

The system can run in two seamlessly integrated modes:

### Mode A: Integrated FastAPI Server (Single Port)
Mounts the frontend static assets directly within FastAPI. Both the UI and all REST endpoints run on a single port:
```bash
cd backend
uvicorn main:app --reload --port 8000
```
- Interactive Frontend: `http://localhost:8000/`
- Interactive API Swagger: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

### Mode B: Lightweight Node Server with API Proxy
```bash
cd frontend
node server.js
```
- Frontend at `http://localhost:5173`
- All `/api/*` calls are automatically proxied to `http://localhost:8000` when the backend is running, and automatically fall back to local prepared NASA datasets when offline.

---

## Features Implemented (SRD v2.0)

1. **Guided Demo Missions (SRD §6)**:
   - *Lahore Smog Mystery* (MODIS AOD)
   - *Pakistan Rainfall Shift* (GPM IMERG)
   - *Indus Basin Water Watch* (GLDAS Soil Moisture)
   - *California Drought Tracker* (GLDAS Soil Moisture)
2. **Investigation Wizard (SRD §5.2)**: Topic chips for Air Pollution, Drought, Rainfall Patterns, Climate Change, and Agriculture with automatic variable/region recommendations.
3. **Trend Story Result Card (SRD §7)**: Answers the 4 core questions:
   - *What Changed?*
   - *Where?*
   - *How Much?*
   - *Statistically Significant?*
   - *Why This Matters* educational panel (SRD §8)
   - *Show the Numbers* expandable statistical breakdown
4. **Time Series Visualizer (SRD §17)**:
   - Raw monthly context line vs. Seasonal anomalies primary line
   - Fitted OLS linear trend line in Meadow Green
   - **Gaps for missing observations** (never zeros or silent interpolation)
   - Interactive hover tooltips with native units and anomalies
5. **Interactive Pakistan Regional Map (SRD §15)**:
   - Leaflet map centered on Pakistan with province & basin polygons
   - Clickable boundaries to instantly focus investigations
6. **Dataset Confidence Meter (SRD §11)**:
   - Overall rating (High, Medium, Low)
   - 5 transparent factor boxes (record length, missingness, spatial coverage, autocorrelation, data type)
7. **Learning Mode ("Explain Like I'm 15") (SRD §12)**:
   - Prominent toggle in top navigation
   - Translates statistical jargon (Mann-Kendall, Theil-Sen, p-value, anomalies) into plain language
8. **AI Trend Detective Assistant (SRD §13)**:
   - Floating chat drawer with deterministic, non-hallucinatory trend answers
9. **Export & Sharing (SRD §18)**:
   - One-click CSV download with metadata headers
   - Markdown investigation report generation
   - Shareable URLs retaining variable and region parameters

---

## Running the Frontend

### Option 1: Native Node.js Server (Zero Dependencies)
```bash
node server.js
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Option 2: Directly with any Static File Server
```bash
# e.g., using Python:
python -m http.server 5173
# or npx serve:
npx serve .
```

---

## Frontend Architecture

```
frontend/
├── index.html               # Main entrypoint
├── server.js                # Built-in lightweight HTTP server
├── src/
│   ├── css/
│   │   └── style.css        # Custom design system with requested color palette
│   └── js/
│       ├── api.js           # Unified API client with automatic fallback
│       ├── stats.js         # Browser-side statistical engine (OLS, Mann-Kendall, Theil-Sen)
│       ├── chart.js         # High-DPI Canvas time-series visualizer with gap rendering
│       ├── map.js           # Leaflet interactive regional map
│       └── app.js           # Main application controller and event bus
└── tests/
    └── verify_frontend.js   # Automated asset & requirement verification suite
```
