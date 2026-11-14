/**
 * Trend Detector — Data & Catalog Integrity Test
 * Validates catalogs and real observation dataset (pk_city_monthly_final.csv / series.json).
 */

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const CATALOG_DIR = path.join(BACKEND_DIR, 'catalogs');
const SERIES_PATH = path.join(BACKEND_DIR, '..', 'public', 'data', 'series.json');

console.log('=== RUNNING TREND DETECTOR INTEGRITY SUITE (REAL DATASET) ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

// 1. Validate Catalogs exist and parse
const catalogFiles = [
  'variables.json',
  'regions.json',
  'missions.json',
  'datasets.json',
  'topics.json',
  'learning_terms.json',
  'hotspots.json',
  'comparison_presets.json'
];

catalogFiles.forEach(file => {
  const filePath = path.join(CATALOG_DIR, file);
  assert(fs.existsSync(filePath), `Catalog exists: ${file}`);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    assert(data !== null, `Catalog parsed valid JSON: ${file}`);
  } catch (e) {
    assert(false, `Catalog parsed valid JSON: ${file} - ${e.message}`);
  }
});

// 2. Validate P0 Variables (Strictly 4)
const variables = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'variables.json'), 'utf-8'));
const varIds = variables.map(v => v.id);
assert(varIds.length === 4, `Exactly 4 variables registered (found ${varIds.length})`);
assert(varIds.includes('pm25'), 'Variable pm25 registered');
assert(varIds.includes('aod'), 'Variable aod registered');
assert(varIds.includes('rain_mm'), 'Variable rain_mm registered');
assert(varIds.includes('no2'), 'Variable no2 registered');

// 3. Validate Regions (Strictly 8 point cities)
const regionsData = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'regions.json'), 'utf-8'));
const regions = regionsData.regions || regionsData;
const regIds = regions.map(r => r.id);
assert(regIds.length === 8, `Exactly 8 cities registered (found ${regIds.length})`);
['lahore', 'karachi', 'islamabad', 'peshawar', 'quetta', 'faisalabad', 'multan', 'hyderabad'].forEach(c => {
  assert(regIds.includes(c), `City registered: ${c}`);
});

// 4. Validate Guided Missions (Strictly 4 real missions)
const missions = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'missions.json'), 'utf-8'));
assert(missions.length === 4, `Exactly 4 guided demo missions present (found ${missions.length})`);
const missionIds = missions.map(m => m.id);
assert(missionIds.includes('lahore_smog'), 'Mission: Lahore Smog Mystery present');
assert(missionIds.includes('opposite_no2'), 'Mission: Opposite NO2 Trends present');
assert(missionIds.includes('quetta_clearing'), 'Mission: Quetta Clearing Skies present');
assert(missionIds.includes('peshawar_rain_shift'), 'Mission: Peshawar Rainfall Decline vs Karachi present');

// 5. Validate Real Series JSON File
assert(fs.existsSync(SERIES_PATH), 'public/data/series.json exists');
const series = JSON.parse(fs.readFileSync(SERIES_PATH, 'utf-8'));

let totalZeros = 0;
let totalPoints = 0;

for (const c of regIds) {
  assert(series[c] !== undefined, `Series data contains city ${c}`);
  for (const v of varIds) {
    const pts = series[c]?.variables?.[v];
    assert(Array.isArray(pts) && pts.length === 240, `${c} -> ${v} has exactly 240 monthly points`);
    pts.forEach(p => {
      totalPoints++;
      assert(typeof p.value === 'number' && !isNaN(p.value), `${c} ${v} ${p.date} has valid numeric value`);
      if (v === 'rain_mm' && p.value === 0.0) {
        totalZeros++;
      }
    });
  }
}

assert(totalPoints === 8 * 4 * 240, `Total points across 32 series is exactly 7680 (found ${totalPoints})`);
assert(totalZeros === 39, `Legitimate zero rain count is exactly 39 (found ${totalZeros})`);

console.log(`\n=== INTEGRITY SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===`);
if (failCount > 0) process.exit(1);
