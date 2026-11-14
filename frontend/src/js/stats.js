/**
 * Trend Detector — Browser-Side Statistical Analysis Engine
 * SRD §4: Statistics run in the browser in a project-written module (src/lib/stats.js)
 * so results update instantly.
 * SRD §16: OLS, Mann-Kendall, Theil-Sen, Autocorrelation, Anomalies.
 */

// 1. OLS Linear Regression
export function computeOLS(times, values, unit, pctChangeOk = true, periodYears = 1.0) {
  const n = values.length;
  if (n < 3) return emptyOLS(unit);

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += times[i];
    sumY += values[i];
    sumXY += times[i] * values[i];
    sumXX += times[i] * times[i];
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Residuals and standard error
  let ssTot = 0, ssRes = 0;
  const meanY = sumY / n;
  for (let i = 0; i < n; i++) {
    const yPred = slope * times[i] + intercept;
    ssRes += Math.pow(values[i] - yPred, 2);
    ssTot += Math.pow(values[i] - meanY, 2);
  }

  const rSquared = ssTot > 0 ? Math.max(0, 1 - (ssRes / ssTot)) : 0;
  const s2 = ssRes / (n - 2);
  const seSlope = Math.sqrt(s2 / (sumXX - (sumX * sumX) / n));

  // t-test p-value approximation
  const tStat = seSlope > 0 ? Math.abs(slope / seSlope) : 0;
  const pValue = approxTPValue(tStat, n - 2);

  // 95% Confidence interval (t critical approx 1.96 for n >= 120)
  const tCrit = n > 30 ? 1.96 : 2.05;
  const ciLower = slope - tCrit * seSlope;
  const ciUpper = slope + tCrit * seSlope;

  const totalChange = slope * periodYears;
  let totalChangePct = null;
  if (pctChangeOk && Math.abs(intercept) > 1e-6) {
    totalChangePct = parseFloat(((totalChange / Math.abs(intercept)) * 100).toFixed(1));
  }

  return {
    slope_per_year: parseFloat(slope.toFixed(6)),
    slope_unit: `${unit}/year`,
    intercept: parseFloat(intercept.toFixed(4)),
    p_value: parseFloat(pValue.toFixed(6)),
    ci_95_lower: parseFloat(ciLower.toFixed(6)),
    ci_95_upper: parseFloat(ciUpper.toFixed(6)),
    r_squared: parseFloat(rSquared.toFixed(4)),
    total_change: parseFloat(totalChange.toFixed(4)),
    total_change_pct: totalChangePct
  };
}

// 2. Mann-Kendall Trend Test
export function computeMannKendall(values) {
  const n = values.length;
  if (n < 4) {
    return { direction: "insufficient_data", z_statistic: 0, p_value: 1.0, tau: 0 };
  }

  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = values[j] - values[i];
      if (diff > 0) s += 1;
      else if (diff < 0) s -= 1;
    }
  }

  // Tied ranks adjustment
  const counts = {};
  values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  let tieSum = 0;
  Object.values(counts).forEach(t => {
    if (t > 1) tieSum += t * (t - 1) * (2 * t + 5);
  });

  const varS = (n * (n - 1) * (2 * n + 5) - tieSum) / 18.0;

  let z = 0;
  if (s > 0) z = (s - 1) / Math.sqrt(varS);
  else if (s < 0) z = (s + 1) / Math.sqrt(varS);

  const pValue = 2.0 * (1.0 - approxNormalCDF(Math.abs(z)));
  const nPairs = (n * (n - 1)) / 2;
  const tau = nPairs > 0 ? s / nPairs : 0;

  let direction = "no_trend";
  if (pValue < 0.05) {
    direction = s > 0 ? "increasing" : "decreasing";
  }

  return {
    direction,
    z_statistic: parseFloat(z.toFixed(4)),
    p_value: parseFloat(pValue.toFixed(6)),
    tau: parseFloat(tau.toFixed(4))
  };
}

// 3. Theil-Sen Median Slope
export function computeTheilSen(times, values, unit) {
  const n = values.length;
  if (n < 3) return { slope_per_year: 0, slope_unit: `${unit}/year` };

  const slopes = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dt = times[j] - times[i];
      if (Math.abs(dt) > 1e-6) {
        slopes.push((values[j] - values[i]) / dt);
      }
    }
  }

  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const median = slopes.length % 2 === 0
    ? (slopes[mid - 1] + slopes[mid]) / 2
    : slopes[mid];

  return {
    slope_per_year: parseFloat(median.toFixed(6)),
    slope_unit: `${unit}/year`
  };
}

// 4. Lag-1 Autocorrelation
export function computeAutocorrelation(times, values, threshold = 0.3) {
  const n = values.length;
  if (n < 10) return { lag1: 0, warning: false, message: "" };

  const ols = computeOLS(times, values, "");
  const residuals = [];
  for (let i = 0; i < n; i++) {
    residuals.push(values[i] - (ols.slope_per_year * times[i] + ols.intercept));
  }

  // Correlation between res[0..n-2] and res[1..n-1]
  const meanRes = residuals.reduce((a, b) => a + b, 0) / n;
  let num = 0, den1 = 0, den2 = 0;
  for (let i = 0; i < n - 1; i++) {
    const diff1 = residuals[i] - meanRes;
    const diff2 = residuals[i + 1] - meanRes;
    num += diff1 * diff2;
    den1 += diff1 * diff1;
    den2 += diff2 * diff2;
  }

  const r1 = den1 > 0 && den2 > 0 ? num / Math.sqrt(den1 * den2) : 0;
  const warning = Math.abs(r1) >= threshold;
  const message = warning
    ? `Moderate autocorrelation detected (lag-1 = ${r1.toFixed(2)}). Nearby months are correlated, which may make the p-value appear more significant than it is. Interpret with caution.`
    : "";

  return {
    lag1: parseFloat(r1.toFixed(4)),
    warning,
    message
  };
}

// 5. Confidence Meter
export function computeConfidenceMeter(nObs, pctMissing, lag1, dataType) {
  const factors = {
    record_length: {
      rating: nObs >= 240 ? "Strong" : nObs >= 120 ? "Moderate" : "Weak",
      detail: `${nObs} monthly observations (${Math.floor(nObs / 12)} years)`
    },
    missing_values: {
      rating: pctMissing <= 5 ? "Strong" : pctMissing <= 15 ? "Moderate" : "Weak",
      detail: `${pctMissing.toFixed(1)}% missing values`
    },
    spatial_coverage: {
      rating: "Strong",
      detail: "Area-weighted regional average (cosine-latitude masked)"
    },
    autocorrelation: {
      rating: Math.abs(lag1) < 0.3 ? "Strong" : "Weak",
      detail: `Lag-1 = ${lag1.toFixed(2)} (${Math.abs(lag1) < 0.3 ? "Low autocorrelation" : "Interpret p-value with caution"})`
    },
    data_type: {
      rating: dataType === 'satellite' ? 'Strong' : 'Moderate',
      detail: dataType === 'satellite' ? 'Direct NASA satellite observation' : 'NASA model/reanalysis output'
    }
  };

  let overall = "Medium";
  if (nObs >= 240 && pctMissing <= 5 && Math.abs(lag1) < 0.3) overall = "High";
  else if (nObs < 120 || pctMissing > 15) overall = "Low";

  return { overall, factors };
}

// Helper math functions
function approxNormalCDF(x) {
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2.0);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1.0 - prob : prob;
}

function approxTPValue(t, df) {
  // Simple student-t asymptotic approximation
  const normalP = 2.0 * (1.0 - approxNormalCDF(t));
  if (df > 30) return normalP;
  return Math.min(1.0, normalP * (1.0 + 1.0 / (4 * df)));
}

function emptyOLS(unit) {
  return {
    slope_per_year: 0, slope_unit: `${unit}/year`,
    intercept: 0, p_value: 1.0, ci_95_lower: 0, ci_95_upper: 0,
    r_squared: 0, total_change: 0, total_change_pct: null
  };
}
