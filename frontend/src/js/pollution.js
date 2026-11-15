import { tok, palette } from './theme.js';
import { esc as _esc } from './util.js';
/**
 * Pollution Index section: ranking, peak/dip trend chart, seasonal heatmap.
 * Data: pollution_index.json, built from the real CSV by
 * scripts/build_pollution_index.py. Nothing is computed from mock values.
 */
const CAT_COLORS = palette('--cat');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LINE_COLORS = palette('--line');
const PATHS = ['./data/pollution_index.json'];

const catIdx = (v, cats) => Math.max(0, cats.findIndex(c => v <= c.max));
const fmtDate = d => `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DRIVER = { pm25: 'PM2.5', no2: 'NO₂', aod: 'AOD' };

export async function initPollutionIndex(root) {
  let data = null;
  for (const p of PATHS) {
    try { const r = await fetch(p); if (r.ok) { data = await r.json(); break; } } catch (e) { /* next */ }
  }
  if (!data) {
    console.info('Pollution index data missing. Rebuild with: python scripts/build_pollution_index.py');
    root.innerHTML = '<div class="state"><p>The pollution index could not be loaded.</p><button class="btn" data-retry>Retry</button></div>';
    root.querySelector('[data-retry]').addEventListener('click', () => initPollutionIndex(root));
    return;
  }
  new PollutionIndexView(root, data).render();
}

class PollutionIndexView {
  constructor(root, data) {
    this.root = root; this.data = data; this.cats = data.meta.categories;
    this.names = Object.keys(data.cities);
    this.focus = data.ranking_latest[0].city;       // most polluted city right now
    this.compare = new Set([this.focus]);
    this.hover = -1;
  }

  color(v) { return CAT_COLORS[catIdx(v, this.cats)]; }
  catName(v) { return this.cats[catIdx(v, this.cats)].name; }

  render() {
    const m = this.data.meta;
    this.root.innerHTML = `
      <div class="section-header section-header-green">
        <span class="section-label">Primary Indicator</span>
        <h3 class="section-title">Pakistan Pollution Index (PI)</h3>
        <p class="section-desc">One 0–100 score per city and month, combining PM2.5, NO₂ and aerosol load, softened by rainfall wash-out. Observations ${fmtDate(m.period[0])} – ${fmtDate(m.period[1])}.</p>
      </div>
      <div class="pi-card"><div class="pi-head"><h4>Live now-cast</h4><small id="pi-live-meta" class="pi-note"></small></div><div id="pi-live" class="pi-live"><small class="pi-note">Loading live data…</small></div></div>
      <div class="pi-grid">
        <div class="pi-card"><h4>Ranking · ${fmtDate(m.period[1])}</h4><div id="pi-rank"></div>
          <div class="pi-legend">${this.cats.map((c, i) => `<span><i style="background:${CAT_COLORS[i]}"></i>${esc(c.name)}</span>`).join('')}</div></div>
        <div class="pi-card pi-wide">
          <div class="pi-head"><h4>Trend, peaks &amp; dips</h4>
            <label>Focus city <select id="pi-focus" class="form-select">${this.names.map(n => `<option ${n === this.focus ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
          <div class="pi-chips" id="pi-chips"></div>
          <div class="pi-canvas-wrap"><canvas id="pi-canvas"></canvas><div id="pi-tip" class="pi-tip"></div></div>
          <div class="pi-note">▲ peak and ▼ dip mark months where PI departs from that city’s normal seasonal level by more than ${m.event_threshold_sigma}σ. Chart markers follow the focus city.</div>
          <div id="pi-stats"></div>
        </div>
      </div>
      <div class="pi-grid pi-grid-2">
        <div class="pi-card"><h4>Biggest peaks · <span id="pi-f1"></span></h4><div id="pi-peaks" class="pi-events"></div></div>
        <div class="pi-card"><h4>Deepest dips · <span id="pi-f2"></span></h4><div id="pi-dips" class="pi-events"></div></div>
      </div>
      <div class="pi-card"><h4>Seasonal pattern · average PI by calendar month</h4><div id="pi-heat" class="pi-heat"></div></div>
      <div class="pi-method"><b>How PI is built.</b> Each variable is scaled 0–100 with fixed bounds (PM2.5 ${m.bounds.pm25.join('–')} µg/m³, NO₂ 0–1.5×10¹⁶ molecules/cm², AOD 0–2). Air = ${m.weights.pm25}·PM2.5 + ${m.weights.no2}·NO₂ + ${m.weights.aod}·AOD; PI = Air × (1 − ${m.rain_max_discount}·min(rain/${m.rain_cap_mm} mm, 1)).
        Tree loss and CO₂ from the original spec were removed because the dataset has no such columns; weights were renormalised, nothing was estimated.
        City rankings stay stable across alternative weight sets (Spearman ρ ${Math.min(...m.weight_set_rank_correlation)}–1.0). ${esc(m.disclaimer)}</div>`;

    this.renderRanking(); this.renderChips(); this.renderHeat();
    this.canvas = this.root.querySelector('#pi-canvas');
    this.root.querySelector('#pi-focus').addEventListener('change', e => { this.focus = e.target.value; this.compare.add(this.focus); this.refresh(); });
    this.canvas.addEventListener('mousemove', e => this.onMove(e));
    this.canvas.addEventListener('mouseleave', () => { this.hover = -1; this.root.querySelector('#pi-tip').style.display = 'none'; this.draw(); });
    window.addEventListener('resize', () => this.draw());
    this.refresh();
    this.loadLive();
    setInterval(() => this.loadLive(), 30 * 60 * 1000);
  }

  async loadLive() {
    const box = this.root.querySelector('#pi-live'), meta = this.root.querySelector('#pi-live-meta');
    try {
      const r = await fetch('/api/live-pi');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      const rows = Object.entries(j.cities).sort((a, b) => b[1].pi - a[1].pi);
      box.innerHTML = rows.map(([n, c]) => this.liveCard(n, c)).join('');
      meta.textContent = `Updated ${new Date(j.updated).toLocaleTimeString()} · ${j.source}`;
      box.title = j.note;
    } catch (e) {
      box.innerHTML = `<small class="pi-note">Live data unavailable (${esc(e.message)}). Historical index below is unaffected. Requires the Node server and internet access.</small>`;
    }
  }

  liveCard(name, c) {
    const pts = c.hourly, w = 120, h = 34, n = pts.length, max = Math.max(...pts.map(p => p.pi), 10);
    const xy = (p, i) => `${(i / (n - 1) * w).toFixed(1)},${(h - 2 - p.pi / max * (h - 4)).toFixed(1)}`;
    const split = pts.findIndex(p => p.forecast);
    const past = pts.slice(0, split < 0 ? n : split + 1).map((p, i) => xy(p, i)).join(' ');
    const fut = split < 0 ? '' : pts.slice(split).map((p, i) => xy(p, i + split)).join(' ');
    return `<div class="pi-live-card"><span>${name}</span><b style="color:${this.color(c.pi)}">${c.pi.toFixed(1)}</b><small>${esc(c.category)}</small>
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${past}" fill="none" stroke="${tok('--line-1')}" stroke-width="1.4"/>${fut ? `<polyline points="${fut}" fill="none" stroke="${tok('--series-trend')}" stroke-width="1.4" stroke-dasharray="3 2"/>` : ''}</svg>
      <small>PM2.5 ${c.pm25 ?? '–'} µg/m³ · ${DRIVER[c.driver]} is main driver</small></div>`;
  }

  refresh() {
    this.root.querySelector('#pi-focus').value = this.focus;
    this.renderChips(); this.renderStats(); this.renderEvents(); this.draw();
  }

  renderRanking() {
    const rows = this.data.ranking_latest;
    this.root.querySelector('#pi-rank').innerHTML = rows.map(r => `
      <button class="pi-rank-row" data-city="${r.city}">
        <span class="pi-rank-name">${r.city}</span>
        <span class="pi-bar"><span style="width:${r.pi}%;background:${this.color(r.pi)}"></span></span>
        <span class="pi-rank-val">${r.pi.toFixed(1)}</span>
      </button>`).join('');
    this.root.querySelectorAll('.pi-rank-row').forEach(b => b.addEventListener('click', () => { this.focus = b.dataset.city; this.compare.add(this.focus); this.refresh(); }));
  }

  renderChips() {
    const box = this.root.querySelector('#pi-chips');
    box.innerHTML = this.names.map((n, i) => `<button class="pi-chip ${this.compare.has(n) ? 'on' : ''}" data-city="${n}" style="--c:${LINE_COLORS[i]}">${n}</button>`).join('');
    box.querySelectorAll('.pi-chip').forEach(b => b.addEventListener('click', () => {
      const n = b.dataset.city;
      if (this.compare.has(n) && n !== this.focus) this.compare.delete(n); else this.compare.add(n);
      this.refresh();
    }));
  }

  renderStats() {
    const c = this.data.cities[this.focus], t = c.trend;
    const verdict = t.significant ? `a statistically significant ${t.direction} trend (Mann–Kendall p = ${t.p})` : `no statistically significant long-term trend (p = ${t.p})`;
    this.root.querySelector('#pi-stats').innerHTML = `
      <div class="pi-statrow">
        <div><span>Latest</span><b style="color:${this.color(c.latest)}">${c.latest.toFixed(1)}</b><small>${this.catName(c.latest)}</small></div>
        <div><span>20-yr mean</span><b>${c.mean}</b><small>max ${c.max}</small></div>
        <div><span>Worst season</span><b>${MONTHS[c.peak_month - 1]}</b><small>best: ${MONTHS[c.dip_month - 1]}</small></div>
        <div><span>Annual trend</span><b>${t.slope_per_year > 0 ? '+' : ''}${t.slope_per_year}</b><small>PI points / year</small></div>
      </div>
      <p class="pi-note">${this.focus} shows ${verdict}. Annual-mean PI, Theil–Sen slope.</p>`;
  }

  renderEvents() {
    const c = this.data.cities[this.focus];
    this.root.querySelector('#pi-f1').textContent = this.root.querySelector('#pi-f2').textContent = this.focus;
    const row = (e, up) => `<div class="pi-event"><b class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${fmtDate(e.month)}</b>
      <span>PI ${e.pi} (${e.anomaly > 0 ? '+' : ''}${e.anomaly} vs. normal)</span>
      <small>${e.months > 1 ? `${e.months}-month episode ${fmtDate(e.start)} – ${fmtDate(e.end)} · ` : ''}driven by ${DRIVER[e.driver]}</small></div>`;
    this.root.querySelector('#pi-peaks').innerHTML = c.peaks.slice(0, 5).map(e => row(e, true)).join('') || '<small>None above threshold.</small>';
    this.root.querySelector('#pi-dips').innerHTML = c.dips.slice(0, 5).map(e => row(e, false)).join('') || '<small>None below threshold.</small>';
  }

  renderHeat() {
    const names = this.data.ranking_latest.map(r => r.city);
    this.root.querySelector('#pi-heat').innerHTML = `<div class="pi-heat-grid"><span></span>${MONTHS.map(m => `<span class="pi-hm">${m}</span>`).join('')}
      ${names.map(n => `<span class="pi-hn">${n}</span>` + this.data.cities[n].seasonal.map((v, i) =>
        `<span class="pi-hc" title="${n}, ${MONTHS[i]}: ${v} (${this.catName(v)})" style="background:${this.color(v)};opacity:${0.35 + 0.65 * Math.min(v / 60, 1)}">${Math.round(v)}</span>`).join('')).join('')}</div>`;
  }

  geometry() {
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(rect.width) || 600, h = Math.floor(rect.height) || 340;
    if (this.canvas.width !== w * dpr) { this.canvas.width = w * dpr; this.canvas.height = h * dpr; }
    const pad = { l: 38, r: 12, t: 10, b: 24 };
    const n = this.data.cities[this.focus].pi.length;
    const ymax = Math.min(100, Math.ceil((Math.max(...[...this.compare].map(c => this.data.cities[c].max)) + 6) / 10) * 10);
    return { w, h, dpr, pad, n, ymax, X: i => pad.l + (i / (n - 1)) * (w - pad.l - pad.r), Y: v => h - pad.b - (v / ymax) * (h - pad.t - pad.b) };
  }

  draw() {
    if (!this.canvas) return;
    const g = this.geometry(), ctx = this.canvas.getContext('2d');
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); ctx.clearRect(0, 0, g.w, g.h);
    let lo = 0;                                         // category bands
    this.cats.forEach((c, i) => {
      if (lo >= g.ymax) return;
      const hi = Math.min(c.max, g.ymax);
      ctx.fillStyle = CAT_COLORS[i] + '22'; ctx.fillRect(g.pad.l, g.Y(hi), g.w - g.pad.l - g.pad.r, g.Y(lo) - g.Y(hi)); lo = c.max;
    });
    ctx.font = '11px sans-serif'; ctx.fillStyle = tok('--text-muted'); ctx.textAlign = 'right';
    for (let v = 0; v <= g.ymax; v += 20) ctx.fillText(v, g.pad.l - 6, g.Y(v) + 4);
    ctx.textAlign = 'center';
    const dates = this.data.cities[this.focus].dates;
    for (let i = 0; i < g.n; i++) if (dates[i].slice(5, 7) === '01' && +dates[i].slice(0, 4) % 4 === 1) ctx.fillText(dates[i].slice(0, 4), g.X(i), g.h - 7);

    [...this.compare].forEach(name => {
      const isFocus = name === this.focus, s = this.data.cities[name].pi;
      ctx.beginPath(); ctx.lineWidth = isFocus ? 1.8 : 1.1; ctx.globalAlpha = isFocus ? 1 : 0.65;
      ctx.strokeStyle = LINE_COLORS[this.names.indexOf(name)];
      s.forEach((v, i) => i ? ctx.lineTo(g.X(i), g.Y(v)) : ctx.moveTo(g.X(i), g.Y(v))); ctx.stroke(); ctx.globalAlpha = 1;
    });
    const f = this.data.cities[this.focus];             // peak / dip markers
    const mark = (list, up) => list.forEach(e => {
      const i = dates.indexOf(e.month), x = g.X(i), y = g.Y(f.pi[i]), d = up ? -9 : 9;
      ctx.fillStyle = up ? tok('--up') : tok('--down'); ctx.beginPath();
      ctx.moveTo(x, y + d); ctx.lineTo(x - 4.5, y + d + (up ? -7 : 7)); ctx.lineTo(x + 4.5, y + d + (up ? -7 : 7)); ctx.fill();
    });
    mark(f.peaks, true); mark(f.dips, false);
    if (this.hover >= 0) {
      ctx.strokeStyle = tok('--text'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.X(this.hover), g.pad.t); ctx.lineTo(g.X(this.hover), g.h - g.pad.b); ctx.stroke();
    }
  }

  onMove(e) {
    const g = this.geometry(), rect = this.canvas.getBoundingClientRect();
    const i = Math.max(0, Math.min(g.n - 1, Math.round(((e.clientX - rect.left - g.pad.l) / (g.w - g.pad.l - g.pad.r)) * (g.n - 1))));
    this.hover = i;
    const tip = this.root.querySelector('#pi-tip'), date = this.data.cities[this.focus].dates[i];
    tip.innerHTML = `<b>${fmtDate(date)}</b>` + [...this.compare].map(n => { const v = this.data.cities[n].pi[i]; return `<div><i style="background:${this.color(v)}"></i>${n}: ${v.toFixed(1)}</div>`; }).join('');
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX - rect.left + 12, rect.width - 150) + 'px'; tip.style.top = '8px';
    this.draw();
  }
}
