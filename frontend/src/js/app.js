/**
 * Trend Detector — Main Application Controller
 * Handles routing, mission loading, investigation wizard,
 * statistical execution, UI updates, and export.
 * Resilient to network failures with 0ms UI lag.
 */

import { api } from './api.js';
import * as stats from './stats.js';
import { TrendChart } from './chart.js';
import { RegionMap } from './map.js';

// Fallback catalog defaults so UI NEVER blanks out
const DEFAULT_VARIABLES = [
  { id: "rainfall", name: "Rainfall", dataset: "GPM IMERG Final Monthly V07", provider: "NASA GES DISC", unit: "mm/month", priority: "P0", pct_change_ok: true, why_it_matters: "Changes in rainfall affect water availability, flood risk, and agriculture." },
  { id: "soil_moisture", name: "Soil Moisture", dataset: "GLDAS Noah Land Surface Model", provider: "NASA GES DISC", unit: "kg/m²", priority: "P0", pct_change_ok: false, why_it_matters: "Soil moisture indicates root-zone water availability in farming basins." },
  { id: "aod", name: "Aerosol Optical Depth", dataset: "MODIS/Terra Aerosol L2 Swath", provider: "NASA LAADS", unit: "dimensionless", priority: "P0", pct_change_ok: true, why_it_matters: "AOD measures atmospheric haze and smog particle concentration." },
  { id: "temperature", name: "Temperature", dataset: "MERRA-2 Reanalysis", provider: "NASA GES DISC", unit: "°C", priority: "P1", pct_change_ok: false, why_it_matters: "Long-term warming affects snowpack melt and heat exposure." },
  { id: "ndvi", name: "Vegetation Greenness", dataset: "MODIS/Terra NDVI", provider: "NASA LP DAAC", unit: "dimensionless", priority: "P1", pct_change_ok: true, why_it_matters: "Greenness reflects agricultural health and drought stress." }
];

const DEFAULT_REGIONS = [
  { id: "pakistan", name: "Pakistan", boundary_type: "country_polygon", bbox: { west: 60.87, south: 23.63, east: 77.84, north: 37.08 } },
  { id: "punjab", name: "Punjab / Lahore Airshed", boundary_type: "province_boundary", bbox: { west: 69.33, south: 27.70, east: 75.38, north: 34.02 } },
  { id: "lahore_airshed", name: "Lahore Metropolitan Airshed", boundary_type: "bounding_box", bbox: { west: 73.80, south: 31.10, east: 74.80, north: 31.80 } },
  { id: "sindh", name: "Sindh / Karachi Coast", boundary_type: "province_boundary", bbox: { west: 66.00, south: 23.63, east: 71.00, north: 28.50 } },
  { id: "karachi", name: "Karachi Metropolitan Region", boundary_type: "bounding_box", bbox: { west: 66.80, south: 24.70, east: 67.50, north: 25.20 } },
  { id: "balochistan", name: "Balochistan", boundary_type: "province_boundary", bbox: { west: 60.87, south: 24.89, east: 70.17, north: 32.10 } },
  { id: "indus_basin", name: "Indus River Basin", boundary_type: "basin_polygon", bbox: { west: 66.00, south: 23.50, east: 77.00, north: 37.00 } },
  { id: "northern_pakistan", name: "Northern Pakistan (Mountains)", boundary_type: "bounding_box", bbox: { west: 70.00, south: 33.50, east: 77.00, north: 37.08 } },
  { id: "southern_pakistan", name: "Southern Pakistan (Plains & Coast)", boundary_type: "bounding_box", bbox: { west: 63.00, south: 23.63, east: 72.00, north: 28.00 } },
  { id: "california", name: "California", boundary_type: "state_boundary", bbox: { west: -124.48, south: 32.53, east: -114.13, north: 42.01 } }
];

const DEFAULT_MISSIONS = [
  { id: "lahore_smog", title: "Lahore Smog Mystery", question: "Is air pollution changing over Lahore?", variable: "aod", variable_name: "Aerosol Optical Depth", region: "lahore_airshed", region_name: "Lahore Metropolitan Airshed", icon: "💨", use_anomalies: true },
  { id: "pakistan_rainfall", title: "Pakistan Rainfall Shift", question: "Why are some areas getting wetter while others dry?", variable: "rainfall", variable_name: "Rainfall", region: "northern_pakistan", region_name: "Northern Pakistan", icon: "🌧️", use_anomalies: true },
  { id: "indus_water", title: "Indus Basin Water Watch", question: "Is soil moisture changing in Pakistan's agricultural heartland?", variable: "soil_moisture", variable_name: "Soil Moisture", region: "indus_basin", region_name: "Indus River Basin", icon: "💧", use_anomalies: true },
  { id: "california_drought", title: "California Drought Tracker", question: "Has soil moisture declined in California?", variable: "soil_moisture", variable_name: "Soil Moisture", region: "california", region_name: "California", icon: "🏜️", use_anomalies: true }
];

class App {
  constructor() {
    this.variables = DEFAULT_VARIABLES;
    this.regions = DEFAULT_REGIONS;
    this.missions = DEFAULT_MISSIONS;
    this.learningTerms = [];
    this.currentVariable = this.variables[0];
    this.currentRegion = this.regions[0];
    this.currentData = null;
    this.currentAnalysis = null;
    this.useAnomalies = true;
    this.learningModeActive = false;

    this.chart = null;
    this.map = null;
  }

  async init() {
    try {
      // 1. Initialize Chart & Map immediately
      const canvas = document.getElementById('trend-canvas');
      if (canvas) {
        this.chart = new TrendChart(canvas);
      }

      this.map = new RegionMap('map-container', (regionId) => {
        const regSelect = document.getElementById('select-region');
        if (regSelect) regSelect.value = regionId;
        this.loadInvestigation(this.currentVariable.id, regionId);
      });
      this.map.init(this.regions);

      this._populateDropdowns();
      this._renderMissionCards();

      // Check backend health & update status pill
      api.checkHealth().then(isLive => {
        const dot = document.getElementById('backend-status-dot');
        const text = document.getElementById('backend-status-text');
        if (dot && text) {
          if (isLive) {
            dot.style.background = '#B8DB94';
            text.textContent = 'FastAPI Connected';
          } else {
            dot.style.background = '#CBAB8D';
            text.textContent = 'Integrated Engine';
          }
        }
      });

      // 2. Fetch catalogs asynchronously without blocking
      Promise.allSettled([
        api.getVariables(),
        api.getRegions(),
        api.getMissions(),
        api.getLearningTerms(),
        api.getFeaturedStory(),
        api.getTopics()
      ]).then(results => {
        if (results[0].status === 'fulfilled' && results[0].value.variables?.length) {
          this.variables = results[0].value.variables;
        }
        if (results[1].status === 'fulfilled' && results[1].value.regions?.length) {
          this.regions = results[1].value.regions;
          if (this.map) this.map.renderRegions(this.regions);
        }
        if (results[2].status === 'fulfilled' && results[2].value.missions?.length) {
          this.missions = results[2].value.missions;
          this._renderMissionCards();
        }
        if (results[3].status === 'fulfilled') {
          this.learningTerms = results[3].value.terms || [];
        }
        if (results[4].status === 'fulfilled') {
          this._renderFeaturedStory(results[4].value.story);
        }
        if (results[5].status === 'fulfilled' && results[5].value.topics?.length) {
          this._renderTopics(results[5].value.topics);
        }
        this._populateDropdowns();
      });

      this._bindEvents();

      // Check URL parameters
      const params = new URLSearchParams(window.location.search);
      const urlVar = params.get('var') || 'rainfall';
      const urlReg = params.get('reg') || 'pakistan';
      const missionId = params.get('mission');

      if (missionId) {
        this.loadMission(missionId);
      } else {
        this.loadInvestigation(urlVar, urlReg);
      }
    } catch (e) {
      console.error("Critical error in app.init:", e);
    }
  }

  async loadInvestigation(variableId, regionId) {
    this.currentVariable = this.variables.find(v => v.id === variableId) || this.variables[0];
    this.currentRegion = this.regions.find(r => r.id === regionId) || this.regions[0];

    // Update select elements
    const varSelect = document.getElementById('select-variable');
    const regSelect = document.getElementById('select-region');
    if (varSelect) varSelect.value = this.currentVariable.id;
    if (regSelect) regSelect.value = this.currentRegion.id;

    // Highlight map
    if (this.map) this.map.setActiveRegion(this.currentRegion.id);

    try {
      // Fetch Time Series Data
      const dataRes = await api.getTimeSeries(this.currentVariable.id, this.currentRegion.id);
      this.currentData = dataRes;

      const series = dataRes.series || [];
      const validPoints = series.filter(p => (this.useAnomalies ? p.anomaly : p.value) !== null);

      const times = validPoints.map(p => this._dateToFractionalYear(p.date));
      const values = validPoints.map(p => this.useAnomalies ? p.anomaly : p.value);
      const periodYears = times.length > 1 ? times[times.length - 1] - times[0] : 1;

      // High-speed browser stats execution (0ms lag)
      const ols = stats.computeOLS(times, values, this.currentVariable.unit, this.currentVariable.pct_change_ok, periodYears);
      const mk = stats.computeMannKendall(values);
      const ts = stats.computeTheilSen(times, values, this.currentVariable.unit);
      const ac = stats.computeAutocorrelation(times, values);
      const pctMissing = dataRes.pct_missing !== undefined ? dataRes.pct_missing : 0;
      const conf = stats.computeConfidenceMeter(validPoints.length, pctMissing, ac.lag1, this.currentVariable.data_type || 'satellite');

      const analysis = {
        variable: this.currentVariable.id,
        variable_name: this.currentVariable.name,
        region: this.currentRegion.id,
        region_name: this.currentRegion.name,
        unit: this.currentVariable.unit,
        period: { start: series[0]?.date || "", end: series[series.length - 1]?.date || "" },
        n_observations: validPoints.length,
        pct_missing: pctMissing,
        ols,
        mann_kendall: mk,
        theil_sen: ts,
        autocorrelation: ac,
        confidence_meter: conf,
        disclaimer: "A trend does not by itself prove its cause or guarantee it will continue."
      };

      this.currentAnalysis = analysis;

      // Update Chart
      if (this.chart) {
        this.chart.setData(series, analysis.ols, this.currentVariable.unit, this.useAnomalies);
      }

      // Update Titles
      const chartTitle = document.getElementById('chart-main-title');
      const chartSub = document.getElementById('chart-sub-title');
      if (chartTitle) chartTitle.textContent = `${this.currentVariable.name} — ${this.currentRegion.name}`;
      if (chartSub) chartSub.textContent = `${this.currentVariable.dataset} (${analysis.period.start} to ${analysis.period.end})`;

      // Render Story Card (SRD §7)
      this._renderStoryCard(analysis);

      // Render Confidence Meter (SRD §11)
      this._renderConfidenceMeter(analysis.confidence_meter);

      // Update Shareable URL
      const url = new URL(window.location);
      url.searchParams.set('var', this.currentVariable.id);
      url.searchParams.set('reg', this.currentRegion.id);
      window.history.replaceState({}, '', url);

    } catch (err) {
      console.error("Error loading investigation:", err);
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

  _renderStoryCard(analysis) {
    const cardContainer = document.getElementById('story-card-container');
    if (!cardContainer) return;

    const ols = analysis.ols;
    const isIncreasing = ols.slope_per_year > 0;
    const isSignificant = ols.p_value < 0.05 && analysis.n_observations >= 120;

    let what = `${analysis.variable_name} levels ${isIncreasing ? 'increased' : 'decreased'}.`;
    if (!isSignificant) what = `${analysis.variable_name} shows no statistically significant trend.`;

    const howMuch = `${ols.slope_per_year >= 0 ? '+' : ''}${ols.slope_per_year.toFixed(4)} ${ols.slope_unit}`;
    const sigText = isSignificant ? "Yes, at the 95% confidence level." : "No, change is within random variability.";

    cardContainer.innerHTML = `
      <div class="story-card">
        <div class="story-header">
          <span class="story-badge">Earth System Investigation Verdict</span>
          <span class="badge ${isSignificant ? 'badge-green' : ''}">p = ${ols.p_value.toFixed(4)}</span>
        </div>
        <div class="story-grid">
          <div class="story-item">
            <span class="story-label">What Changed?</span>
            <span class="story-value">${what}</span>
          </div>
          <div class="story-item">
            <span class="story-label">Where?</span>
            <span class="story-value">${analysis.region_name}</span>
          </div>
          <div class="story-item">
            <span class="story-label">How Much?</span>
            <span class="story-value">${howMuch}</span>
          </div>
          <div class="story-item">
            <span class="story-label">Significant?</span>
            <span class="story-value">${sigText}</span>
          </div>
        </div>
        <div class="story-narrative">
          <b>Summary:</b> ${analysis.variable_name} changed by ${ols.total_change.toFixed(2)} ${analysis.unit} over the period ${analysis.period.start} to ${analysis.period.end}.
        </div>
        <div class="story-impact">
          <b>Why This Matters:</b> ${this.currentVariable?.why_it_matters || 'Environmental changes in this variable directly affect regional climate and ecosystems.'}
        </div>
        <div class="story-disclaimer">
          ⚠️ <b>Scientific Note:</b> ${analysis.disclaimer}
        </div>
        <details style="margin-top:0.75rem; font-size:0.85rem; color:var(--color-espresso);">
          <summary style="cursor:pointer; font-weight:600;">Show the numbers (Statistical Breakdown)</summary>
          <div style="background:var(--color-canvas); padding:0.75rem; border-radius:6px; margin-top:0.5rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:0.5rem;">
            <div><b>OLS Slope:</b> ${ols.slope_per_year} ${ols.slope_unit}</div>
            <div><b>p-value:</b> ${ols.p_value}</div>
            <div><b>95% CI:</b> [${ols.ci_95_lower}, ${ols.ci_95_upper}]</div>
            <div><b>R-squared:</b> ${ols.r_squared}</div>
            <div><b>Mann-Kendall Z:</b> ${analysis.mann_kendall.z_statistic} (${analysis.mann_kendall.direction})</div>
            <div><b>Theil-Sen Slope:</b> ${analysis.theil_sen.slope_per_year} ${analysis.theil_sen.slope_unit}</div>
            <div><b>Autocorrelation lag-1:</b> ${analysis.autocorrelation.lag1}</div>
            <div><b>Observations:</b> ${analysis.n_observations} (${analysis.pct_missing}% missing)</div>
          </div>
        </details>
      </div>
    `;
  }

  _renderConfidenceMeter(conf) {
    const meterContainer = document.getElementById('confidence-meter-container');
    if (!meterContainer || !conf) return;

    const overallClass = conf.overall === 'High' ? 'confidence-high' : conf.overall === 'Medium' ? 'confidence-medium' : 'confidence-low';

    let factorsHtml = '';
    Object.entries(conf.factors).forEach(([key, f]) => {
      factorsHtml += `
        <div class="factor-box">
          <div class="factor-name">${key.replace('_', ' ')} (${f.rating})</div>
          <div class="factor-detail">${f.detail}</div>
        </div>
      `;
    });

    meterContainer.innerHTML = `
      <div class="confidence-card">
        <div class="confidence-header">
          <div>
            <h4 style="color:var(--color-espresso); font-weight:700;">Dataset Confidence Meter</h4>
            <span style="font-size:0.8rem; color:var(--color-text-muted);">Transparent quality summary (SRD §11)</span>
          </div>
          <div class="confidence-badge-large ${overallClass}">
            <span>Overall:</span> <b>${conf.overall} Confidence</b>
          </div>
        </div>
        <div class="factors-grid">
          ${factorsHtml}
        </div>
      </div>
    `;
  }

  _renderMissionCards() {
    const grid = document.getElementById('missions-grid');
    if (!grid) return;

    grid.innerHTML = this.missions.map(m => `
      <div class="mission-card" data-mission-id="${m.id}">
        <div class="mission-header">
          <span class="mission-icon">${m.icon || '🔍'}</span>
          <span class="badge ${m.is_comparison ? 'badge-green' : ''}">${m.is_comparison ? 'Two-Region' : 'Single Trend'}</span>
        </div>
        <h4 class="mission-title">${m.title}</h4>
        <p class="mission-question">"${m.question}"</p>
        <div class="mission-meta">
          <span class="badge">${m.variable_name}</span>
          <span class="badge">${m.region_name}</span>
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

  _populateDropdowns() {
    const varSelect = document.getElementById('select-variable');
    const regSelect = document.getElementById('select-region');

    if (varSelect && this.variables.length) {
      const currentVal = varSelect.value || this.currentVariable?.id;
      varSelect.innerHTML = this.variables.map(v => `
        <option value="${v.id}">${v.name} (${v.priority || 'P0'}) — ${v.dataset}</option>
      `).join('');
      if (currentVal) varSelect.value = currentVal;
    }

    if (regSelect && this.regions.length) {
      const currentReg = regSelect.value || this.currentRegion?.id;
      regSelect.innerHTML = this.regions.map(r => `
        <option value="${r.id}">${r.name} [${r.boundary_type.replace('_', ' ')}]</option>
      `).join('');
      if (currentReg) regSelect.value = currentReg;
    }
  }

  _renderTopics(topics) {
    const list = document.getElementById('topics-container');
    if (!list) return;

    list.innerHTML = topics.map(t => `
      <div class="topic-chip ${t.available ? '' : 'disabled'}" data-topic-id="${t.id}" style="display:inline-flex; align-items:center; gap:0.4rem; padding:0.4rem 0.8rem; background:var(--color-camel-light); border:1px solid var(--color-camel-border); border-radius:8px; cursor:${t.available ? 'pointer' : 'not-allowed'}; font-size:0.85rem; font-weight:600; color:var(--color-espresso); opacity:${t.available ? 1 : 0.6};">
        <span>${t.icon}</span>
        <span>${t.name}</span>
        ${!t.available ? '<span style="font-size:0.65rem; background:#E5E7EB; padding:1px 4px; border-radius:4px;">Soon</span>' : ''}
      </div>
    `).join('');

    list.querySelectorAll('.topic-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const topic = topics.find(t => t.id === chip.getAttribute('data-topic-id'));
        if (topic && topic.available && topic.recommendation?.variables?.length > 0) {
          const varId = topic.recommendation.variables[0];
          const regId = topic.recommendation.regions[0] || 'pakistan';
          this.loadInvestigation(varId, regId);
        }
      });
    });
  }

  _renderFeaturedStory(story) {
    const feat = document.getElementById('featured-story-banner');
    if (!feat || !story) return;

    feat.innerHTML = `
      <div style="background:var(--color-surface); border:1px solid var(--color-camel-sand); border-left:5px solid var(--color-green-accent); border-radius:var(--radius-md); padding:1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
        <div>
          <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--color-green-dark); letter-spacing:0.05em;">Earth Story of the Week</span>
          <h4 style="font-size:1.15rem; color:var(--color-espresso); font-weight:800; margin:0.25rem 0;">${story.title}</h4>
          <p style="font-size:0.875rem; color:var(--color-text-muted); margin:0;">"${story.question}" — ${story.trend_result}</p>
        </div>
        <button class="btn btn-primary" id="btn-open-featured">Investigate Now &rarr;</button>
      </div>
    `;

    document.getElementById('btn-open-featured')?.addEventListener('click', () => {
      this.loadMission('lahore_smog');
    });
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
    });

    // Export CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      this._exportCSV();
    });

    // Export Markdown
    document.getElementById('btn-export-md')?.addEventListener('click', () => {
      this._exportMarkdown();
    });

    // Assistant Drawer
    const drawer = document.getElementById('assistant-drawer');
    const fab = document.getElementById('assistant-fab');
    const closeBtn = document.getElementById('btn-close-assistant');
    const sendBtn = document.getElementById('btn-assistant-send');
    const chatInput = document.getElementById('assistant-input');

    fab?.addEventListener('click', () => {
      drawer.classList.toggle('open');
    });
    closeBtn?.addEventListener('click', () => {
      drawer.classList.remove('open');
    });

    const sendMsg = async () => {
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';

      const history = document.getElementById('assistant-history');
      history.innerHTML += `<div class="chat-msg chat-user">${text}</div>`;
      history.scrollTop = history.scrollHeight;

      // Typing indicator
      const typingId = `typing-${Date.now()}`;
      history.innerHTML += `<div class="chat-msg chat-bot" id="${typingId}" style="color:var(--color-green-primary); font-style:italic;">✨ Gemini is analyzing NASA observations...</div>`;
      history.scrollTop = history.scrollHeight;

      const replyObj = await api.chatAssistant(text);

      const typingElem = document.getElementById(typingId);
      if (typingElem) typingElem.remove();

      let botHtml = this._formatMarkdown(replyObj.reply);
      if (replyObj.analysis_ref?.variable && replyObj.analysis_ref?.region) {
        const v = replyObj.analysis_ref.variable;
        const r = replyObj.analysis_ref.region;
        botHtml += `<div style="margin-top:8px;"><button class="btn btn-secondary btn-sm" id="btn-chart-jump-${Date.now()}" style="font-size:0.75rem; padding:0.3rem 0.6rem; cursor:pointer; background:var(--color-green-accent); color:var(--color-espresso); border:1px solid var(--color-green-primary); border-radius:6px; font-weight:600;">📊 Load ${v.toUpperCase()} in ${r.replace('_', ' ')} Chart</button></div>`;
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
      .replace(/^\s*(\d+)\.\s+(.*$)/gim, '<div style="display:flex; gap:6px; margin:4px 0 4px 6px;"><b>$1.</b><span>$2</span></div>')
      .replace(/^\s*[-•*]\s+(.*$)/gim, '<div style="display:flex; gap:6px; margin:3px 0 3px 6px;"><span>•</span><span>$1</span></div>')
      .replace(/\n\n+/g, '<div style="margin-top:8px;"></div>')
      .replace(/\n/g, '<br>');
  }

  _exportCSV() {
    if (!this.currentData) return;
    const rows = [
      ["date", "raw_value", "seasonal_anomaly"],
      ...this.currentData.series.map(p => [p.date, p.value !== null ? p.value : "", p.anomaly !== null ? p.anomaly : ""])
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `trend_${this.currentVariable.id}_${this.currentRegion.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  _exportMarkdown() {
    if (!this.currentAnalysis) return;
    const a = this.currentAnalysis;
    const md = `# Trend Investigation: ${a.variable_name} in ${a.region_name}
- **OLS Trend Rate:** ${a.ols.slope_per_year} ${a.ols.slope_unit}
- **Statistically Significant:** ${a.ols.p_value < 0.05 ? 'Yes (p < 0.05)' : 'No'}
- **Total Change:** ${a.ols.total_change} ${a.unit}
- **Dataset:** ${this.currentVariable.dataset} (${this.currentVariable.provider})
- **Disclaimer:** A trend does not prove cause or future continuation.`;

    const blob = new Blob([md], { type: 'text/markdown' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `report_${this.currentVariable.id}_${this.currentRegion.id}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  _dateToFractionalYear(dateStr) {
    const parts = dateStr.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return y + (m - 0.5) / 12.0;
  }
}

// Bootstrap app on DOM load
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  window.trendApp = app;
  app.init();
});
