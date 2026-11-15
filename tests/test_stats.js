/**
 * test_stats.js — Statistical Engine Verification Suite
 * Validates JavaScript statistical calculations against SciPy / PyMannKendall reference results.
 * Verifies all 32 city x variable series across both raw and anomaly data.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Import stats functions dynamically or as CommonJS/ESM
async function runTests() {
  console.log('======================================================');
  console.log('🧪 Trend Detector Statistical Verification Test Suite');
  console.log('======================================================\n');

  const statsModule = await import('../frontend/src/js/stats.js');
  const refPath = path.join(__dirname, 'reference_results.json');
  const seriesPath = path.join(__dirname, '..', 'frontend', 'data', 'series.json');

  assert(fs.existsSync(refPath), 'Reference results file must exist!');
  assert(fs.existsSync(seriesPath), 'Series data file must exist!');

  const referenceResults = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
  const seriesData = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'));

  const cities = ["lahore", "karachi", "islamabad", "peshawar", "quetta", "faisalabad", "multan", "hyderabad"];
  const variables = ["pm25", "aod", "rain_mm", "no2"];
  const units = {
    pm25: "µg/m³",
    aod: "dimensionless",
    rain_mm: "mm/month",
    no2: "molecules/cm²"
  };

  let passedChecks = 0;
  let totalChecks = 0;

  function assertRelDiff(actual, expected, maxRel, label) {
    totalChecks++;
    if (expected === 0) {
      assert(Math.abs(actual) <= maxRel, `${label}: Expected 0, got ${actual}`);
    } else {
      const relDiff = Math.abs((actual - expected) / expected);
      assert(relDiff <= maxRel, `${label}: relDiff ${relDiff} > maxRel ${maxRel} (actual: ${actual}, expected: ${expected})`);
    }
    passedChecks++;
  }

  console.log('--> Checking all 32 city x variable series against SciPy/PyMannKendall...');

  for (const city of cities) {
    for (const varId of variables) {
      const rawPoints = seriesData[city].variables[varId];
      const dates = rawPoints.map(p => p.date);
      const rawVals = rawPoints.map(p => p.value);
      const unit = units[varId];

      // 1. Raw Stats Check
      const rawAnalysis = statsModule.analyzeSeries(varId, city, dates, rawVals, unit, false);
      const refRaw = referenceResults[city][varId].raw;

      assertRelDiff(rawAnalysis.ols.slope_per_year, refRaw.ols.slope_per_year, 1e-5, `${city}-${varId}-raw-ols-slope`);
      assertRelDiff(rawAnalysis.ols.p_value, refRaw.ols.p_value, 2e-3, `${city}-${varId}-raw-ols-p`);
      assertRelDiff(rawAnalysis.theil_sen.slope_per_year, refRaw.theil_sen.slope_per_year, 1e-5, `${city}-${varId}-raw-ts-slope`);
      assertRelDiff(rawAnalysis.mann_kendall.tau, refRaw.mann_kendall.tau, 1e-5, `${city}-${varId}-raw-mk-tau`);
      assertRelDiff(rawAnalysis.mann_kendall.z_statistic, refRaw.mann_kendall.z_statistic, 1e-5, `${city}-${varId}-raw-mk-z`);
      assertRelDiff(rawAnalysis.autocorrelation.r1, refRaw.autocorrelation.r1, 1e-4, `${city}-${varId}-raw-r1`);

      // 2. Anomaly Stats Check
      const anomObj = statsModule.computeClimatologicalAnomalies(dates, rawVals);
      const anomAnalysis = statsModule.analyzeSeries(varId, city, dates, anomObj.anomalies, unit, true);
      const refAnom = referenceResults[city][varId].anomalies;

      assertRelDiff(anomAnalysis.ols.slope_per_year, refAnom.ols.slope_per_year, 1e-5, `${city}-${varId}-anom-ols-slope`);
      assertRelDiff(anomAnalysis.ols.p_value, refAnom.ols.p_value, 2e-3, `${city}-${varId}-anom-ols-p`);
      assertRelDiff(anomAnalysis.theil_sen.slope_per_year, refAnom.theil_sen.slope_per_year, 1e-5, `${city}-${varId}-anom-ts-slope`);
      assertRelDiff(anomAnalysis.mann_kendall.tau, refAnom.mann_kendall.tau, 1e-5, `${city}-${varId}-anom-mk-tau`);
      assertRelDiff(anomAnalysis.mann_kendall.z_statistic, refAnom.mann_kendall.z_statistic, 1e-5, `${city}-${varId}-anom-mk-z`);
      assertRelDiff(anomAnalysis.autocorrelation.r1, refAnom.autocorrelation.r1, 1e-4, `${city}-${varId}-anom-r1`);

      // No NaN checks
      assert(!isNaN(anomAnalysis.ols.slope_per_year), `${city}-${varId} slope is NaN`);
      assert(!isNaN(anomAnalysis.ols.p_value), `${city}-${varId} p_value is NaN`);
      assert(!isNaN(anomAnalysis.mann_kendall.p_value), `${city}-${varId} mk p_value is NaN`);
      assert(!isNaN(anomAnalysis.theil_sen.slope_per_year), `${city}-${varId} ts slope is NaN`);
    }
  }

  console.log(`✓ All 32 series matched reference calculations! (${passedChecks} assertions passed)\n`);

  // 3. Sanity-Check Validations
  console.log('--> Running Challenge Sanity Checks...');

  // Lahore pm25: upward slope, p < 0.01 (MK p on anomalies = 0.0081)
  const lahorePm25Pts = seriesData.lahore.variables.pm25;
  const lahoreAnoms = statsModule.computeClimatologicalAnomalies(lahorePm25Pts.map(p => p.date), lahorePm25Pts.map(p => p.value));
  const lahorePm25 = statsModule.analyzeSeries('pm25', 'lahore', lahorePm25Pts.map(p => p.date), lahoreAnoms.anomalies, 'µg/m³', true);
  assert(lahorePm25.ols.slope_per_year > 0, 'Lahore PM2.5 slope must be upward (> 0)');
  assert(lahorePm25.mann_kendall.p_value < 0.01, `Lahore PM2.5 MK p-value (${lahorePm25.mann_kendall.p_value}) must be < 0.01`);
  console.log(`✓ Sanity Check 1 Passed: Lahore PM2.5 upward (slope=+${lahorePm25.ols.slope_per_year.toFixed(4)}, MK p=${lahorePm25.mann_kendall.p_value.toFixed(4)} < 0.01)`);

  // Quetta aod: downward slope, p < 0.01
  const quettaAodPts = seriesData.quetta.variables.aod;
  const quettaAnoms = statsModule.computeClimatologicalAnomalies(quettaAodPts.map(p => p.date), quettaAodPts.map(p => p.value));
  const quettaAod = statsModule.analyzeSeries('aod', 'quetta', quettaAodPts.map(p => p.date), quettaAnoms.anomalies, 'dimensionless', true);
  assert(quettaAod.ols.slope_per_year < 0, 'Quetta AOD slope must be downward (< 0)');
  assert(quettaAod.ols.p_value < 0.01, `Quetta AOD OLS p-value (${quettaAod.ols.p_value}) must be < 0.01`);
  console.log(`✓ Sanity Check 2 Passed: Quetta AOD downward (slope=${quettaAod.ols.slope_per_year.toFixed(6)}, p=${quettaAod.ols.p_value.toFixed(4)} < 0.01)`);

  // Multan no2: downward slope, p < 0.01
  const multanNo2Pts = seriesData.multan.variables.no2;
  const multanAnoms = statsModule.computeClimatologicalAnomalies(multanNo2Pts.map(p => p.date), multanNo2Pts.map(p => p.value));
  const multanNo2 = statsModule.analyzeSeries('no2', 'multan', multanNo2Pts.map(p => p.date), multanAnoms.anomalies, 'molecules/cm²', true);
  assert(multanNo2.ols.slope_per_year < 0, 'Multan NO2 slope must be downward (< 0)');
  assert(multanNo2.mann_kendall.p_value < 0.01, `Multan NO2 MK p-value (${multanNo2.mann_kendall.p_value}) must be < 0.01`);
  console.log(`✓ Sanity Check 3 Passed: Multan NO2 downward (slope=${multanNo2.ols.slope_per_year.toExponential(4)}, MK p=${multanNo2.mann_kendall.p_value.toExponential(4)} < 0.01)`);

  // Peshawar no2: upward slope, p < 0.01
  const peshNo2Pts = seriesData.peshawar.variables.no2;
  const peshAnoms = statsModule.computeClimatologicalAnomalies(peshNo2Pts.map(p => p.date), peshNo2Pts.map(p => p.value));
  const peshNo2 = statsModule.analyzeSeries('no2', 'peshawar', peshNo2Pts.map(p => p.date), peshAnoms.anomalies, 'molecules/cm²', true);
  assert(peshNo2.ols.slope_per_year > 0, 'Peshawar NO2 slope must be upward (> 0)');
  assert(peshNo2.mann_kendall.p_value < 0.01, `Peshawar NO2 MK p-value (${peshNo2.mann_kendall.p_value}) must be < 0.01`);
  console.log(`✓ Sanity Check 4 Passed: Peshawar NO2 upward (slope=+${peshNo2.ols.slope_per_year.toExponential(4)}, MK p=${peshNo2.mann_kendall.p_value.toFixed(6)} < 0.01)`);

  // Peshawar rain_mm: downward slope
  const peshRainPts = seriesData.peshawar.variables.rain_mm;
  const peshRainAnoms = statsModule.computeClimatologicalAnomalies(peshRainPts.map(p => p.date), peshRainPts.map(p => p.value));
  const peshRain = statsModule.analyzeSeries('rain_mm', 'peshawar', peshRainPts.map(p => p.date), peshRainAnoms.anomalies, 'mm/month', true);
  assert(peshRain.ols.slope_per_year < 0, 'Peshawar rain slope must be downward (< 0)');
  console.log(`✓ Sanity Check 5 Passed: Peshawar Rainfall downward (slope=${peshRain.ols.slope_per_year.toFixed(4)} mm/yr)`);

  // Karachi rain_mm: near zero slope or not significant
  const karachiRainPts = seriesData.karachi.variables.rain_mm;
  const karachiRainAnoms = statsModule.computeClimatologicalAnomalies(karachiRainPts.map(p => p.date), karachiRainPts.map(p => p.value));
  const karachiRain = statsModule.analyzeSeries('rain_mm', 'karachi', karachiRainPts.map(p => p.date), karachiRainAnoms.anomalies, 'mm/month', true);
  assert(karachiRain.verdict.tier === 'no_trend' || karachiRain.ols.p_value > 0.05, 'Karachi rainfall must not be significant');
  console.log(`✓ Sanity Check 6 Passed: Karachi Rainfall not significant (p=${karachiRain.ols.p_value.toFixed(4)} > 0.05, tier=${karachiRain.verdict.tier})`);

  // 4. Rain legitimate zeros preservation check
  console.log('--> Checking rain_mm zero values preservation...');
  let totalZeros = 0;
  for (const c of cities) {
    const zeros = seriesData[c].variables.rain_mm.filter(p => p.value === 0.0).length;
    totalZeros += zeros;
  }
  assert.strictEqual(totalZeros, 39, `Expected exactly 39 legitimate rain zeros, found ${totalZeros}`);
  console.log(`✓ Legitimate zero rain preservation check passed: exactly 39 zeros preserved.`);

  console.log('\n======================================================');
  console.log(`🎉 ALL STATISTICAL INTEGRITY CHECKS PASSED (${passedChecks} checks)`);
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ STATISTICAL TEST FAILURE:', err);
  process.exit(1);
});
