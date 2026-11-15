/** Trend Detector: page controller (hash-routed). Statistics come from stats.js, unchanged. */
import { api } from './api.js';
import * as stats from './stats.js';
import { TrendChart } from './chart.js';
import { RegionMap } from './map.js';
import { initPollutionIndex } from './pollution.js';
import { initPatterns } from './patterns.js';
import { esc, safeMarkdown, safeId } from './util.js';
import { startRouter, buildHash, saveSelection, loadSelection } from './router.js';
import { tok, palette } from './theme.js';
import { initUI, icon, callout, disclosure, toast, viewTransition, scrollSpy, reducedMotion, setEarthCity, setEarthAnimEnabled, isEarthAnimEnabled } from './ui.js';
import { initMascot, mascotSvg } from './mascot.js';

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const S = { vars: [], regions: [], missions: [], hotspots: [], terms: [], meta: {}, series: null, plain: false };
const DIR = {
  increasing: { cls: 'up', icon: '↑', text: 'Increasing' },
  decreasing: { cls: 'down', icon: '↓', text: 'Decreasing' },
  flat: { cls: 'flat', icon: '→', text: 'No clear trend' },
};
const TIER = { significant: 'Statistically significant', caution: 'Significant, interpret with caution', no_trend: 'No significant trend' };
const vOf = (id) => S.vars.find((v) => v.id === id) || S.vars[0];
const rOf = (id) => S.regions.find((r) => r.id === id) || S.regions[0];

/* ---------- analysis (same calls as before; no statistics changed) ---------- */
function analyze(varId, cityId, useAnom = true) {
  const v = vOf(varId), r = rOf(cityId);
  const pts = S.series[r.id].variables[v.id];
  const dates = pts.map((p) => p.date), values = pts.map((p) => p.value);
  const an = stats.computeClimatologicalAnomalies(dates, values);
  const analysis = stats.analyzeSeries(v.id, r.id, dates, useAnom ? an.anomalies : values, v.unit, useAnom);
  analysis.month_means = an.monthMeans;
  const points = pts.map((p, i) => ({ date: p.date, value: p.value, anomaly: an.anomalies[i] }));
  return { v, r, analysis, points };
}
const dirKey = (a) => (a.verdict.tier === 'no_trend' ? 'flat' : (DIR[a.verdict.direction] ? a.verdict.direction : 'flat'));
/* Presentation only: rainfall is shown in neutral blue because up or down is not good or bad. Always arrow + label, never colour alone. */
const NEUTRAL_VARS = new Set(['rain_mm']);
const badgeHtml = (key, varId, pulse = false) => { const d = DIR[key] || DIR.flat; return `<span class="badge ${d !== DIR.flat && NEUTRAL_VARS.has(varId) ? 'neutral' : d.cls}${pulse ? ' pulse' : ''}"><span aria-hidden="true">${d.icon}</span> ${d.text}</span>`; };
const badge = (a, varId, pulse = false) => badgeHtml(dirKey(a), varId, pulse);
const arrowLink = (href, label, cls = '') => `<a class="link-arrow ${cls}" href="${href}">${esc(label)}${icon('arrow')}</a>`;
const num = (x, s = 1) => { const y = x / s; return `${y > 0 ? '+' : ''}${Math.abs(y) >= 1000 || (y !== 0 && Math.abs(y) < 0.001) ? y.toExponential(2) : y.toFixed(Math.abs(y) < 10 ? 3 : 1)}`; };
const sci = (x) => Number(x).toExponential(3);
const p3 = (p) => (p < 0.001 ? '< 0.001' : p.toFixed(3));
const km = (a, b) => { const R = 6371, t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lon - a.lon) * t;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const nearby = (ids) => { const out = [];
  ids.forEach((x, i) => ids.slice(i + 1).forEach((y) => { const d = km(rOf(x), rOf(y)); if (d < 150) out.push(`${rOf(x).name} and ${rOf(y).name} are only about ${Math.round(d)} km apart, so their records may not be independent.`); })); return out; };

function headline({ v, r, analysis: a }) {
  const t = a.verdict.tier, d = a.verdict.direction === 'decreasing' ? 'falling' : 'rising';
  if (t === 'significant') return `${v.name} is ${d} in ${r.name}.`;
  if (t === 'caution') return `${v.name} may be ${d} in ${r.name}. Interpret with caution.`;
  return `No clear long-term trend in ${v.name} in ${r.name}.`;
}
const term = (technical, plain, hint) => (S.plain ? esc(plain) : `<abbr title="${esc(hint || plain)}">${esc(technical)}</abbr>`);

/* ---------- shared UI ---------- */
function selectors(varId, cityId) {
  return `<div class="filters">
    <label class="field">Variable<select id="sel-var">${S.vars.map((v) => `<option value="${esc(v.id)}" ${v.id === varId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <label class="field">City<select id="sel-city">${S.regions.map((r) => `<option value="${esc(r.id)}" ${r.id === cityId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>`;
}
function stateBox(msg, retry) {
  main.innerHTML = `<div class="container page"><div class="state">${icon('warn')}<h1>${esc(msg)}</h1><p>Check your connection and try again.</p>${retry ? '<button class="btn btn-primary" id="retry" type="button">Retry</button>' : '<a class="btn btn-primary" href="#/home">Go home</a>'}</div></div>`;
  $('#retry')?.addEventListener('click', () => location.reload());
}
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 500); }

let leafletP;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  leafletP ||= new Promise((ok, no) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    l.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; l.crossOrigin = ''; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; s.crossOrigin = ''; s.onload = ok; s.onerror = no; document.head.appendChild(s);
  });
  return leafletP;
}

/* ---------- your city: location + personal air box ---------- */
const LOC_KEY = 'td:city';
const CIG_PM25 = 22;          // Berkeley Earth rule of thumb: 22 µg/m³ PM2.5 over 24 h ≈ 1 cigarette
const WHO_PM25 = 5;           // WHO 2021 annual PM2.5 guideline, µg/m³
const YEARS_PER_UG = 0.098;   // AQLI: about 0.98 years of life expectancy per 10 µg/m³ above the guideline
const exploreHref = (v, c) => buildHash('trends', { tab: 'explorer', var: v, city: c });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (d) => `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;

function nearestRegion(lat, lon) {
  let best = null;
  S.regions.forEach((r) => { const d = km({ lat, lon }, r); if (!best || d < best.km) best = { region: r, km: d }; });
  return best;
}
function readCity() { try { return JSON.parse(localStorage.getItem(LOC_KEY) || 'null'); } catch { return null; } }
function writeCity(c) { try { if (c) localStorage.setItem(LOC_KEY, JSON.stringify(c)); else localStorage.removeItem(LOC_KEY); } catch { /* private mode */ } }
function getPosition() {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) return no(Object.assign(new Error('unsupported'), { code: 0 }));
    navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 });
  });
}
/** Optional: turn coordinates into a place name. Falls back silently to the nearest tracked city. */
async function placeName(lat, lon) {
  try {
    const u = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&localityLanguage=en`;
    const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = await r.json();
    return j.city || j.locality || null;
  } catch { return null; }
}
async function loadPI() {
  S.pi ||= await fetch('./data/pollution_index.json').then((r) => r.json());
  return S.pi;
}
/** Everything the air box shows for one tracked city. */
async function airFor(region) {
  const pi = await loadPI(), c = pi.cities[region.name];
  const cats = pi.meta.categories, catOf = (v) => (cats.find((k) => v <= k.max) || cats.at(-1)).name;
  const last12 = c.pm25.slice(-12), avg = last12.reduce((x, y) => x + y, 0) / last12.length;
  const out = {
    pm25: avg, period: `${monthLabel(c.dates.at(-12))} to ${monthLabel(c.dates.at(-1))}`,
    cigs: avg / CIG_PM25, years: Math.max(0, avg - WHO_PM25) * YEARS_PER_UG,
    pi: c.latest, cat: catOf(c.latest), piNote: `Latest month on record (${monthLabel(c.dates.at(-1))})`, live: false,
  };
  try {
    const r = await fetch('/api/live-pi', { signal: AbortSignal.timeout(6000) });
    const j = r.ok ? await r.json() : null, l = j?.cities?.[region.name];
    if (l && typeof l.pi === 'number') Object.assign(out, { pi: l.pi, cat: l.category, piNote: 'Live now-cast, updated every 30 minutes', live: true });
  } catch { /* historical value stays */ }
  return out;
}
const fmt1 = (x) => (x < 10 ? x.toFixed(1) : Math.round(x).toString());

/* Air-quality band (1–5) for colour only; uses the same category thresholds as the data file. */
const aqIdx = (v) => { const c = S.pi?.meta.categories || []; const i = c.findIndex((k) => v <= k.max); return (i < 0 ? Math.max(c.length - 1, 0) : i) + 1; };
const gauge = (v) => `<svg class="gauge aq-c${aqIdx(v)}" viewBox="0 0 40 40" style="--v:${Math.max(0, Math.min(100, v)).toFixed(1)}" aria-hidden="true"><circle class="gauge-track" cx="20" cy="20" r="16"/><circle class="gauge-fill" cx="20" cy="20" r="16" pathLength="100"/></svg>`;
const statSkeleton = '<div class="stat-grid" aria-hidden="true"><div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div></div>';

async function renderAirBox(box, state) {
  const picker = `<label class="field">Or choose a city<select id="city-pick"><option value="">Select a city</option>${S.regions.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label>`;
  const bindPicker = () => $('#city-pick', box)?.addEventListener('change', (e) => {
    const r = S.regions.find((x) => x.id === e.target.value); if (!r) return;
    const c = { name: r.name, regionId: r.id, km: 0, manual: true }; writeCity(c); renderAirBox(box, { city: c });
  });
  if (state.busy) { box.innerHTML = `<span class="eyebrow">Your city</span><div class="loading-row"><span class="orbit" aria-hidden="true"></span><span role="status">Finding your city…</span></div>${statSkeleton}`; return; }
  if (!state.city) {
    box.innerHTML = `<span class="eyebrow">Your city</span><h2>See the air where you live</h2>
      <p class="muted">Allow location access and we will show your city’s pollution index, the cigarettes’ worth of smoke you breathe, and the life expectancy at risk.</p>
      ${state.error ? callout(esc(state.error), 'warn', 'role="alert"') : ''}
      <div class="locate-row"><button class="btn" id="locate" type="button">${icon('pin')}Use my location</button>${picker}</div>
      <p class="dim small">Your position is used in your browser to find the nearest city. If you allow place names, rounded coordinates go to a free reverse-geocoding service. Nothing is stored on our server.</p>`;
    $('#locate', box).addEventListener('click', async () => {
      renderAirBox(box, { busy: true });
      try {
        const pos = await getPosition(), { latitude: lat, longitude: lon } = pos.coords, near = nearestRegion(lat, lon);
        const name = (await placeName(lat, lon)) || near.region.name;
        const c = { name, regionId: near.region.id, km: Math.round(near.km) }; writeCity(c); renderAirBox(box, { city: c });
      } catch (e) {
        const msg = e?.code === 1 ? 'Location permission was denied. You can pick a city below instead.' : 'We could not get your location. Pick a city below instead.';
        renderAirBox(box, { error: msg });
      }
    });
    bindPicker(); return;
  }
  const c = state.city, region = S.regions.find((r) => r.id === c.regionId) || S.regions[0];
  box.innerHTML = `<span class="eyebrow">Your city</span><div class="loading-row"><span class="orbit" aria-hidden="true"></span><span role="status">Loading air data for ${esc(region.name)}…</span></div>${statSkeleton}`;
  let air; try { air = await airFor(region); } catch (e) { console.error(e); box.innerHTML = `<span class="eyebrow">Your city</span>${callout('Air data could not be loaded.<br><button class="btn" id="aq-retry" type="button">Retry</button>', 'error')}`; $('#aq-retry', box)?.addEventListener('click', () => renderAirBox(box, state)); return; }
  const far = c.km > 40 && c.name !== region.name;
  box.innerHTML = `<div class="aq-top"><div><span class="eyebrow">Your city</span><h2>${esc(c.name)}</h2>
      ${far ? `<small>Closest tracked city: ${esc(region.name)}, about ${c.km} km away. The numbers below are for ${esc(region.name)}.</small>` : ''}</div>
      <button class="btn btn-ghost" id="aq-change" type="button">Change city</button></div>
    <div class="stat-grid" data-reveal="stagger">
      <article class="stat-card">
        <div class="stat-label"><span>Pollution index</span>${gauge(air.pi)}</div>
        <p class="stat-value"><b class="num" data-count>${esc(fmt1(air.pi))}</b><span>/ 100</span></p>
        <div class="stat-badges"><span class="badge wrap aq-${aqIdx(air.pi)}"><i class="dot" aria-hidden="true"></i>${esc(air.cat)}</span>${air.live ? '<span class="pill live">Live</span>' : ''}</div>
        <p class="stat-caption">${esc(air.piNote)}</p>
      </article>
      <article class="stat-card">
        <div class="stat-label"><span>Daily smoke equivalent</span>${icon('smoke', 'ico-lg')}</div>
        <p class="stat-value"><b class="num" data-count>≈ ${esc(fmt1(air.cigs))}</b><span>cigarettes a day</span></p>
        <div class="stat-badges"><span class="pill">Estimate</span></div>
        <p class="stat-caption">Breathing the past year’s average air is like smoking this many.</p>
      </article>
      <article class="stat-card">
        <div class="stat-label"><span>Life expectancy at risk</span>${icon('heart', 'ico-lg')}</div>
        <p class="stat-value"><b class="num" data-count>≈ ${esc(fmt1(air.years))}</b><span>years</span></p>
        <div class="stat-badges"><span class="pill">Estimate</span></div>
        <p class="stat-caption">If this level of air lasted a lifetime, compared with the WHO guideline.</p>
      </article>
    </div>
    <div class="aq-foot">${disclosure('How is this calculated?', `<p>Based on average PM2.5 of ${esc(air.pm25.toFixed(1))} µg/m³ for ${esc(air.period)}. Rules of thumb: 22 µg/m³ ≈ 1 cigarette a day (Berkeley Earth); about 1 year of life per 10 µg/m³ above the WHO guideline of ${WHO_PM25} µg/m³ (Air Quality Life Index). Estimates, not medical advice. The index is a satellite and model composite, not a regulatory AQI.</p>`)}
      ${arrowLink(exploreHref('pm25', region.id), `See how PM2.5 is changing in ${region.name}`)}</div>`;
  $('#aq-change', box).addEventListener('click', () => { writeCity(null); renderAirBox(box, {}); });
}

/** Hero mini trend visual: yearly averages of the remembered series (plain means of the real monthly values; display only). */
function heroViz() {
  const sel = loadSelection(), cur = analyze(sel.var, sel.city), { v, r, analysis: a, points } = cur, sc = v.display_scale || 1, du = v.display_unit || v.unit;
  const yr = {}; points.forEach((p) => { (yr[p.date.slice(0, 4)] ||= []).push(p.value / sc); });
  const ys = Object.keys(yr), m = ys.map((y) => yr[y].reduce((s, x) => s + x, 0) / yr[y].length), lo = Math.min(...m), hi = Math.max(...m);
  const X = (i) => 6 + (i / (m.length - 1)) * 308, Y = (val) => 108 - ((val - lo) / ((hi - lo) || 1)) * 92;
  const line = m.map((val, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(val).toFixed(1)}`).join(' ');
  return `<aside class="card hero-viz" aria-label="Example trend">
    <div class="hero-viz-head"><div><h2>${esc(v.name)}, ${esc(r.name)}</h2><small>Yearly average (${esc(du)})</small></div>${badge(a, v.id)}</div>
    <svg class="spark" viewBox="0 0 320 120" role="img" aria-label="${esc(headline(cur))}">
      <line class="spark-grid" x1="6" y1="16" x2="314" y2="16"/><line class="spark-grid" x1="6" y1="62" x2="314" y2="62"/><line class="spark-grid" x1="6" y1="108" x2="314" y2="108"/>
      <path class="spark-area" d="${line} L314 118 L6 118 Z"/><path class="spark-line" pathLength="1" d="${line}"/>
      <circle class="spark-dot" cx="${X(m.length - 1).toFixed(1)}" cy="${Y(m.at(-1)).toFixed(1)}" r="4"/></svg>
    <div class="spark-axis" aria-hidden="true"><span>${esc(ys[0])}</span><span>${esc(ys.at(-1))}</span></div>
    ${arrowLink(exploreHref(v.id, r.id), 'Open in the explorer')}</aside>`;
}
const missionCard = (m) => `<a class="card card-link mission" href="${exploreHref(m.variable, m.region)}"><h3>${esc(m.title)}</h3><p>${esc(m.question)}</p><span class="card-foot"><small>${esc(m.result_summary)}</small>${icon('arrow')}</span></a>`;

/* ---------- pages ---------- */
async function home() {
  const feat = S.missions.slice(0, 3);
  const title = 'Is Pakistan’s air getting better or worse?'.split(' ').map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ');
  let viz = ''; try { viz = heroViz(); } catch (e) { console.info('Hero visual unavailable', e); }
  main.innerHTML = `<div class="container page"><section class="hero">
      <div><h1>${title}</h1>
      <p class="lead">Twenty years of monthly pollution and rainfall records for eight cities, tested for real trends.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="${exploreHref(loadSelection().var, loadSelection().city)}">Start investigating</a>
        <a class="btn" href="#/compare">Compare cities</a>
      </div></div>${viz}</section>
    <section class="card aq section" id="air-box" aria-live="polite" aria-label="Air where you live"></section>
    <section id="home-pi" class="section" aria-label="Pollution index, all cities"></section>
    <section class="section" aria-labelledby="h-missions"><div class="section-head"><h2 id="h-missions">Featured missions</h2></div>
      <div class="card-grid" data-reveal="stagger">${feat.map(missionCard).join('')}</div></section>
    <section id="pi-snap" class="section" aria-label="Most polluted city"></section></div>`;
  const box = $('#air-box'), saved = readCity();
  if (saved && S.regions.some((r) => r.id === saved.regionId)) renderAirBox(box, { city: saved });
  else {
    renderAirBox(box, {});
    // If the browser already granted permission earlier, skip the prompt and show the city straight away.
    navigator.permissions?.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted' && $('#locate')) $('#locate').click(); }).catch(() => {});
  }
  initPollutionIndex($('#home-pi'), { compact: true });
  loadPI().then((j) => {
    const t = j.ranking_latest[0], snap = $('#pi-snap'); if (!snap) return;
    snap.innerHTML = `<div class="section-head"><h2>Most polluted city</h2></div>
      <article class="card card-link top-city aq-c${aqIdx(t.pi)}" data-reveal>
        <div class="top-city-id"><h3>${esc(t.city)}</h3><span class="badge wrap aq-${aqIdx(t.pi)}"><i class="dot" aria-hidden="true"></i>${esc(t.category)}</span></div>
        <p class="stat-value"><b class="num" data-count>${esc(t.pi)}</b><span>/ 100</span></p>
        <div><p>Highest Pollution Index in the latest month, on a 0 to 100 scale.</p>${arrowLink('#/pollution', 'See the full ranking', 'stretched')}</div>
      </article>`;
  }).catch((e) => console.info('PI snapshot unavailable', e));
}

async function explorer(params, host) {
  const sel = { var: safeId(params.var), city: safeId(params.city) };
  if (!sel.var || !sel.city) Object.assign(sel, loadSelection());
  let anom = params.mode !== 'raw';
  host.innerHTML = `<div class="explore">
    <div class="x-sel stack"><h2>Explorer</h2>${selectors(sel.var, sel.city)}
      <label class="check"><input type="checkbox" id="anom" ${anom ? 'checked' : ''}> Remove seasonal cycle</label></div>
    <section class="x-main stack" aria-live="polite"><div class="card result" id="result"></div>
      <div class="card chart-card"><div class="head" id="chart-head"></div><div class="chart-box"><canvas id="cv" role="img" aria-label="Monthly time series with trend line"></canvas></div>
        <div class="legend"><span class="l-obs"><i></i>Observed</span><span class="l-fit"><i></i>Trend line</span><span class="l-base"><i class="dash"></i>Baseline</span></div>
        <p id="chart-text" class="muted"></p>${disclosure('Show data table (yearly averages)', '<div class="scroll-x" id="year-table"></div>')}</div></section>
    <div class="x-map stack"><div class="map-frame skel" id="map" role="group" aria-label="City map"></div>
      <div class="chips" id="city-list" role="group" aria-label="Cities"></div></div></div>`;
  const chart = new TrendChart($('#cv'));
  let cur, firstDraw = true;
  const draw = () => {
    cur = analyze(sel.var, sel.city, anom);
    const { v, r, analysis: a, points } = cur, sc = v.display_scale || 1, du = v.display_unit || v.unit;
    chart.setData(points, a.ols, v.unit, anom, sc, du);
    const ols = a.ols, mk = a.mann_kendall, conf = stats.computeConfidenceMeter(240, 0.0, a.autocorrelation.r1);
    const rows = [
      [term('Slope (OLS)', 'Average change per year', 'Straight-line fit through the series'), `${sci(ols.slope_per_year)} ${ols.slope_unit}`],
      [term('Adjusted p-value', 'Chance this is just noise', 'Corrected for month-to-month similarity'), p3(ols.p_value_adjusted)],
      [term('95% CI on slope', 'Likely range of yearly change', 'Confidence interval'), `${sci(ols.ci_95_lower)} to ${sci(ols.ci_95_upper)}`],
      [term('Mann-Kendall τ', 'Does it keep rising or falling?', 'Rank-based trend test'), `${mk.tau.toFixed(3)} (p ${p3(mk.p_value)})`],
      [term('Theil-Sen slope', 'Yearly change, ignoring outliers', 'Median of pairwise slopes'), `${sci(a.theil_sen.slope_per_year)} ${a.theil_sen.slope_unit}`],
      [term('Lag-1 r₁', 'How much a month resembles the next', 'Lag-1 autocorrelation'), a.autocorrelation.r1.toFixed(3)],
      [term('Effective n', 'Independent months', 'Effective sample size after autocorrelation'), `${a.autocorrelation.n_eff.toFixed(1)} of 240`],
      [term('R²', 'Share explained by a straight line'), ols.r_squared.toFixed(3)],
    ];
    const numbersOpen = !!$('#result .disc.is-open'), level = { Low: 1, Medium: 2, High: 3 }[conf.overall] || 2;
    $('#result').innerHTML = `<div class="result-badges">${badge(a, v.id, firstDraw)}<span class="pill">${esc(TIER[a.verdict.tier])}</span></div>
      <h2>${esc(headline(cur))}</h2>
      <div class="metrics"><div class="metric"><b class="num" data-count>${esc(num(ols.slope_per_year, sc))}</b><span>${esc(du)} per year</span></div>
        <div class="metric"><b class="num" data-count>${esc(num(ols.total_change, sc))}</b><span>${esc(du)} since 2005</span></div>
        <div class="metric"><strong class="conf conf-${level}">${esc(conf.overall)}<i class="meter" aria-hidden="true"><i></i><i></i><i></i></i></strong><span>data confidence</span></div></div>
      ${callout('A trend shows what changed, not why. Nearby cities may share data.')}
      ${disclosure('Show the numbers', `<div class="scroll-x"><table class="kv"><tbody>${rows.map((x) => `<tr><th scope="row">${x[0]}</th><td>${esc(x[1])}</td></tr>`).join('')}</tbody></table></div>
        <p>${esc(v.why_it_matters || '')}</p>`, numbersOpen)}`;
    firstDraw = false;
    $('#chart-head').innerHTML = `<div><h3>${esc(v.name)}, ${esc(r.name)}</h3><small>240 months, ${esc(a.period.start.slice(0, 7))} to ${esc(a.period.end.slice(0, 7))}</small></div>
      <details class="menu"><summary class="btn">${icon('download')}Export${icon('chevron')}</summary><div class="pop"><button type="button" data-x="csv">Download CSV</button><button type="button" data-x="png">Download PNG</button><button type="button" data-x="md">Download summary</button></div></details>`;
    $('#chart-text').textContent = `${headline(cur)} Change is about ${num(ols.slope_per_year, sc)} ${du} per year, ${num(ols.total_change, sc)} ${du} overall.`;
    const yr = {}; points.forEach((p) => { (yr[p.date.slice(0, 4)] ||= []).push(p.value); });
    $('#year-table').innerHTML = `<table><thead><tr><th>Year</th><th>Mean (${esc(du)})</th></tr></thead><tbody>${Object.entries(yr).map(([y, a2]) => `<tr><td class="num">${y}</td><td class="num">${num(a2.reduce((s, x) => s + x, 0) / a2.length, sc).replace('+', '')}</td></tr>`).join('')}</tbody></table>`;
    $('#city-list').innerHTML = S.regions.map((rg) => { const t = S.trends?.[rg.id]; const d = DIR[t || 'flat'];
      return `<button class="chip" type="button" data-city="${esc(rg.id)}" aria-pressed="${rg.id === sel.city}">${esc(rg.name)} <span aria-hidden="true">${d.icon}</span><span class="hide">${d.text}</span></button>`; }).join('');
    $('#chart-head [data-x]')?.closest('.pop').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { exportAs(b.dataset.x, cur, anom); b.closest('details').removeAttribute('open'); toast('Download started'); }));
    saveSelection(sel); history.replaceState(null, '', buildHash('trends', { tab: 'explorer', var: sel.var, city: sel.city, mode: anom ? '' : 'raw' }));
    $('#map')?.toggleAttribute('data-neutral', NEUTRAL_VARS.has(sel.var));
    map?.setActiveCity(sel.city);
    setEarthCity(sel.city);
  };
  S.trends = {}; S.regions.forEach((rg) => { try { S.trends[rg.id] = dirKey(analyze(sel.var, rg.id).analysis); } catch { /* skip */ } });
  let map;
  const refreshTrends = () => { S.trends = {}; const t = {}; S.regions.forEach((rg) => { const a = analyze(sel.var, rg.id).analysis; S.trends[rg.id] = dirKey(a); t[rg.id] = { direction: dirKey(a) === 'flat' ? 'stable' : dirKey(a), tier: a.verdict.tier }; }); map?.updateTrends(t); };
  const change = () => { refreshTrends(); draw(); };
  $('#sel-var').addEventListener('change', (e) => { sel.var = e.target.value; change(); });
  $('#sel-city').addEventListener('change', (e) => { sel.city = e.target.value; $('#sel-city').value = sel.city; draw(); });
  $('#anom').addEventListener('change', (e) => { anom = e.target.checked; draw(); });
  $('#city-list').addEventListener('click', (e) => { const b = e.target.closest('[data-city]'); if (!b) return; sel.city = b.dataset.city; $('#sel-city').value = sel.city; draw(); });
  draw();
  loadLeaflet().then(() => { if (!$('#map')) return; $('#map').classList.remove('skel'); map = new RegionMap('map', (id) => { sel.city = id; $('#sel-city').value = id; draw(); }); map.init(S.regions); refreshTrends(); map.setActiveCity(sel.city); })
    .catch(() => { $('#map')?.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Map unavailable. Use the city list.' })); });
}
function exportAs(kind, cur, anom) {
  const { v, r, analysis: a, points } = cur, sc = v.display_scale || 1, du = v.display_unit || v.unit, id = `${v.id}_${r.id}`;
  if (kind === 'csv') download(`trend_${id}.csv`, new Blob([['date,value,seasonal_anomaly', ...points.map((p) => `${p.date},${p.value},${p.anomaly}`)].join('\n')], { type: 'text/csv' }));
  else if (kind === 'png') $('#cv').toBlob((b) => b && download(`trend_${id}.png`, b));
  else download(`trend_${id}.md`, new Blob([`# ${headline(cur)}\n\n- Variable: ${v.name} (${du})\n- City: ${r.name}\n- Verdict: ${TIER[a.verdict.tier]}\n- Change per year: ${num(a.ols.slope_per_year, sc)} ${du}\n- Since 2005: ${num(a.ols.total_change, sc)} ${du}\n- Series: ${anom ? 'seasonal anomalies' : 'raw values'}, 240 months\n\nA trend shows what changed, not why.\n`], { type: 'text/markdown' }));
}

/* ---------- Trends: explorer + missions + contrasts + ranked hotspots + minor patterns ---------- */
const TABS = [['explorer', 'Explorer'], ['missions', 'Missions'], ['contrasts', 'Contrasts'], ['ranked', 'Ranked hotspots'], ['patterns', 'Minor patterns']];
function trends(params) {
  const tab = TABS.some((t) => t[0] === params.tab) ? params.tab : 'explorer';
  const pairs = [['rain_mm', 'peshawar', 'karachi', 'Rainfall: northwest valley vs southern coast'], ['no2', 'peshawar', 'multan', 'Traffic fumes: Peshawar vs Multan'], ['pm25', 'lahore', 'faisalabad', 'Smog: Lahore vs Faisalabad']];
  const bodies = {
    missions: () => `<div class="section-head"><p>Guided questions, each with the answer the data gives.</p></div><div class="card-grid" data-reveal="stagger">${S.missions.map(missionCard).join('')}</div>`,
    contrasts: () => `<div class="section-head"><p>Pairs of cities that behave differently for the same variable.</p></div><div class="card-grid" data-reveal="stagger">${pairs.map(([vr, a, b, t]) => { const x = analyze(vr, a), y = analyze(vr, b), v = x.v, sc = v.display_scale || 1;
      return `<div class="card mission"><h3>${esc(t)}</h3>${[x, y].map((z) => `<div class="contrast-row"><strong>${esc(z.r.name)}</strong>${badge(z.analysis, v.id)}<small class="num">${esc(num(z.analysis.ols.slope_per_year, sc))} ${esc(v.display_unit || v.unit)}/yr</small></div>`).join('')}
        ${nearby([a, b]).map((n) => callout(esc(n), 'warn')).join('')}<span class="card-foot">${arrowLink(buildHash('compare', { var: vr, cities: `${a},${b}` }), 'Compare these cities')}</span></div>`; }).join('')}</div>`,
    ranked: () => `<div class="section-head"><p>The strongest trends in the record, ranked.</p></div><div class="card-grid" data-reveal="stagger">${S.hotspots.map((h) => `<a class="card card-link mission" href="${exploreHref(h.variable, h.region)}"><h3>${esc(h.rank)}. ${esc(h.title)}</h3><div class="contrast-row">${badgeHtml(DIR[h.direction] ? h.direction : 'flat', h.variable)}<small class="num">${esc(h.rate)}</small></div><p>${esc(h.significance)}. ${esc(h.why_it_matters)}</p></a>`).join('')}</div>`,
  };
  main.innerHTML = `<div class="container page"><header class="page-head"><h1>Trends</h1>
    <p>Every trend we found in one place: explore any series, follow guided missions, see contrasts and rankings, and check the smaller seasonal and behavioural patterns. Want two or more cities side by side instead? <a href="#/compare">Compare cities</a>.</p></header>
    <div class="scroll-fade"><div class="tabs" data-scroller role="tablist" aria-label="Trend views">${TABS.map(([k, l]) => `<button type="button" role="tab" id="tab-${k}" aria-controls="tab-body" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div></div>
    <div id="tab-body" class="tab-body" role="tabpanel" aria-labelledby="tab-${tab}"></div></div>`;
  main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.tab; location.hash = buildHash('trends', k === 'explorer' ? { tab: k, ...loadSelection() } : { tab: k });
  }));
  const host = $('#tab-body');
  if (tab === 'explorer') explorer(params, host);
  else if (tab === 'patterns') initPatterns(host);
  else host.innerHTML = bodies[tab]();
}
/* Old links: #/explore and #/discover keep working. */
const legacyExplore = (p) => location.replace(buildHash('trends', { tab: 'explorer', var: p.var, city: p.city, mode: p.mode }));
const legacyDiscover = (p) => location.replace(buildHash('trends', { tab: ['contrasts', 'ranked'].includes(p.tab) ? p.tab : 'missions' }));

function pollution() {
  main.innerHTML = `<div class="container page"><header class="page-head"><h1>Pollution index</h1></header><div id="pi-root"></div>${callout(`Looking for the smaller seasonal and behavioural patterns? They now live under <a href="${buildHash('trends', { tab: 'patterns' })}">Trends, Minor patterns</a>.`)}</div>`;
  initPollutionIndex($('#pi-root'));
}

/* Compare chart: colour + dash pattern, so lines stay distinguishable without colour. */
const DASHES = [[], [8, 4], [2, 3], [10, 3, 2, 3]];
const swatch = (i) => `<svg class="swatch line-${i + 1}" viewBox="0 0 28 6" aria-hidden="true"><line x1="1" y1="3" x2="27" y2="3" stroke-dasharray="${DASHES[i].join(' ')}"/></svg>`;
function compare(params) {
  const sel = loadSelection();
  let vid = safeId(params.var, sel.var);
  let ids = (params.cities || '').split(',').map((x) => safeId(x)).filter((x) => S.regions.some((r) => r.id === x)).slice(0, 4);
  if (ids.length < 2) ids = [...new Set([sel.city, 'karachi', 'lahore'])].slice(0, 2);
  main.innerHTML = `<div class="container page"><header class="page-head"><h1>Compare cities</h1></header><div class="stack-lg">
    <div class="compare-filters"><label class="field">Variable<select id="sel-var">${S.vars.map((v) => `<option value="${esc(v.id)}" ${v.id === vid ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      <div class="field-group"><span id="pick-label">Choose 2 to 4 cities</span><div class="chips" id="pick" role="group" aria-labelledby="pick-label"></div></div></div>
    <div class="card chart-card"><div class="chart-box"><canvas id="cv2" role="img" aria-label="Overlaid 12-month averages"></canvas></div><div class="legend" id="lg"></div><p class="muted" id="ctext"></p></div>
    <div class="table-wrap scroll-fade"><div class="scroll-x" data-scroller id="ctable"></div></div><div id="cnote" class="stack"></div></div></div>`;
  const render = () => {
    const v = vOf(vid), sc = v.display_scale || 1, du = v.display_unit || v.unit;
    $('#pick').innerHTML = S.regions.map((r) => `<button class="chip" type="button" data-id="${esc(r.id)}" aria-pressed="${ids.includes(r.id)}">${esc(r.name)}</button>`).join('');
    const res = ids.map((id) => analyze(vid, id));
    $('#lg').innerHTML = res.map((x, i) => `<span>${swatch(i)}${esc(x.r.name)}</span>`).join('');
    drawLines($('#cv2'), res.map((x) => x.points.map((p) => p.value / sc)), res[0].points.map((p) => p.date), du);
    $('#ctext').textContent = `12-month averages of ${v.name} (${du}) for ${res.map((x) => x.r.name).join(', ')}.`;
    $('#ctable').innerHTML = `<table><thead><tr><th>City</th><th>Direction</th><th>Change per year (${esc(du)})</th><th>Confidence</th></tr></thead><tbody>${res.map((x) => `<tr><th scope="row">${esc(x.r.name)}</th><td>${badge(x.analysis, v.id)}</td><td class="num">${esc(num(x.analysis.ols.slope_per_year, sc))}</td><td>${esc(TIER[x.analysis.verdict.tier])}</td></tr>`).join('')}</tbody></table>`;
    $('#cnote').innerHTML = nearby(ids).map((n) => callout(esc(n), 'warn')).join('');
    saveSelection({ var: vid, city: ids[0] }); history.replaceState(null, '', buildHash('compare', { var: vid, cities: ids.join(',') }));
    setEarthCity(ids[0]);
  };
  $('#sel-var').addEventListener('change', (e) => { vid = e.target.value; render(); });
  $('#pick').addEventListener('click', (e) => { const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
    if (ids.includes(id)) { if (ids.length > 2) ids = ids.filter((x) => x !== id); } else if (ids.length < 4) ids.push(id); render(); });
  render();
}
function drawLines(cv, seriesList, dates, unit) {
  const t0 = performance.now();
  const draw = () => {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    cv.width = w * dpr; cv.height = h * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const sm = seriesList.map((s) => s.map((_, i) => { const a = s.slice(Math.max(0, i - 11), i + 1); return a.reduce((x, y) => x + y, 0) / a.length; }).slice(11));
    const d2 = dates.slice(11), all = sm.flat(), lo = Math.min(...all), hi = Math.max(...all), P = { l: 52, r: 10, t: 10, b: 24 };
    const X = (i) => P.l + (i / (d2.length - 1)) * (w - P.l - P.r), Y = (v) => P.t + (1 - (v - lo) / ((hi - lo) || 1)) * (h - P.t - P.b);
    c.strokeStyle = tok('--grid'); c.fillStyle = tok('--text-2'); c.font = `500 11px ${tok('--font-mono')}`; c.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4, y = Y(v); c.beginPath(); c.moveTo(P.l, y); c.lineTo(w - P.r, y); c.stroke(); c.textAlign = 'right'; c.fillText(Math.abs(v) >= 1000 ? v.toExponential(1) : v.toFixed(1), P.l - 6, y + 4); }
    c.textAlign = 'center'; [0, Math.floor(d2.length / 2), d2.length - 1].forEach((i) => c.fillText(d2[i].slice(0, 4), Math.min(Math.max(X(i), P.l + 14), w - P.r - 14), h - 6));
    // draw-in: lines reveal left to right (900ms)
    const t = reducedMotion() ? 1 : Math.min(1, (performance.now() - t0) / 900), e = 1 - (1 - t) ** 3;
    c.save(); c.beginPath(); c.rect(P.l - 2, 0, (w - P.l - P.r + 4) * e, h); c.clip();
    const pal = palette('--chart'); sm.forEach((s, k) => { c.strokeStyle = pal[k]; c.lineWidth = 2; c.lineJoin = 'round'; c.setLineDash(DASHES[k] || []); c.beginPath(); s.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke(); });
    c.restore();
    if (t < 1) cv._raf = requestAnimationFrame(draw);
  };
  cancelAnimationFrame(cv._raf); draw(); cv._ro?.disconnect(); cv._ro = new ResizeObserver(draw); cv._ro.observe(cv);
}

/* ---------- About (text-first) ---------- */
const ABOUT_SECTIONS = [['overview', 'Overview'], ['datasets', 'Datasets and data pipeline'], ['analysis', 'Analysis'], ['glossary', 'Glossary'], ['limitations', 'Limitations'], ['credits', 'Credits and licenses'], ['ai', 'AI disclosure']];
const h2a = (id) => { const t = ABOUT_SECTIONS.find((s) => s[0] === id)[1]; return `<h2>${esc(t)}<a class="anchor" href="${buildHash('data', { s: id })}" data-s="${id}" aria-label="Link to the ${esc(t)} section">#</a></h2>`; };
function dataPage(params = {}) {
  const n = S.series[S.regions[0].id].variables[S.vars[0].id].length;
  main.innerHTML = `<div class="container page"><div class="about">
    <nav class="toc" aria-label="On this page">
      <p class="toc-title">On this page</p>
      <label class="toc-select"><span class="sr-only">Jump to section</span><select>${ABOUT_SECTIONS.map(([id, t]) => `<option value="${id}">${esc(t)}</option>`).join('')}</select></label>
      <ul class="toc-list">${ABOUT_SECTIONS.map(([id, t]) => `<li><a href="${buildHash('data', { s: id })}" data-s="${id}">${esc(t)}</a></li>`).join('')}<li class="toc-ind" role="presentation" aria-hidden="true"></li></ul>
    </nav>
    <article class="about-body">
    <section id="s-overview">
      <span class="badge neutral">NASA Space Apps Challenge 2026</span>
      <h1>About</h1>
      <p class="lead">Trend Detector was built for the <strong>NASA Space Apps Challenge 2026</strong> — <em>Be an Earth System Trend Detective</em>. It asks one question: are air pollution and rainfall in Pakistan's cities changing, and can we be confident?</p>
      ${callout('<p><strong>Trend does not mean cause.</strong> A rising line shows what happened, not why it happened.</p>', 'lg')}
    </section>

    <section id="s-datasets">${h2a('datasets')}
      <p>NASA datasets (GES DISC), 2005 to 2024, monthly. ${S.regions.length} cities, ${S.vars.length} variables, ${n} monthly observations each; nothing is simulated.</p>
      <div class="table-wrap scroll-fade"><div class="scroll-x" data-scroller><table><thead><tr><th>Variable</th><th>Dataset</th><th>Resolution</th></tr></thead><tbody>${S.vars.map((v) => { const m = S.meta[v.id] || {}; const ds = m.product ? (m.version ? `${m.product} ${m.version}` : m.product) : 'Not specified'; return `<tr><th scope="row">${esc(v.name)}</th><td>${esc(ds)}</td><td class="num">${esc(m.resolution || '—')}</td></tr>`; }).join('')}</tbody></table></div></div>
      <h3>Pipeline</h3>
      <div class="stepper"><span class="stepper-track" aria-hidden="true"></span><span class="stepper-fill" aria-hidden="true"></span><ol>
        <li>Downloaded with the NASA <code>earthaccess</code> Python library in Google Colab.</li>
        <li>Averaged around 8 Pakistani cities (Lahore, Karachi, Islamabad, Peshawar, Faisalabad, Multan, Quetta, Hyderabad).</li>
        <li>Output: one table of 1,920 city-month rows with no missing values.</li>
      </ol></div>
    </section>

    <section id="s-analysis">${h2a('analysis')}
      <p>Pollution Index (0 to 100) from PM2.5, NO2 and AOD, adjusted for rainfall.</p>
      <p>Trend test: Mann-Kendall with Sen's slope and a 95% confidence interval.</p>
    </section>

    <section id="s-glossary">${h2a('glossary')}
      <dl class="glossary">${S.vars.map((v) => { const m = S.meta[v.id]; return m?.description ? `<div><dt>${esc(m.label || v.name)}</dt><dd>${esc(m.description)}</dd></div>` : ''; }).join('')}
        ${S.terms.map((t) => `<div><dt>${esc(t.term)}</dt><dd>${esc(t.plain_meaning)} <small>${esc(t.why_we_use_it || '')}</small></dd></div>`).join('')}</dl>
    </section>

    <section id="s-limitations">${h2a('limitations')}
      <ul>
        <li>PM2.5 is model-derived and NO2 is a satellite column, not a ground reading.</li>
        <li>Coarse grid, so nearby cities look alike.</li>
        <li>Not an official air quality index.</li>
      </ul>
    </section>

    <section id="s-credits">${h2a('credits')}
      <ul class="credits">
        <li><strong>Data.</strong> NASA datasets from GES DISC, listed in the table above.</li>
        <li><strong>Live now-cast.</strong> Open-Meteo (CAMS) air quality and weather.</li>
        <li><strong>Map.</strong> Leaflet (BSD 2-Clause). Map tiles © OpenStreetMap contributors (ODbL).</li>
        <li><strong>Place names.</strong> BigDataCloud reverse geocoding, only if you choose “Use my location”.</li>
        <li><strong>Fonts.</strong> Space Grotesk, Inter and JetBrains Mono, SIL Open Font License 1.1, served by Google Fonts.</li>
        <li><strong>Mascot and icons.</strong> Original SVG artwork drawn for this project; no third-party asset is used.</li>
        <li><strong>Earth background.</strong> Day texture from the MIT-licensed <a href="https://github.com/vasturiano/three-globe">three-globe</a> example assets (<code>earth-day.jpg</code>), derived from NASA Visible Earth / Blue Marble. Credit: NASA. Used under <a href="https://www.nasa.gov/nasa-brand-center/images-and-media/">NASA media guidelines</a> (informational use; no endorsement). Rendered with <a href="https://threejs.org/">three.js</a> (MIT).</li>
        <li><strong>Source code.</strong> <a href="https://github.com/fuzailfaraz/TrendDetector">GitHub</a>.</li>
      </ul>
    </section>

    <section id="s-ai">${h2a('ai')}
      <p>AI tools were used during development: <strong>Claude Code</strong> for coding and implementation, <strong>Antigravity</strong> for UI design, and <strong>Perplexity</strong> for research. All statistics shown (trend, significance, confidence) are computed directly from the dataset by deterministic code, not generated by AI.</p>
    </section>
    </article></div></div>`;
  const go = scrollSpy(main);
  const want = safeId(params.s);
  if (go && want && ABOUT_SECTIONS.some((s) => s[0] === want)) setTimeout(() => go(want, false), 60);
}
const legacyAbout = () => location.replace(buildHash('data'));
const notFound = () => { main.innerHTML = `<div class="container page"><div class="state">${icon('compass')}<h1>Page not found</h1><p>That page does not exist.</p><a class="btn btn-primary" href="#/home">Go home</a></div></div>`; };

/* ---------- assistant panel ---------- */
function assistant() {
  const dr = $('#drawer'), scrim = $('#scrim'), btn = $('#ask-btn'), input = $('#chat-input'), chat = $('#chat'), send = $('#chat-send'), form = $('#chat-form');
  let last, mascot;
  const isOpen = () => dr.classList.contains('open');
  const setOpen = (o, opener) => { dr.classList.toggle('open', o); scrim.classList.toggle('open', o); dr.setAttribute('aria-hidden', String(!o)); btn.setAttribute('aria-expanded', String(o));
    if (o) { last = opener || document.activeElement; input.focus({ preventScroll: true }); } else last?.focus?.({ preventScroll: true });
    mascot?.sync(); };
  mascot = initMascot({ onToggle: () => setOpen(!isOpen(), mascot.el), isOpen, panel: dr });   // the mascot is the chat launcher on every route
  $('#drawer-avatar').innerHTML = mascotSvg(true);
  btn.addEventListener('click', () => setOpen(!isOpen(), btn)); $('#drawer-close').addEventListener('click', () => setOpen(false)); scrim.addEventListener('click', () => setOpen(false));
  dr.addEventListener('keydown', (e) => { if (e.key === 'Escape') return setOpen(false); if (e.key !== 'Tab') return;
    const f = [...dr.querySelectorAll('button,input,textarea')].filter((x) => !x.disabled), a = f[0], z = f.at(-1);
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } });
  const add = (cls, fn) => { const d = document.createElement('div'); d.className = `chat-msg ${cls}`; fn(d); chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d; };   // smooth via CSS scroll-behavior
  const ask = async (text) => {
    text = text.trim(); if (!text) return; input.value = '';
    add('chat-user', (d) => { d.textContent = text; });
    const typing = add('chat-bot chat-typing', (d) => { d.innerHTML = '<i></i><i></i><i></i><span class="sr-only">Checking the observation record…</span>'; }); send.disabled = true;
    let rep = null; try { rep = await api.chatAssistant(text); } catch (e) { console.error(e); }
    typing.remove(); send.disabled = false;
    if (!rep?.reply) return add('chat-bot', (d) => { d.textContent = 'The assistant is unavailable right now. '; const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = 'Retry'; b.onclick = () => { d.remove(); ask(text); }; d.appendChild(b); });
    add('chat-bot md', (d) => { d.innerHTML = safeMarkdown(rep.reply); const v = safeId(rep.analysis_ref?.variable), r = safeId(rep.analysis_ref?.region);
      if (v && r) { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.textContent = 'Load in chart'; b.onclick = () => { location.hash = exploreHref(v, r); setOpen(false); }; d.appendChild(b); } });
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  // Enter sends, Shift+Enter makes a newline
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!send.disabled) ask(input.value); } });
  dr.querySelectorAll('[data-prompt]').forEach((c) => c.addEventListener('click', () => ask(c.dataset.prompt)));
}

/* ---------- boot ---------- */
async function boot() {
  initUI(main);
  assistant();
  // Footer: persist Earth animation preference (presentation only)
  const et = $('#earth-toggle');
  if (et) {
    et.checked = isEarthAnimEnabled();
    et.addEventListener('change', () => setEarthAnimEnabled(et.checked));
  }
  try {
    S.series = await api.getSeriesData();
    const [v, r, m, h, t, meta] = await Promise.all([api.getVariables(), api.getRegions(), api.getMissions(), fetch('./catalogs/hotspots.json').then((x) => x.json()).catch(() => []), api.getLearningTerms(), api.getMetadata()]);
    Object.assign(S, { vars: v.variables, regions: r.regions, missions: m.missions || m, hotspots: h, terms: t.learning_terms?.terms || [], meta: meta || {} });
    try { S.plain = localStorage.getItem('td:plain') === '1'; } catch { /* private mode */ }
  } catch (e) { console.error(e); return stateBox('The data could not be loaded.', true); }
  // Plain-language switch: swaps statistical terms for everyday wording wherever term() is used.
  const pt = $('#plain-toggle'); pt.checked = S.plain;
  pt.addEventListener('change', () => { S.plain = pt.checked; try { localStorage.setItem('td:plain', S.plain ? '1' : '0'); } catch { /* ignore */ } window.dispatchEvent(new HashChangeEvent('hashchange')); });
  // Each page renders inside a short fade/slide transition; the router itself is unchanged.
  const view = (fn) => (params) => viewTransition(main, () => fn(params));
  startRouter({ home: view(home), trends: view(trends), explore: legacyExplore, discover: legacyDiscover, pollution: view(pollution), compare: view(compare), data: view(dataPage), about: legacyAbout }, view(notFound));
}
boot();
