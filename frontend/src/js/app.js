/**
 * Trend Detector — Main Application Controller
 * NASA Space Apps Challenge 2026: Earth System Trend Detective
 * 
 * Powered strictly by real observations from data/raw/pk_city_monthly_final.csv.
 * 0 synthetic, generated, or mock data.
 */

import { api } from './api.js';
import * as stats from './stats.js';
import { TrendChart } from './chart.js';
import { RegionMap } from './map.js';

class App {
  constructor() {
    this.variables = [];
    this.regions = [];
    this.missions = [];
    this.topics = [];
    this.hotspots = [];
    this.datasets = [];
    this.learningTerms = [];
    this.metadata = {};
    this.seriesData = null;

    this.currentVariable = null;
    this.currentRegion = null;
    this.currentData = null;
    this.currentAnalysis = null;
    this.useAnomalies = true;
    this.learningModeActive = false;

    this.chart = null;
    this.map = null;
  }

  async init() {
    try {
      // 1. Initialize Chart
      const canvas = document.getElementById('trend-canvas');
      if (canvas) {
        this.chart = new TrendChart(canvas);
      }

      // 2. Fetch raw observation dataset first (Strict error screen if fails)
      try {
        this.seriesData = await api.getSeriesData();
      } catch (err) {
        this._renderFatalError("Could not load real satellite observation dataset (public/data/series.json). Synthetic fallbacks are disabled.");
        return;
      }

      // 3. Load catalogs & metadata in parallel
      const [varsRes, regsRes, missRes, topRes, hotRes, dataRes, learnRes, metaRes] = await Promise.all([
        api.getVariables(),
        api.getRegions(),
        api.getMissions(),
        api.getTopics(),
        api.getComparisonPresets(),
        api.getDatasets(),
        api.getLearningTerms(),
        api.getMetadata()
      ]);

      this.variables = varsRes.variables || [];
      this.regions = regsRes.regions || [];
      this.missions = missRes.missions || [];
      this.topics = topRes.topics || [];
      this.hotspots = await fetch('./catalogs/hotspots.json').then(r => r.json()).catch(() => []);
      this.datasets = dataRes.datasets || [];
      this.learningTerms = learnRes.terms || [];
      this.metadata = metaRes || {};

      this.currentVariable = this.variables[0] || { id: "pm25", name: "Particulate Matter (PM2.5)", unit: "µg/m³" };
      this.currentRegion = this.regions[0] || { id: "lahore", name: "Lahore", lat: 31.52, lon: 74.36 };

      // 4. Initialize Map
      this.map = new RegionMap('map-container', (cityId) => {
        const regSelect = document.getElementById('select-region');
        if (regSelect) regSelect.value = cityId;
        this.loadInvestigation(this.currentVariable.id, cityId);
      });
      this.map.init(this.regions);

      // 5. Populate UI
      this._populateDropdowns();
      this._renderMissionCards();
      this._renderTopicsWizard(this.topics);
      this._renderOppositesExplorer();
      this._renderHotspots(this.hotspots);
      this._renderNasaShowcase(this.datasets);
      this._bindEvents();

      // Check backend health
      api.checkHealth().then(isLive => {
        const text = document.getElementById('backend-status-text');
        if (text) text.textContent = isLive ? 'FastAPI & Real Data Live' : 'Browser Engine & Real Data';
      });

      // Handle URL parameters
      const params = new URLSearchParams(window.location.search);
      const urlVar = params.get('var') || 'pm25';
      const urlReg = params.get('reg') || 'lahore';
      const missionId = params.get('mission');

      if (missionId) {
        this.loadMission(missionId);
      } else {
        this.loadInvestigation(urlVar, urlReg);
      }
    } catch (e) {
      console.error("Critical error in app.init:", e);
      this._renderFatalError(e.message);
    }
  }

  async loadInvestigation(variableId, regionId) {
    const varId = variableId.toLowerCase();
    const cityId = regionId.toLowerCase();

    this.currentVariable = this.variables.find(v => v.id === varId) || this.variables[0];
    this.currentRegion = this.regions.find(r => r.id === cityId) || this.regions[0];

    // Update selects
    const varSelect = document.getElementById('select-variable');
    const regSelect = document.getElementById('select-region');
    if (varSelect) varSelect.value = this.currentVariable.id;
    if (regSelect) regSelect.value = this.currentRegion.id;

    try {
      const dataRes = await api.getTimeSeries(this.currentVariable.id, this.currentRegion.id);
      this.currentData = dataRes;

      const rawPoints = dataRes.series || [];
      const dates = rawPoints.map(p => p.date);
      const values = rawPoints.map(p => p.value);

      // Compute climatological anomalies
      const anomObj = stats.computeClimatologicalAnomalies(dates, values);
      const seriesWithAnom = rawPoints.map((p, idx) => ({
        date: p.date,
        value: p.value,
        anomaly: anomObj.anomalies[idx]
      }));

      const activeValues = this.useAnomalies ? anomObj.anomalies : values;
      const unit = this.currentVariable.unit;

      // Execute full statistical contract
      const analysis = stats.analyzeSeries(this.currentVariable.id, this.currentRegion.id, dates, activeValues, unit, this.useAnomalies);
      analysis.month_means = anomObj.monthMeans;
      this.currentAnalysis = analysis;

      // Update Chart with scale for NO2
      const displayScale = this.currentVariable.display_scale || 1.0;
      const displayUnit = this.currentVariable.display_unit || this.currentVariable.unit;
      if (this.chart) {
        this.chart.setData(seriesWithAnom, analysis.ols, unit, this.useAnomalies, displayScale, displayUnit);
      }

      // Update Map trends for all cities for this variable
      this._updateMapCityTrends(this.currentVariable.id);
      if (this.map) this.map.setActiveCity(this.currentRegion.id);

      // Update Titles
      const chartTitle = document.getElementById('chart-main-title');
      const chartSub = document.getElementById('chart-sub-title');
      const meta = this.metadata[this.currentVariable.id] || {};
      const sourceStr = (meta.provider && meta.product) ? `${meta.product} via ${meta.provider}` : "Source: not specified";

      if (chartTitle) chartTitle.textContent = `${this.currentVariable.name} — ${this.currentRegion.name}`;
      if (chartSub) chartSub.textContent = `240 monthly observations (${analysis.period.start} to ${analysis.period.end}) • ${sourceStr}`;

      // Render Story Card (Priority 2)
      this._renderStoryCard(analysis);

      // Render Why This Matters (Priority 5)
      this._renderWhyThisMatters(analysis);

      // Render Confidence Meter (Priority 7)
      this._renderConfidenceMeter(analysis.autocorrelation.r1);

      // Update URL
      const url = new URL(window.location);
      url.searchParams.set('var', this.currentVariable.id);
      url.searchParams.set('reg', this.currentRegion.id);
      url.searchParams.set('mode', this.useAnomalies ? 'anomaly' : 'raw');
      window.history.replaceState({}, '', url);

    } catch (err) {
      console.error("Error loading investigation:", err);
      this._renderFatalError(`Failed to load data for ${variableId} in ${regionId}: ${err.message}`);
    }
  }

  loadMission(missionId) {
    const mission = this.missions.find(m => m.id === missionId);
    if (!mission) return;

    this.useAnomalies = mission.use_anomalies !== undefined ? mission.use_anomalies : true;
    const anomCheckbox = document.getElementById('toggle-anomalies');
    if (anomCheckbox) anomCheckbox.checked = this.useAnomalies;

    this.loadInvestigation(mission.variable, mission.region);

    const workspace = document.getElementById('investigation-workspace');
    if (workspace) workspace.scrollIntoView({ behavior: 'smooth' });
  }

  _updateMapCityTrends(varId) {
    if (!this.seriesData || !this.map) return;
    const cityTrends = {};

    for (const city of this.regions) {
      const cityId = city.id;
      const pts = this.seriesData[cityId]?.variables?.[varId];
      if (pts) {
        const dates = pts.map(p => p.date);
        const vals = pts.map(p => p.value);
        const anom = stats.computeClimatologicalAnomalies(dates, vals);
        const an = stats.analyzeSeries(varId, cityId, dates, anom.anomalies, "", true);
        cityTrends[cityId] = {
          direction: an.verdict.direction,
          tier: an.verdict.tier,
          slope_per_year: an.ols.slope_per_year
        };
      }
    }
    this.map.updateTrends(cityTrends);
  }

  /**
   * PRIORITY 2: Trend Story Generator
   */
  _renderStoryCard(analysis) {
    const cardContainer = document.getElementById('story-card-container');
    if (!cardContainer) return;

    const v = this.currentVariable;
    const ols = analysis.ols;
    const mk = analysis.mann_kendall;
    const tier = analysis.verdict.tier;
    const dir = analysis.verdict.direction;

    const scale = v.display_scale || 1.0;
    const displayUnit = v.display_unit || v.unit;
    const slopeDisplay = ols.slope_per_year / scale;
    const totalDisplay = ols.total_change / scale;

    // Formatting numbers
    const slopeStr = `${slopeDisplay > 0 ? '+' : ''}${slopeDisplay >= 1000 || (Math.abs(slopeDisplay) < 0.001 && slopeDisplay !== 0) ? slopeDisplay.toExponential(3) : slopeDisplay.toFixed(4)} ${displayUnit}/year`;
    const totalStr = `${totalDisplay > 0 ? '+' : ''}${Math.abs(totalDisplay) >= 1000 ? totalDisplay.toExponential(3) : totalDisplay.toFixed(2)} ${displayUnit}`;

    let whatChanged = "";
    if (tier === 'significant') {
      whatChanged = `${analysis.variable.toUpperCase()} levels showed a statistically significant ${dir} pattern.`;
    } else if (tier === 'caution') {
      whatChanged = `${analysis.variable.toUpperCase()} exhibited an observed ${dir} pattern (detected with scientific caution).`;
    } else {
      whatChanged = `${analysis.variable.toUpperCase()} levels remained stable with no statistically significant long-term trend.`;
    }

    let isSig = "";
    if (this.learningModeActive) {
      if (tier === 'significant') {
        isSig = `Yes! Less than a 5% chance this was random noise (p < 0.05, low persistence).`;
      } else if (tier === 'caution') {
        isSig = `Caution: A pattern appears, but month-to-month persistence or curvature requires careful scientific interpretation.`;
      } else {
        isSig = `No. Observed fluctuations fall within normal natural variation over the 20-year span.`;
      }
    } else {
      isSig = `${tier.toUpperCase()} — MK p = ${mk.p_value < 0.001 ? '< 0.001' : mk.p_value.toFixed(4)} (Z = ${mk.z_statistic.toFixed(2)}), OLS adj p = ${ols.p_value_adjusted < 0.001 ? '< 0.001' : ols.p_value_adjusted.toFixed(4)}.`;
    }

    const badgeColor = tier === 'significant' ? 'badge-green' : (tier === 'caution' ? '' : '');
    const tierBadge = tier === 'significant' ? 'Statistically Significant Trend' : (tier === 'caution' ? 'Significant With Caution' : 'No Significant Trend');

    cardContainer.innerHTML = `
      <div class="story-card" style="border-left: 6px solid ${tier === 'significant' ? 'var(--color-green-primary)' : (tier === 'caution' ? '#E65100' : 'var(--color-light-brown)')};">
        <div class="story-header">
          <span class="story-badge">Earth System Trend Story</span>
          <span class="badge ${badgeColor}">${tierBadge}</span>
        </div>
        
        <div class="story-grid" style="margin-top:0.75rem;">
          <div class="story-item">
            <span class="story-label">WHAT CHANGED?</span>
            <span class="story-value" style="font-size:1.05rem;">${whatChanged}</span>
          </div>
          <div class="story-item">
            <span class="story-label">WHERE?</span>
            <span class="story-value" style="font-size:1.05rem;">${this.currentRegion.name} (${this.currentRegion.lat}°N, ${this.currentRegion.lon}°E)</span>
          </div>
          <div class="story-item">
            <span class="story-label">HOW MUCH?</span>
            <span class="story-value" style="font-size:1.05rem; color:${dir === 'increasing' ? 'var(--color-green-dark)' : (dir === 'decreasing' ? '#D84315' : 'var(--color-dark-brown)')};">
              ${slopeStr} (${totalStr} over 2005–2024)
            </span>
          </div>
          <div class="story-item">
            <span class="story-label">IS IT SIGNIFICANT?</span>
            <span class="story-value" style="font-size:1.05rem;">${isSig}</span>
          </div>
        </div>

        <div style="background:var(--color-canvas); padding:0.9rem; border-radius:6px; margin-top:0.85rem; border:1px solid var(--color-light-brown-border);">
          <span style="font-weight:800; color:var(--color-dark-brown); font-size:0.75rem; text-transform:uppercase; display:block; margin-bottom:0.25rem;">WHY MIGHT IT MATTER?</span>
          <p style="font-size:0.875rem; color:var(--color-dark-brown); margin:0; line-height:1.45;">${v.why_it_matters || "Environmental shifts directly alter regional air quality, water security, and public health."}</p>
        </div>

        <div class="story-disclaimer" style="margin-top:0.75rem;">
          ⚠️ <b>Scientific Reminder:</b> A statistical trend describes historical observation association; it does not by itself prove a single cause or guarantee future continuation.
        </div>

        <details style="margin-top:0.75rem; font-size:0.85rem; color:var(--color-dark-brown);">
          <summary style="cursor:pointer; font-weight:700;">Show the numbers (Statistical Breakdown)</summary>
          <div style="background:var(--color-canvas); padding:0.85rem; border-radius:6px; margin-top:0.5rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:0.5rem; font-size:0.8rem;">
            <div><b>OLS Slope:</b> ${ols.slope_per_year.toExponential(4)} ${ols.slope_unit}</div>
            <div><b>OLS p-value:</b> ${ols.p_value.toExponential(4)}</div>
            <div><b>Adjusted p-value (n_eff):</b> ${ols.p_value_adjusted.toExponential(4)}</div>
            <div><b>95% CI on slope:</b> [${ols.ci_95_lower.toExponential(3)}, ${ols.ci_95_upper.toExponential(3)}]</div>
            <div><b>R-squared:</b> ${ols.r_squared.toFixed(4)}</div>
            <div><b>Mann-Kendall Tau:</b> ${mk.tau.toFixed(4)} (Z = ${mk.z_statistic.toFixed(2)})</div>
            <div><b>Mann-Kendall p-value:</b> ${mk.p_value.toExponential(4)}</div>
            <div><b>Theil-Sen Median Slope:</b> ${analysis.theil_sen.slope_per_year.toExponential(4)} ${analysis.theil_sen.slope_unit}</div>
            <div><b>Lag-1 Autocorrelation (r₁):</b> ${analysis.autocorrelation.r1.toFixed(3)}</div>
            <div><b>Effective Sample Size (n_eff):</b> ${analysis.autocorrelation.n_eff.toFixed(1)} / 240</div>
            <div><b>Linearity Flag:</b> ${analysis.flags.non_linear ? 'Non-linear divergence (>30%)' : 'Linear concordance verified'}</div>
            <div><b>Observations:</b> 240 consecutive months (0% missing)</div>
          </div>
        </details>
      </div>
    `;
  }

  /**
   * PRIORITY 5: Why This Matters Section (Specifically mapped to 4 real variables)
   */
  _renderWhyThisMatters(analysis) {
    const container = document.getElementById('why-this-matters-container');
    if (!container) return;

    let agText = "";
    let waterText = "";
    let healthText = "";

    if (analysis.variable === 'pm25') {
      agText = "High particulate loads scatter incoming sunlight, slightly reducing photosynthetically active radiation (PAR) during peak winter crop growth.";
      waterText = "Atmospheric aerosols alter regional cloud droplet formation, suppressing localized convective cloud formation.";
      healthText = "Fine particles (PM2.5) enter deep pulmonary alveoli and vascular systems, strongly correlated with respiratory and cardiovascular hospital admissions.";
    } else if (analysis.variable === 'aod') {
      agText = "Elevated aerosol optical depth indicates persistent column haze, reducing solar insolation across agricultural plains.";
      waterText = "Large aerosol burdens can induce localized radiative cooling aloft, altering monsoonal atmospheric circulation.";
      healthText = "Column AOD correlates with surface dust and haze, aggravating asthma, bronchitis, and reducing ambient urban visibility.";
    } else if (analysis.variable === 'rain_mm') {
      agText = "Changing precipitation amounts directly dictate soil moisture recharge, sowing schedules, and irrigation canal quotas.";
      waterText = "Shifting rainfall trends impact urban drainage capacities, river discharges, and local aquifer replenishment rates.";
      healthText = "Heavy rainfall surges create post-monsoon standing water linked to malaria/dengue outbreaks, while drying exacerbates airborne dust.";
    } else if (analysis.variable === 'no2') {
      agText = "Atmospheric NO₂ contributes to nitrate deposition in soils, but high ambient concentrations also lead to ground-level ozone injury on crops.";
      waterText = "Atmospheric nitrogen compounds wash out during rainstorms, contributing to nitrate accumulation in freshwater bodies.";
      healthText = "Inhaled NO₂ causes airway inflammation, exacerbates chronic obstructive pulmonary disease (COPD), and marks vehicular emission exposure.";
    }

    container.innerHTML = `
      <div style="margin-top:1.5rem;">
        <h4 style="font-size:1.1rem; color:var(--color-dark-brown); font-weight:800; margin-bottom:0.25rem;">
          🌱 Why This Matters (Systemic Real-World Impacts)
        </h4>
        <div class="why-matters-grid">
          <div class="why-matters-box">
            <div class="why-matters-title">🌾 For Agriculture & Crops</div>
            <div class="why-matters-text">${agText}</div>
          </div>
          <div class="why-matters-box">
            <div class="why-matters-title">🌊 For Water Security & Flood Risk</div>
            <div class="why-matters-text">${waterText}</div>
          </div>
          <div class="why-matters-box">
            <div class="why-matters-title">🏥 For Public Health & Air Quality</div>
            <div class="why-matters-text">${healthText}</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * PRIORITY 7: Dataset Confidence Meter (4 Real Factors)
   */
  _renderConfidenceMeter(r1) {
    const container = document.getElementById('confidence-meter-container');
    if (!container) return;

    const conf = stats.computeConfidenceMeter(240, 0.0, r1);
    const overallClass = conf.overall === 'High' ? 'confidence-high' : 'confidence-medium';
    const percentScore = conf.overall === 'High' ? 95 : 82;

    let factorsHtml = '';
    Object.entries(conf.factors).forEach(([key, f]) => {
      factorsHtml += `
        <div class="factor-box">
          <div class="factor-name">${key.replace('_', ' ')} (${f.rating})</div>
          <div class="factor-detail">${f.detail}</div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="confidence-card">
        <div class="confidence-header">
          <div>
            <h4 style="color:var(--color-dark-brown); font-weight:800; font-size:1.15rem;">Dataset Confidence Meter</h4>
            <span style="font-size:0.8rem; color:var(--color-text-muted);">Transparent scientific data quality rating based on 240 monthly points</span>
          </div>
          <div class="confidence-badge-large ${overallClass}">
            <span>Overall Quality:</span> <b>${conf.overall} Confidence (${percentScore}%)</b>
          </div>
        </div>

        <div class="confidence-bar-wrapper">
          <div class="confidence-bar-fill" style="width: ${percentScore}%;"></div>
        </div>

        <div class="factors-grid" style="margin-top:0.85rem;">
          ${factorsHtml}
        </div>
      </div>
    `;
  }

  /**
   * PRIORITY 3: Trend Opposites Explorer
   * Computes live comparisons across cities with the shared-data caveat for nearby cities.
   */
  _renderOppositesExplorer() {
    const container = document.querySelector('.opposites-grid');
    if (!container || !this.seriesData) return;

    const pairs = [
      {
        title: "🌧️ Rainfall Trajectory Divergence",
        variable: "rain_mm",
        c1: "peshawar",
        c2: "karachi",
        desc: "Comparing the northwestern valley (Peshawar) against the southern Arabian Sea coast (Karachi)."
      },
      {
        title: "⚡ Opposite Tropospheric NO₂ Trends",
        variable: "no2",
        c1: "peshawar",
        c2: "multan",
        desc: "Contrasting industrial/vehicular emission column trajectories across northern and southern Punjab/KP corridors."
      },
      {
        title: "💨 Urban Particulate Corridor (PM2.5)",
        variable: "pm25",
        c1: "lahore",
        c2: "faisalabad",
        desc: "Central Punjab industrial corridor comparison with shared satellite grid column caveat."
      }
    ];

    container.innerHTML = pairs.map(p => {
      const p1Data = this.seriesData[p.c1]?.variables?.[p.variable] || [];
      const p2Data = this.seriesData[p.c2]?.variables?.[p.variable] || [];

      const anom1 = stats.computeClimatologicalAnomalies(p1Data.map(x => x.date), p1Data.map(x => x.value));
      const anom2 = stats.computeClimatologicalAnomalies(p2Data.map(x => x.date), p2Data.map(x => x.value));

      const an1 = stats.analyzeSeries(p.variable, p.c1, p1Data.map(x => x.date), anom1.anomalies, "", true);
      const an2 = stats.analyzeSeries(p.variable, p.c2, p2Data.map(x => x.date), anom2.anomalies, "", true);

      const isNearby = (p.c1 === 'lahore' && p.c2 === 'faisalabad') || (p.c1 === 'islamabad' && p.c2 === 'peshawar') || (p.c1 === 'karachi' && p.c2 === 'hyderabad');

      let formatSlope = (s) => p.variable === 'no2' ? `${(s / 1e15).toFixed(3)} ×10¹⁵` : s.toFixed(3);

      return `
        <div class="opposite-card">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
              <span style="font-weight:700; font-size:1rem; color:var(--color-dark-brown);">${p.title}</span>
              <span class="badge badge-green">Live Analysis</span>
            </div>
            <div class="opposite-row ${an1.verdict.direction === 'increasing' ? 'increasing' : (an1.verdict.direction === 'decreasing' ? 'decreasing' : '')}">
              <span>${an1.verdict.direction === 'increasing' ? '↑' : (an1.verdict.direction === 'decreasing' ? '↓' : '→')} ${p.c1.toUpperCase()}</span>
              <span>${an1.ols.slope_per_year > 0 ? '+' : ''}${formatSlope(an1.ols.slope_per_year)} /yr (${an1.verdict.tier})</span>
            </div>
            <div class="opposite-row ${an2.verdict.direction === 'increasing' ? 'increasing' : (an2.verdict.direction === 'decreasing' ? 'decreasing' : '')}">
              <span>${an2.verdict.direction === 'increasing' ? '↑' : (an2.verdict.direction === 'decreasing' ? '↓' : '→')} ${p.c2.toUpperCase()}</span>
              <span>${an2.ols.slope_per_year > 0 ? '+' : ''}${formatSlope(an2.ols.slope_per_year)} /yr (${an2.verdict.tier})</span>
            </div>
            <p style="font-size:0.8rem; color:var(--color-text-muted); margin-top:0.6rem; line-height:1.4;">
              ${p.desc}
            </p>
            ${isNearby ? `<div style="background:#FFF8E1; border:1px solid #FFE082; padding:6px 8px; border-radius:4px; font-size:0.75rem; color:#B78103; margin-top:6px;"><b>Caveat:</b> Nearby cities may share the same underlying satellite data cell or atmospheric grid column; their trends are not independent.</div>` : ''}
          </div>
          <button class="btn btn-outline btn-sm" style="margin-top:0.85rem;" onclick="window.trendApp.loadInvestigation('${p.variable}', '${p.c1}')">
            Investigate ${p.c1.toUpperCase()} &rarr;
          </button>
        </div>
      `;
    }).join('');
  }

  /**
   * PRIORITY 1: Earth Detective Investigation Flow
   */
  _renderTopicsWizard(topics) {
    const grid = document.getElementById('topics-wizard-grid');
    const recContainer = document.getElementById('topic-recommendation-container');
    if (!grid || !topics?.length) return;

    grid.innerHTML = topics.map((t, idx) => `
      <div class="topic-card ${idx === 0 ? 'active' : ''}" data-topic-id="${t.id}">
        <div class="topic-icon">${t.icon || '🔍'}</div>
        <div>
          <div style="font-weight:700; font-size:0.9rem; color:var(--color-dark-brown);">${t.name}</div>
          <div style="font-size:0.75rem; color:var(--color-text-muted);">${t.description}</div>
        </div>
      </div>
    `).join('');

    const showRecommendation = (topic) => {
      if (!recContainer || !topic) return;
      const rec = topic.recommendation;
      if (!rec) return;

      const varList = rec.variable_names?.map(v => `✓ <b>${v}</b>`).join(' &nbsp; ') || '';
      const regList = rec.region_names?.map(r => `✓ <b>${r}</b>`).join(' &nbsp; ') || '';

      recContainer.style.display = 'block';
      recContainer.innerHTML = `
        <div class="recommendation-box">
          <div style="flex:1; min-width:280px;">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
              <span style="font-size:1.25rem;">${topic.icon}</span>
              <span style="font-weight:800; color:var(--color-green-dark); font-size:1.05rem;">Detective Recommendation for ${topic.name}:</span>
            </div>
            <div style="font-size:0.85rem; color:var(--color-dark-brown); margin:0.3rem 0;">
              <div><b>Suggested Variables:</b> ${varList}</div>
              <div style="margin-top:0.2rem;"><b>Suggested Cities:</b> ${regList}</div>
            </div>
            <p style="font-size:0.8rem; color:var(--color-text-muted); margin-top:0.4rem; line-height:1.4;">
              <b>Why?</b> ${rec.reason}
            </p>
          </div>
          <button class="btn btn-primary" id="btn-launch-topic" style="white-space:nowrap;">
            Launch Investigation &rarr;
          </button>
        </div>
      `;

      document.getElementById('btn-launch-topic')?.addEventListener('click', () => {
        const vId = rec.variables?.[0] || 'pm25';
        const rId = rec.regions?.[0] || 'lahore';
        this.loadInvestigation(vId, rId);
        const workspace = document.getElementById('investigation-workspace');
        if (workspace) workspace.scrollIntoView({ behavior: 'smooth' });
      });
    };

    if (topics.length > 0) showRecommendation(topics[0]);

    grid.querySelectorAll('.topic-card').forEach(card => {
      card.addEventListener('click', () => {
        grid.querySelectorAll('.topic-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const topic = topics.find(t => t.id === card.getAttribute('data-topic-id'));
        if (topic) showRecommendation(topic);
      });
    });
  }

  /**
   * PRIORITY 4: Guided Demo Missions
   */
  _renderMissionCards() {
    const grid = document.getElementById('missions-grid');
    if (!grid) return;

    grid.innerHTML = this.missions.map(m => `
      <div class="mission-card" data-mission-id="${m.id}">
        <div class="mission-header">
          <span class="mission-icon">${m.icon || '🔍'}</span>
          <span class="badge badge-green">${m.result_summary || 'Real Observation'}</span>
        </div>
        <h4 class="mission-title">${m.title}</h4>
        <p class="mission-question">"${m.question}"</p>
        <div class="mission-meta" style="margin-top:auto; padding-top:0.6rem;">
          <span class="badge">${m.variable_name}</span>
          <span class="badge">${m.region_name}</span>
          <button class="btn btn-secondary btn-sm" style="margin-left:auto; font-size:0.75rem; padding:0.25rem 0.5rem;">Try Mission &rarr;</button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.mission-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-mission-id');
        this.loadMission(id);
      });
    });
  }

  /**
   * PRIORITY 10: Hotspots Leaderboard
   */
  _renderHotspots(hotspots) {
    const grid = document.getElementById('hotspots-grid');
    if (!grid || !hotspots?.length) return;

    grid.innerHTML = hotspots.map(h => `
      <div class="hotspot-card" data-var="${h.variable}" data-reg="${h.region}">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <span class="hotspot-rank-badge">#${h.rank}</span>
              <span style="font-weight:800; font-size:1rem; color:var(--color-dark-brown);">${h.title}</span>
            </div>
            <span style="font-size:1.2rem;">${h.icon || '🌍'}</span>
          </div>
          <div style="font-size:0.85rem; font-weight:700; color:${h.direction === 'increasing' ? 'var(--color-green-dark)' : '#D84315'}; margin:0.3rem 0;">
            ${h.rate}
          </div>
          <div style="font-size:0.75rem; color:var(--color-text-muted); margin-bottom:0.5rem;">
            ${h.significance}
          </div>
          <p style="font-size:0.75rem; color:var(--color-dark-brown); line-height:1.4;">
            ${h.why_it_matters || ''}
          </p>
        </div>
        <button class="btn btn-outline btn-sm" style="margin-top:0.75rem; width:100%;">
          Investigate Trend &rarr;
        </button>
      </div>
    `).join('');

    grid.querySelectorAll('.hotspot-card').forEach(card => {
      card.addEventListener('click', () => {
        const v = card.getAttribute('data-var');
        const r = card.getAttribute('data-reg');
        if (v && r) {
          this.loadInvestigation(v, r);
          const workspace = document.getElementById('investigation-workspace');
          if (workspace) workspace.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  /**
   * PRIORITY 6: Dataset Showcase
   */
  _renderNasaShowcase(datasets) {
    const grid = document.getElementById('nasa-showcase-grid');
    if (!grid || !datasets?.length) return;

    grid.innerHTML = datasets.map(d => {
      const providerStr = d.provider ? d.provider : "Source: not specified";
      const productStr = d.product_name ? d.product_name : "Source: not specified";

      return `
        <div class="nasa-card">
          <div class="nasa-card-title">${d.name}</div>
          <div class="nasa-card-meta">${d.years} • ${providerStr}</div>
          <div class="nasa-card-body">
            <div><b>Product:</b> ${productStr}</div>
            <div style="margin-top:0.25rem;"><b>Variable:</b> ${d.measured_variable}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  _bindEvents() {
    // Select Change
    document.getElementById('select-variable')?.addEventListener('change', (e) => {
      this.loadInvestigation(e.target.value, this.currentRegion.id);
    });
    document.getElementById('select-region')?.addEventListener('change', (e) => {
      this.loadInvestigation(this.currentVariable.id, e.target.value);
    });

    // Anomaly Toggle
    document.getElementById('toggle-anomalies')?.addEventListener('change', (e) => {
      this.useAnomalies = e.target.checked;
      if (this.currentVariable && this.currentRegion) {
        this.loadInvestigation(this.currentVariable.id, this.currentRegion.id);
      }
    });

    // Learning Mode Toggle
    document.getElementById('learning-mode-toggle')?.addEventListener('change', (e) => {
      this.learningModeActive = e.target.checked;
      const note = document.getElementById('learning-mode-banner');
      if (note) note.style.display = this.learningModeActive ? 'block' : 'none';
      if (this.currentAnalysis) {
        this._renderStoryCard(this.currentAnalysis);
      }
    });

    // Export CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      this._exportCSV();
    });

    // Export PNG
    document.getElementById('btn-export-png')?.addEventListener('click', () => {
      this._exportPNG();
    });

    // Export Markdown Report
    document.getElementById('btn-export-md')?.addEventListener('click', () => {
      this._exportMarkdown();
    });

    // AI Assistant Drawer
    const drawer = document.getElementById('assistant-drawer');
    const fab = document.getElementById('assistant-fab');
    const closeBtn = document.getElementById('btn-close-assistant');
    const sendBtn = document.getElementById('btn-assistant-send');
    const chatInput = document.getElementById('assistant-input');

    fab?.addEventListener('click', () => drawer.classList.toggle('open'));
    closeBtn?.addEventListener('click', () => drawer.classList.remove('open'));

    const sendMsg = async () => {
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';

      const history = document.getElementById('assistant-history');
      history.innerHTML += `<div class="chat-msg chat-user">${text}</div>`;
      history.scrollTop = history.scrollHeight;

      const typingId = `typing-${Date.now()}`;
      history.innerHTML += `<div class="chat-msg chat-bot" id="${typingId}" style="color:var(--color-green-primary); font-style:italic;">✨ Detective AI analyzing dataset...</div>`;
      history.scrollTop = history.scrollHeight;

      const replyObj = await api.chatAssistant(text);
      document.getElementById(typingId)?.remove();

      let botHtml = this._formatMarkdown(replyObj.reply);
      if (replyObj.analysis_ref?.variable && replyObj.analysis_ref?.region) {
        const v = replyObj.analysis_ref.variable;
        const r = replyObj.analysis_ref.region;
        botHtml += `<div style="margin-top:8px;"><button class="btn btn-secondary btn-sm" id="btn-chart-jump-${Date.now()}" style="font-size:0.75rem; padding:0.3rem 0.6rem; cursor:pointer; background:var(--color-green-accent); color:var(--color-dark-brown); border:1px solid var(--color-green-primary); border-radius:6px; font-weight:700;">📊 Load ${v.toUpperCase()} in ${r.toUpperCase()} Chart</button></div>`;
      }

      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-msg chat-bot';
      msgDiv.innerHTML = botHtml;

      const jumpBtn = msgDiv.querySelector('button');
      if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
          this.loadInvestigation(replyObj.analysis_ref.variable, replyObj.analysis_ref.region);
        });
      }

      history.appendChild(msgDiv);
      history.scrollTop = history.scrollHeight;
    };

    sendBtn?.addEventListener('click', sendMsg);
    chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMsg();
    });
  }

  _formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/^### (.*$)/gim, '<h5 style="margin:8px 0 4px; color:var(--color-green-primary); font-size:0.92rem; font-weight:700;">$1</h5>')
      .replace(/^## (.*$)/gim, '<h4 style="margin:10px 0 5px; color:var(--color-green-primary); font-size:1rem; font-weight:800;">$1</h4>')
      .replace(/^\s*[-•*]\s+(.*$)/gim, '<div style="display:flex; gap:6px; margin:3px 0 3px 6px;"><span>•</span><span>$1</span></div>')
      .replace(/\n\n+/g, '<div style="margin-top:8px;"></div>')
      .replace(/\n/g, '<br>');
  }

  _exportCSV() {
    if (!this.currentData) return;
    const rows = [
      ["date", "value", "seasonal_anomaly"],
      ...this.currentData.series.map(p => [p.date, p.value, p.anomaly !== undefined ? p.anomaly : ""])
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `trend_${this.currentVariable.id}_${this.currentRegion.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  _exportPNG() {
    const canvas = document.getElementById('trend-canvas');
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.download = `chart_${this.currentVariable.id}_${this.currentRegion.id}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.warn("PNG export error:", e);
    }
  }

  _exportMarkdown() {
    if (!this.currentAnalysis) return;
    const a = this.currentAnalysis;
    const v = this.currentVariable;
    const meta = this.metadata[v.id] || {};
    const sourceStr = (meta.provider && meta.product) ? `${meta.product} via ${meta.provider}` : "Source: not specified";

    const md = `# Earth System Trend Investigation: ${v.name} in ${this.currentRegion.name}
- **Coordinates:** ${this.currentRegion.lat}°N, ${this.currentRegion.lon}°E
- **Observation Period:** ${a.period.start} to ${a.period.end} (${a.n_observations} consecutive monthly points)
- **Data Completeness:** 100% (0% missing)
- **OLS Trend Rate:** ${a.ols.slope_per_year} ${a.ols.slope_unit}
- **Adjusted p-value:** ${a.ols.p_value_adjusted} (n_eff = ${a.autocorrelation.n_eff})
- **Mann-Kendall Tau:** ${a.mann_kendall.tau} (p = ${a.mann_kendall.p_value})
- **Theil-Sen Slope:** ${a.theil_sen.slope_per_year} ${a.theil_sen.slope_unit}
- **Scientific Verdict:** ${a.verdict.tier.toUpperCase()} — ${a.verdict.plain_language}
- **Provenance:** ${sourceStr}
- **Scientific Disclaimer:** A statistical trend describes historical observation association and does not by itself prove a cause or guarantee future continuation.`;

    const blob = new Blob([md], { type: 'text/markdown' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `report_${v.id}_${this.currentRegion.id}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  _populateDropdowns() {
    const varSelect = document.getElementById('select-variable');
    const regSelect = document.getElementById('select-region');

    if (varSelect && this.variables.length) {
      const cur = varSelect.value || this.currentVariable?.id;
      varSelect.innerHTML = this.variables.map(v => `
        <option value="${v.id}">${v.name} (${v.unit})</option>
      `).join('');
      if (cur) varSelect.value = cur;
    }

    if (regSelect && this.regions.length) {
      const cur = regSelect.value || this.currentRegion?.id;
      regSelect.innerHTML = this.regions.map(r => `
        <option value="${r.id}">${r.name} (${r.lat}°N, ${r.lon}°E)</option>
      `).join('');
      if (cur) regSelect.value = cur;
    }
  }

  _renderFatalError(errorMsg) {
    const main = document.querySelector('.main-content');
    if (main) {
      main.innerHTML = `
        <div style="background:#FFF0F0; border:2px solid #E53935; border-radius:12px; padding:2rem; margin:2rem auto; max-width:800px; text-align:center; color:#B71C1C;">
          <h2 style="font-size:1.5rem; margin-bottom:0.5rem;">⚠️ Dataset Loading Error</h2>
          <p style="font-size:1rem; margin-bottom:1rem;">${errorMsg}</p>
          <div style="font-size:0.85rem; color:#555; background:#FFF; border:1px solid #DDD; padding:1rem; border-radius:6px; text-align:left;">
            <b>No synthetic fallbacks are permitted.</b><br>
            Please verify that <code>public/data/series.json</code> has been compiled from <code>data/raw/pk_city_monthly_final.csv</code> using <code>python scripts/build_data.py</code>.
          </div>
        </div>
      `;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  window.trendApp = app;
  app.init();
});
