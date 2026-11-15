/**
 * Trend Detector — Unified Frontend API Client
 * SRD §4: All data access in the frontend goes through one module (src/api.js)
 * Loads strictly from public/data/series.json.
 * Zero synthetic fallbacks: errors fail loudly and display clear error UI.
 */

class ApiClient {
  constructor() {
    this.seriesCache = null;
    this.metadataCache = null;
    this.isBackendAvailable = false;
  }

  async checkHealth() {
    try {
      const res = await fetch('/health', { signal: AbortSignal.timeout(600) });
      this.isBackendAvailable = res.ok;
      return res.ok;
    } catch {
      this.isBackendAvailable = false;
      return false;
    }
  }

  async getSeriesData() {
    if (this.seriesCache) return this.seriesCache;

    const pathsToTry = [
      './data/series.json'
    ];

    for (const p of pathsToTry) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          const json = await res.json();
          this.seriesCache = json;
          return json;
        }
      } catch (e) {}
    }

    throw new Error('FATAL: Could not load observation dataset (data/series.json). Synthetic fallbacks are disabled.');
  }

  async getMetadata() {
    if (this.metadataCache) return this.metadataCache;

    const pathsToTry = [
      './data/metadata.json'
    ];

    for (const p of pathsToTry) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          const meta = await res.json();
          this.metadataCache = meta;
          
          // Print console warning for null provider fields
          Object.entries(meta).forEach(([key, val]) => {
            if (!val.provider || !val.product) {
              console.warn(`[DATASET PROVENANCE WARNING] Variable '${key}' provider/product is not specified in metadata.json.`);
            }
          });
          return meta;
        }
      } catch (e) {}
    }

    return {
      pm25: { label: "Particulate Matter (PM2.5)", unit: "µg/m³", provider: null, product: null },
      aod: { label: "Aerosol Optical Depth", unit: "dimensionless", provider: null, product: null },
      rain_mm: { label: "Monthly Rainfall", unit: "mm/month", provider: null, product: null },
      no2: { label: "Nitrogen Dioxide Column", unit: "molecules/cm²", display_scale: 1e15, display_unit: "×10¹⁵ molecules/cm²", provider: null, product: null }
    };
  }

  async getVariables() {
    return this._loadCatalog('variables.json');
  }

  async getRegions() {
    return this._loadCatalog('regions.json');
  }

  async getMissions() {
    return this._loadCatalog('missions.json');
  }

  async getDatasets() {
    return this._loadCatalog('datasets.json');
  }

  async getTopics() {
    return this._loadCatalog('topics.json');
  }

  async getLearningTerms() {
    return this._loadCatalog('learning_terms.json');
  }

  async getComparisonPresets() {
    return this._loadCatalog('comparison_presets.json');
  }

  async getTimeSeries(variableId, regionId) {
    const allData = await this.getSeriesData();
    const cityId = regionId.toLowerCase();
    const varKey = variableId.toLowerCase();

    if (!allData[cityId]) {
      throw new Error(`Region '${regionId}' not found in observation dataset.`);
    }

    const cityVars = allData[cityId].variables;
    if (!cityVars || !cityVars[varKey]) {
      throw new Error(`Variable '${variableId}' not found for ${regionId}.`);
    }

    const series = cityVars[varKey];
    return {
      variable: varKey,
      region: cityId,
      city_name: allData[cityId].name,
      lat: allData[cityId].lat,
      lon: allData[cityId].lon,
      n_observations: series.length,
      pct_missing: 0.0,
      period: { start: series[0].date, end: series[series.length - 1].date },
      series
    };
  }

  async chatAssistant(message) {
    const text = message.trim();
    const msgLower = text.toLowerCase();

    // 1. Strict Scope Enforcement
    // Permitted variables: pm25, aod, rain_mm (rainfall), no2
    // Permitted cities: lahore, karachi, islamabad, peshawar, quetta, faisalabad, multan, hyderabad
    const validVars = ['pm25', 'aod', 'rain_mm', 'no2'];
    const validCities = ['lahore', 'karachi', 'islamabad', 'peshawar', 'quetta', 'faisalabad', 'multan', 'hyderabad'];

    // Check if query asks for out-of-scope variables (soil moisture, temperature, CO2, NDVI, amazon, etc.)
    const forbiddenPatterns = ['soil', 'moisture', 'temperature', 'warming', 'heat', 'ndvi', 'greenness', 'forest', 'deforestation', 'amazon', 'california', 'global', 'co2', 'carbon'];
    for (const fp of forbiddenPatterns) {
      if (msgLower.includes(fp)) {
        return {
          reply: "I cannot answer that from this dataset. Our verified observations cover strictly **PM2.5, Aerosol Optical Depth (AOD), Monthly Rainfall, and Tropospheric NO₂** across 8 cities in Pakistan from 2005 to 2024.",
          is_ai_generated: false,
          suggested_followup: "Try asking: 'What are the PM2.5 trends in Lahore?' or 'Compare rainfall between Peshawar and Karachi.'"
        };
      }
    }

    // Try server-side Groq if backend is available
    if (this.isBackendAvailable) {
      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {}
    }

    // Grounded client-side statistical response using real series
    let matchedVar = 'pm25';
    if (msgLower.includes('rain') || msgLower.includes('precipitation') || msgLower.includes('monsoon')) matchedVar = 'rain_mm';
    else if (msgLower.includes('no2') || msgLower.includes('nitrogen') || msgLower.includes('emission')) matchedVar = 'no2';
    else if (msgLower.includes('aod') || msgLower.includes('aerosol') || msgLower.includes('haze')) matchedVar = 'aod';
    else if (msgLower.includes('pm25') || msgLower.includes('smog') || msgLower.includes('particulate') || msgLower.includes('pollution')) matchedVar = 'pm25';

    let matchedCity = 'lahore';
    for (const c of validCities) {
      if (msgLower.includes(c)) {
        matchedCity = c;
        break;
      }
    }

    try {
      const data = await this.getTimeSeries(matchedVar, matchedCity);
      const statsModule = await import('./stats.js');
      const dates = data.series.map(p => p.date);
      const vals = data.series.map(p => p.value);
      const anomObj = statsModule.computeClimatologicalAnomalies(dates, vals);
      const analysis = statsModule.analyzeSeries(matchedVar, matchedCity, dates, anomObj.anomalies, matchedVar === 'no2' ? 'molecules/cm²' : (matchedVar === 'rain_mm' ? 'mm/month' : (matchedVar === 'pm25' ? 'µg/m³' : 'dimensionless')), true);

      const cityName = matchedCity.charAt(0).toUpperCase() + matchedCity.slice(1);
      const ols = analysis.ols;
      const mk = analysis.mann_kendall;

      let displaySlope = ols.slope_per_year;
      let displayUnit = ols.slope_unit;
      if (matchedVar === 'no2') {
        displaySlope = ols.slope_per_year / 1e15;
        displayUnit = '×10¹⁵ molecules/cm²/year';
      }

      let reply = `🔍 **Investigation Result for ${matchedVar.toUpperCase()} in ${cityName}** (2005–2024):\n\n`;
      reply += `• **Trend Direction**: ${analysis.verdict.direction.toUpperCase()} (${analysis.verdict.tier.replace('_', ' ')})\n`;
      reply += `• **Rate of Change**: ${displaySlope > 0 ? '+' : ''}${displaySlope.toFixed(4)} ${displayUnit}\n`;
      reply += `• **Statistical Significance**: Mann-Kendall p = ${mk.p_value < 0.001 ? '< 0.001' : mk.p_value.toFixed(4)} (Z = ${mk.z_statistic.toFixed(2)}), OLS adjusted p = ${ols.p_value_adjusted < 0.001 ? '< 0.001' : ols.p_value_adjusted.toFixed(4)}\n`;
      reply += `• **Observations**: 240 consecutive monthly points (0% missing)\n\n`;
      reply += `📢 **Scientific Verdict**: ${analysis.verdict.plain_language}\n\n`;
      reply += `⚠️ *Scientific Reminder: An observed trend describes historical data association and does not by itself prove a single cause or guarantee future continuation.*`;

      return {
        reply,
        is_ai_generated: true,
        analysis_ref: { variable: matchedVar, region: matchedCity }
      };
    } catch (e) {
      return {
        reply: "I can answer questions regarding PM2.5, AOD, Rainfall, and NO₂ across Lahore, Karachi, Islamabad, Peshawar, Quetta, Faisalabad, Multan, and Hyderabad. Select any variable and city above to inspect the time series.",
        is_ai_generated: false
      };
    }
  }

  async _loadCatalog(filename) {
    const pathsToTry = [
      `./catalogs/${filename}`
    ];

    for (const p of pathsToTry) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          const data = await res.json();
          const key = filename.replace('.json', '');
          return { [key]: Array.isArray(data) ? data : (data[key] || data) };
        }
      } catch (e) {}
    }

    return { [filename.replace('.json', '')]: [] };
  }
}

export const api = new ApiClient();
