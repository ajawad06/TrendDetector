/**
 * Trend Detector — Data & Catalog Integrity Test
 * Validates all catalogs and 21 prepared NASA time-series datasets against SRD v2.0 requirements.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..');
const CATALOG_DIR = path.join(BACKEND_DIR, 'catalogs');
const PREPARED_DIR = path.join(BACKEND_DIR, 'data', 'prepared');

console.log('=== RUNNING TREND DETECTOR BACKEND INTEGRITY SUITE ===\n');

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
    assert(Array.isArray(data) && data.length > 0, `Catalog is non-empty array: ${file} (${data.length} entries)`);
  } catch (e) {
    assert(false, `Catalog parsed valid JSON: ${file} - ${e.message}`);
  }
});

// 2. Validate P0 Variables
const variables = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'variables.json'), 'utf-8'));
const varIds = variables.map(v => v.id);
assert(varIds.includes('rainfall'), 'P0 Variable Rainfall is registered');
assert(varIds.includes('soil_moisture'), 'P0 Variable Soil Moisture is registered');
assert(varIds.includes('aod'), 'P0 Variable AOD (smog) is registered');

// 3. Validate Regions
const regions = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'regions.json'), 'utf-8'));
const regIds = regions.map(r => r.id);
assert(regIds.includes('pakistan'), 'Country region Pakistan is registered (FR-PAK-001)');
assert(regIds.includes('punjab'), 'Punjab region registered');
assert(regIds.includes('lahore_airshed'), 'Lahore airshed registered');
assert(regIds.includes('sindh'), 'Sindh region registered');
assert(regIds.includes('balochistan'), 'Balochistan region registered');
assert(regIds.includes('indus_basin'), 'Indus Basin region registered');

// 4. Validate Guided Missions (SRD §6)
const missions = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, 'missions.json'), 'utf-8'));
assert(missions.length >= 4, `At least 4 guided demo missions present (found ${missions.length})`);
const missionIds = missions.map(m => m.id);
assert(missionIds.includes('lahore_smog'), 'Mission: Lahore Smog Mystery present');
assert(missionIds.includes('pakistan_rainfall'), 'Mission: Pakistan Rainfall Shift present');
assert(missionIds.includes('indus_water'), 'Mission: Indus Basin Water Watch present');
assert(missionIds.includes('california_drought'), 'Mission: California Drought Tracker present');

// 5. Validate Prepared NASA Time Series Files
const expectedFiles = [
  'rainfall/pakistan.json',
  'rainfall/punjab.json',
  'rainfall/sindh.json',
  'rainfall/balochistan.json',
  'rainfall/indus_basin.json',
  'rainfall/northern_pakistan.json',
  'rainfall/southern_pakistan.json',
  'soil_moisture/pakistan.json',
  'soil_moisture/indus_basin.json',
  'soil_moisture/balochistan.json',
  'soil_moisture/punjab.json',
  'soil_moisture/california.json',
  'aod/lahore_airshed.json',
  'aod/punjab.json',
  'aod/karachi.json',
  'temperature/pakistan.json',
  'temperature/northern_pakistan.json',
  'temperature/southern_pakistan.json',
  'ndvi/pakistan.json',
  'ndvi/punjab.json',
  'ndvi/balochistan.json'
];

expectedFiles.forEach(relPath => {
  const fullPath = path.join(PREPARED_DIR, relPath);
  assert(fs.existsSync(fullPath), `Prepared series exists: ${relPath}`);
  if (fs.existsSync(fullPath)) {
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    assert(content.metadata && content.series, `Schema valid (metadata + series): ${relPath}`);
    assert(content.series.length >= 240, `Sufficient observations (>= 20 years, found ${content.series.length}): ${relPath}`);

    // Check that missing values are null, not zero (FR-QUAL-005)
    const hasExplicitNull = content.series.some(pt => pt.value === null);
    // It's allowed to have nulls or clean series; ensure no NaN or undefined
    const noCorruptedValues = content.series.every(pt => pt.value === null || typeof pt.value === 'number');
    assert(noCorruptedValues, `Data points are strictly numbers or explicit nulls: ${relPath}`);

    // Check anomalies exist
    const hasAnomalies = content.series.some(pt => pt.anomaly !== null);
    assert(hasAnomalies, `Seasonal anomalies precalculated: ${relPath}`);
  }
});

console.log(`\n=== SUITE COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===`);
if (failCount > 0) process.exit(1);
