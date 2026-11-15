# Trend Detector: frontend

Static, vanilla-JS (ES modules) app for the NASA Space Apps 2026 challenge. It shows monthly trends for **4 variables** (PM2.5, AOD, rainfall, NO₂) across **8 Pakistani cities**, 2005–2024 (240 observations each). All numbers come from `data/raw/pk_city_monthly_final.csv`; nothing is simulated.

## Layout
- `data/` single source of dataset JSON (series, regions, pollution index, patterns, metadata). Rebuild with `scripts/build_*.py`.
- `catalogs/` single source of missions, topics, variables, glossary (the FastAPI backend reads this folder too).
- `src/css/tokens.css` design tokens (light linen theme, dark via `prefers-color-scheme`).
- `src/js/` `router.js` (hash router), `util.js` (escaping), `stats.js`, `chart.js`, `map.js`, `pollution.js`, `patterns.js`, `app.js`.
- `api/` serverless functions (assistant chat, live PI). `server.js` local dev server.

## Pages (hash routes)
`#/home`, `#/trends?tab=explorer&var=pm25&city=lahore` (tabs: explorer, missions, contrasts, hotspots, patterns; `#/explore` and `#/discover` redirect here), `#/pollution`, `#/compare`, `#/data`, `#/about`. See `../docs/REDESIGN.md` for the audit, IA and migration status.

## Run and test
`npm run dev`, then from the repo root: `node tests/test_stats.js`, `node tests/test_live_pi.js`, `node tests/test_router_escape.mjs`, `node backend/tests/verify_integrity.js`, `python3 tests/test_pollution_index.py`.
