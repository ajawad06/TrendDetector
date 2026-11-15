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
const badge = (a) => { const d = DIR[dirKey(a)]; return `<span class="badge ${d.cls}"><span aria-hidden="true">${d.icon}</span> ${d.text}</span>`; };
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
  return `<div class="row cols-2">
    <label class="field">Variable<select id="sel-var">${S.vars.map((v) => `<option value="${esc(v.id)}" ${v.id === varId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <label class="field">City<select id="sel-city">${S.regions.map((r) => `<option value="${esc(r.id)}" ${r.id === cityId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>`;
}
function stateBox(msg, retry) {
  main.innerHTML = `<div class="wrap state"><h1>${esc(msg)}</h1><p class="muted">Check your connection and try again.</p>${retry ? '<button class="btn btn-primary" id="retry">Retry</button>' : '<a class="btn btn-primary" href="#/home">Go home</a>'}</div>`;
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

/* ---------- pages ---------- */
function home() {
  const feat = S.missions.slice(0, 3);
  main.innerHTML = `<div class="wrap"><section class="hero">
      <h1>Is Pakistan’s air getting better or worse?</h1>
      <p>Twenty years of monthly pollution and rainfall records for eight cities, tested for real trends.</p>
      <a class="btn btn-primary" href="${buildHash('explore', loadSelection())}">Start investigating</a></section>
    <h2>Featured missions</h2>
    <div class="grid cols-3">${feat.map((m) => `<a class="card card-link" href="${buildHash('explore', { var: m.variable, city: m.region })}"><h3>${esc(m.title)}</h3><p class="muted">${esc(m.question)}</p><small>${esc(m.result_summary)}</small></a>`).join('')}</div>
    <div id="pi-snap" class="stack"></div></div>`;
  fetch('./data/pollution_index.json').then((r) => r.json()).then((j) => {
    const t = j.ranking_latest[0];
    $('#pi-snap').innerHTML = `<h2>Pollution right now</h2><a class="card card-link" href="#/pollution"><h3>${esc(t.city)}: ${esc(t.category)}</h3><p class="muted">Highest Pollution Index in the latest month (${esc(t.pi)} on a 0 to 100 scale).</p><small>See the full ranking</small></a>`;
  }).catch((e) => console.info('PI snapshot unavailable', e));
}

async function explore(params) {
  const sel = { var: safeId(params.var), city: safeId(params.city) };
  if (!sel.var || !sel.city) Object.assign(sel, loadSelection());
  let anom = params.mode !== 'raw';
  main.innerHTML = `<div class="wrap explore">
    <div class="x-sel stack"><h1>Explore</h1>${selectors(sel.var, sel.city)}
      <label class="check"><input type="checkbox" id="anom" ${anom ? 'checked' : ''}> Remove seasonal cycle</label></div>
    <section class="x-main stack" aria-live="polite"><div class="card" id="result"></div>
      <div class="card"><div class="head" id="chart-head"></div><div class="chart-box"><canvas id="cv" role="img" aria-label="Monthly time series with trend line"></canvas></div>
        <div class="legend"><span class="l-obs"><i></i>Observed</span><span class="l-fit"><i></i>Trend line</span><span class="l-base"><i class="dash"></i>Baseline</span></div>
        <p id="chart-text" class="muted"></p><details><summary>Show data table (yearly averages)</summary><div class="scroll-x" id="year-table"></div></details></div></section>
    <div class="x-map stack"><div class="map-frame" id="map" role="group" aria-label="City map"></div>
      <div class="chips" id="city-list" role="group" aria-label="Cities"></div></div></div>`;
  const chart = new TrendChart($('#cv'));
  let cur;
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
    $('#result').innerHTML = `${badge(a)} <small>${esc(TIER[a.verdict.tier])}</small><h2>${esc(headline(cur))}</h2>
      <div class="stats"><div class="stat"><b>${esc(num(ols.slope_per_year, sc))}</b><span>${esc(du)} per year</span></div>
        <div class="stat"><b>${esc(num(ols.total_change, sc))}</b><span>${esc(du)} since 2005</span></div>
        <div class="stat"><b>${esc(conf.overall)}</b><span>data confidence</span></div></div>
      <p class="note">A trend shows what changed, not why. Nearby cities may share data.</p>
      <details><summary>Show the numbers</summary><div class="scroll-x"><table><tbody>${rows.map((x) => `<tr><th scope="row">${x[0]}</th><td>${esc(x[1])}</td></tr>`).join('')}</tbody></table></div>
        <p class="muted">${esc(v.why_it_matters || '')}</p></details>`;
    $('#chart-head').innerHTML = `<div><h3>${esc(v.name)}, ${esc(r.name)}</h3><small>240 months, ${esc(a.period.start.slice(0, 7))} to ${esc(a.period.end.slice(0, 7))}</small></div>
      <details class="menu"><summary>Export</summary><div class="pop"><button data-x="csv">Download CSV</button><button data-x="png">Download PNG</button><button data-x="md">Download summary</button></div></details>`;
    $('#chart-text').textContent = `${headline(cur)} Change is about ${num(ols.slope_per_year, sc)} ${du} per year, ${num(ols.total_change, sc)} ${du} overall.`;
    const yr = {}; points.forEach((p) => { (yr[p.date.slice(0, 4)] ||= []).push(p.value); });
    $('#year-table').innerHTML = `<table><thead><tr><th>Year</th><th>Mean (${esc(du)})</th></tr></thead><tbody>${Object.entries(yr).map(([y, a2]) => `<tr><td>${y}</td><td>${num(a2.reduce((s, x) => s + x, 0) / a2.length, sc).replace('+', '')}</td></tr>`).join('')}</tbody></table>`;
    $('#city-list').innerHTML = S.regions.map((rg) => { const t = S.trends?.[rg.id]; const d = DIR[t || 'flat'];
      return `<button class="chip" data-city="${esc(rg.id)}" aria-pressed="${rg.id === sel.city}">${esc(rg.name)} <span aria-hidden="true">${d.icon}</span><span class="hide">${d.text}</span></button>`; }).join('');
    $('#chart-head [data-x]')?.closest('.pop').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => exportAs(b.dataset.x, cur, anom)));
    saveSelection(sel); history.replaceState(null, '', buildHash('explore', { var: sel.var, city: sel.city, mode: anom ? '' : 'raw' }));
    map?.setActiveCity(sel.city);
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
  loadLeaflet().then(() => { if (!$('#map')) return; map = new RegionMap('map', (id) => { sel.city = id; $('#sel-city').value = id; draw(); }); map.init(S.regions); refreshTrends(); map.setActiveCity(sel.city); })
    .catch(() => { $('#map')?.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Map unavailable. Use the city list.' })); });
}
function exportAs(kind, cur, anom) {
  const { v, r, analysis: a, points } = cur, sc = v.display_scale || 1, du = v.display_unit || v.unit, id = `${v.id}_${r.id}`;
  if (kind === 'csv') download(`trend_${id}.csv`, new Blob([['date,value,seasonal_anomaly', ...points.map((p) => `${p.date},${p.value},${p.anomaly}`)].join('\n')], { type: 'text/csv' }));
  else if (kind === 'png') $('#cv').toBlob((b) => b && download(`trend_${id}.png`, b));
  else download(`trend_${id}.md`, new Blob([`# ${headline(cur)}\n\n- Variable: ${v.name} (${du})\n- City: ${r.name}\n- Verdict: ${TIER[a.verdict.tier]}\n- Change per year: ${num(a.ols.slope_per_year, sc)} ${du}\n- Since 2005: ${num(a.ols.total_change, sc)} ${du}\n- Series: ${anom ? 'seasonal anomalies' : 'raw values'}, 240 months\n\nA trend shows what changed, not why.\n`], { type: 'text/markdown' }));
}

async function discover(params) {
  const tab = ['missions', 'contrasts', 'ranked'].includes(params.tab) ? params.tab : 'missions';
  const pairs = [['rain_mm', 'peshawar', 'karachi', 'Rainfall: northwest valley vs southern coast'], ['no2', 'peshawar', 'multan', 'NO₂: Peshawar vs Multan'], ['pm25', 'lahore', 'faisalabad', 'PM2.5: Lahore vs Faisalabad']];
  const body = {
    missions: () => `<div class="grid cols-2">${S.missions.map((m) => `<a class="card card-link" href="${buildHash('explore', { var: m.variable, city: m.region })}"><h3>${esc(m.title)}</h3><p class="muted">${esc(m.question)}</p><small>${esc(m.result_summary)}</small></a>`).join('')}</div>`,
    contrasts: () => `<div class="grid cols-2">${pairs.map(([vr, a, b, t]) => { const x = analyze(vr, a), y = analyze(vr, b), v = x.v, sc = v.display_scale || 1;
      return `<div class="card"><h3>${esc(t)}</h3>${[x, y].map((z) => `<p>${esc(z.r.name)} ${badge(z.analysis)} <small>${esc(num(z.analysis.ols.slope_per_year, sc))} ${esc(v.display_unit || v.unit)}/yr</small></p>`).join('')}
        ${nearby([a, b]).map((n) => `<p class="note">${esc(n)}</p>`).join('')}<a href="${buildHash('compare', { var: vr, cities: `${a},${b}` })}">Compare these cities</a></div>`; }).join('')}</div>`,
    ranked: () => `<div class="grid">${S.hotspots.map((h) => `<a class="card card-link" href="${buildHash('explore', { var: h.variable, city: h.region })}"><h3>${esc(h.rank)}. ${esc(h.title)}</h3><p><span class="badge ${(DIR[h.direction] || DIR.flat).cls}"><span aria-hidden="true">${(DIR[h.direction] || DIR.flat).icon}</span> ${(DIR[h.direction] || DIR.flat).text}</span> <small>${esc(h.rate)}</small></p><p class="muted">${esc(h.significance)}. ${esc(h.why_it_matters)}</p></a>`).join('')}</div>`,
  };
  main.innerHTML = `<div class="wrap stack"><h1>Discover</h1><div class="tabs" role="tablist">${[['missions', 'Missions'], ['contrasts', 'Contrasts'], ['ranked', 'Ranked']].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div><div role="tabpanel">${body[tab]()}</div></div>`;
  main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = buildHash('discover', { tab: b.dataset.tab }); }));
}

function pollution() {
  main.innerHTML = `<div class="wrap stack"><h1>Pollution index</h1><div id="pi-root"></div><h2>Smaller patterns</h2><div id="pt-root"></div></div>`;
  initPollutionIndex($('#pi-root')); initPatterns($('#pt-root'));
}

function compare(params) {
  const sel = loadSelection();
  let vid = safeId(params.var, sel.var);
  let ids = (params.cities || '').split(',').map((x) => safeId(x)).filter((x) => S.regions.some((r) => r.id === x)).slice(0, 4);
  if (ids.length < 2) ids = [...new Set([sel.city, 'karachi', 'lahore'])].slice(0, 2);
  main.innerHTML = `<div class="wrap stack"><h1>Compare cities</h1><label class="field">Variable<select id="sel-var">${S.vars.map((v) => `<option value="${esc(v.id)}" ${v.id === vid ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <div class="chips" id="pick" role="group" aria-label="Choose 2 to 4 cities"></div><div class="card"><div class="chart-box"><canvas id="cv2" role="img" aria-label="Overlaid 12-month averages"></canvas></div><div class="legend" id="lg"></div><p class="muted" id="ctext"></p></div>
    <div class="scroll-x card" id="ctable"></div><div id="cnote" class="stack"></div></div>`;
  const render = () => {
    const v = vOf(vid), sc = v.display_scale || 1, du = v.display_unit || v.unit;
    $('#pick').innerHTML = S.regions.map((r) => `<button class="chip" data-id="${esc(r.id)}" aria-pressed="${ids.includes(r.id)}">${esc(r.name)}</button>`).join('');
    const res = ids.map((id) => analyze(vid, id));
    $('#lg').innerHTML = res.map((x, i) => `<span><i class="line-${i + 1}"></i>${esc(x.r.name)}</span>`).join('');
    drawLines($('#cv2'), res.map((x) => x.points.map((p) => p.value / sc)), res[0].points.map((p) => p.date), du);
    $('#ctext').textContent = `12-month averages of ${v.name} (${du}) for ${res.map((x) => x.r.name).join(', ')}.`;
    $('#ctable').innerHTML = `<table><thead><tr><th>City</th><th>Direction</th><th>Change per year (${esc(du)})</th><th>Confidence</th></tr></thead><tbody>${res.map((x) => `<tr><th scope="row">${esc(x.r.name)}</th><td>${badge(x.analysis)}</td><td>${esc(num(x.analysis.ols.slope_per_year, sc))}</td><td>${esc(TIER[x.analysis.verdict.tier])}</td></tr>`).join('')}</tbody></table>`;
    $('#cnote').innerHTML = nearby(ids).map((n) => `<p class="note">${esc(n)}</p>`).join('');
    saveSelection({ var: vid, city: ids[0] }); history.replaceState(null, '', buildHash('compare', { var: vid, cities: ids.join(',') }));
  };
  $('#sel-var').addEventListener('change', (e) => { vid = e.target.value; render(); });
  $('#pick').addEventListener('click', (e) => { const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
    if (ids.includes(id)) { if (ids.length > 2) ids = ids.filter((x) => x !== id); } else if (ids.length < 4) ids.push(id); render(); });
  render();
}
function drawLines(cv, seriesList, dates, unit) {
  const draw = () => {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    cv.width = w * dpr; cv.height = h * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const sm = seriesList.map((s) => s.map((_, i) => { const a = s.slice(Math.max(0, i - 11), i + 1); return a.reduce((x, y) => x + y, 0) / a.length; }).slice(11));
    const d2 = dates.slice(11), all = sm.flat(), lo = Math.min(...all), hi = Math.max(...all), P = { l: 44, r: 8, t: 8, b: 22 };
    const X = (i) => P.l + (i / (d2.length - 1)) * (w - P.l - P.r), Y = (v) => P.t + (1 - (v - lo) / ((hi - lo) || 1)) * (h - P.t - P.b);
    c.strokeStyle = tok('--grid'); c.fillStyle = tok('--text-muted'); c.font = '11px sans-serif'; c.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4, y = Y(v); c.beginPath(); c.moveTo(P.l, y); c.lineTo(w - P.r, y); c.stroke(); c.textAlign = 'right'; c.fillText(Math.abs(v) >= 1000 ? v.toExponential(1) : v.toFixed(1), P.l - 4, y + 4); }
    c.textAlign = 'center'; [0, Math.floor(d2.length / 2), d2.length - 1].forEach((i) => c.fillText(d2[i].slice(0, 4), X(i), h - 6));
    const pal = palette('--line'); sm.forEach((s, k) => { c.strokeStyle = pal[k]; c.lineWidth = 2; c.beginPath(); s.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke(); });
  };
  draw(); cv._ro?.disconnect(); cv._ro = new ResizeObserver(draw); cv._ro.observe(cv);
}

function dataPage() {
  const n = S.series[S.regions[0].id].variables[S.vars[0].id].length;
  main.innerHTML = `<div class="wrap stack"><h1>Data and method</h1>
    <p>${S.regions.length} cities, ${S.vars.length} variables, ${n} monthly observations each (2005 to 2024). Values come from <code>pk_city_monthly_final.csv</code>; nothing is simulated.</p>
    <h2>Variables</h2><div class="scroll-x"><table><thead><tr><th>Variable</th><th>Unit</th><th>Source</th></tr></thead><tbody>${S.vars.map((v) => { const m = S.meta[v.id] || {}; return `<tr><th scope="row">${esc(v.name)}</th><td>${esc(v.display_unit || v.unit)}</td><td>${esc(m.product && m.provider ? `${m.product} via ${m.provider}` : 'Not specified')}</td></tr>`; }).join('')}</tbody></table></div>
    <h2>How trends are judged</h2><p>Each series has its seasonal cycle removed (anomalies). A straight line is fitted, then checked with a rank-based test, with a correction for how similar one month is to the next. Many series are tested at once, so results are adjusted for false discoveries. Confidence rates record length, missing data and month-to-month similarity.</p>
    <h2>Glossary</h2><dl class="facts">${S.terms.map((t) => `<dt>${esc(t.term)}</dt><dd>${esc(t.plain_meaning)} <small>${esc(t.why_we_use_it || '')}</small></dd>`).join('')}</dl>
    <h2>Limitations</h2><p>One point per city, monthly resolution, 20 years. Nearby cities can share underlying data. A trend describes association over time and does not show cause.</p></div>`;
}
function about() {
  main.innerHTML = `<div class="wrap stack"><h1>About</h1><p>Trend Detector was built for the NASA Space Apps Challenge 2026. It asks one question: are air pollution and rainfall in Pakistan’s cities changing, and can we be confident?</p>
    <p class="note"><strong>Trend does not mean cause.</strong> A rising line shows what happened, not why it happened.</p>
    <p>Data: monthly city observations, 2005 to 2024 (see <a href="#/data">Data and method</a>). Source code: <a href="https://github.com/fuzailfaraz/TrendDetector">GitHub</a>.</p></div>`;
}
const notFound = () => { main.innerHTML = `<div class="wrap state"><h1>Page not found</h1><p class="muted">That page does not exist.</p><a class="btn btn-primary" href="#/home">Go home</a></div>`; };

/* ---------- assistant slide-over ---------- */
function assistant() {
  const dr = $('#drawer'), scrim = $('#scrim'), btn = $('#ask-btn'), input = $('#chat-input'), chat = $('#chat'), send = $('#chat-send');
  let last;
  const setOpen = (o) => { dr.classList.toggle('open', o); scrim.classList.toggle('open', o); dr.setAttribute('aria-hidden', String(!o)); btn.setAttribute('aria-expanded', String(o));
    if (o) { last = document.activeElement; input.focus(); } else last?.focus?.(); };
  btn.addEventListener('click', () => setOpen(!dr.classList.contains('open'))); $('#drawer-close').addEventListener('click', () => setOpen(false)); scrim.addEventListener('click', () => setOpen(false));
  dr.addEventListener('keydown', (e) => { if (e.key === 'Escape') return setOpen(false); if (e.key !== 'Tab') return;
    const f = [...dr.querySelectorAll('button,input')].filter((x) => !x.disabled), a = f[0], z = f.at(-1);
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } });
  const add = (cls, fn) => { const d = document.createElement('div'); d.className = `chat-msg ${cls}`; fn(d); chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d; };
  const ask = async (text) => {
    text = text.trim(); if (!text) return; input.value = '';
    add('chat-user', (d) => { d.textContent = text; });
    const typing = add('chat-bot chat-typing', (d) => { d.textContent = 'Checking the observation record…'; }); send.disabled = true;
    let rep = null; try { rep = await api.chatAssistant(text); } catch (e) { console.error(e); }
    typing.remove(); send.disabled = false;
    if (!rep?.reply) return add('chat-bot', (d) => { d.textContent = 'The assistant is unavailable right now. '; const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Retry'; b.onclick = () => { d.remove(); ask(text); }; d.appendChild(b); });
    add('chat-bot', (d) => { d.innerHTML = safeMarkdown(rep.reply); const v = safeId(rep.analysis_ref?.variable), r = safeId(rep.analysis_ref?.region);
      if (v && r) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Load in chart'; b.onclick = () => { location.hash = buildHash('explore', { var: v, city: r }); setOpen(false); }; d.appendChild(document.createElement('br')); d.appendChild(b); } });
  };
  $('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  dr.querySelectorAll('[data-prompt]').forEach((c) => c.addEventListener('click', () => ask(c.dataset.prompt)));
}

/* ---------- boot ---------- */
async function boot() {
  try {
    S.plain = localStorage.getItem('td:plain') === '1';
  } catch { /* private mode */ }
  const pt = $('#plain-toggle'); pt.checked = S.plain;
  pt.addEventListener('change', () => { S.plain = pt.checked; try { localStorage.setItem('td:plain', S.plain ? '1' : '0'); } catch { /* ignore */ } window.dispatchEvent(new HashChangeEvent('hashchange')); });
  assistant();
  try {
    S.series = await api.getSeriesData();
    const [v, r, m, h, t, meta] = await Promise.all([api.getVariables(), api.getRegions(), api.getMissions(), fetch('./catalogs/hotspots.json').then((x) => x.json()).catch(() => []), api.getLearningTerms(), api.getMetadata()]);
    Object.assign(S, { vars: v.variables, regions: r.regions, missions: m.missions || m, hotspots: h, terms: t.terms || [], meta: meta || {} });
  } catch (e) { console.error(e); return stateBox('The data could not be loaded.', true); }
  startRouter({ home, explore, discover, pollution, compare, data: dataPage, about }, notFound);
}
boot();
