/**
 * Live Pollution Index from Open-Meteo (air quality + weather).
 * Works with no key (free, non-commercial tier). Set OPENMETEO_API_KEY in .env
 * to use the paid "customer" endpoints instead. Results are cached 30 min.
 *
 * Same formula shape as the historical PI (scripts/build_pollution_index.py), but
 * Open-Meteo gives SURFACE NO2 in ug/m3, not the satellite column used
 * historically, so NO2 uses its own bounds below. Live PI is therefore a
 * "now-cast" on the same 0-100 scale, not directly comparable to the
 * 2005-2024 satellite PI.
 */
const fs = require('fs');
const path = require('path');

const BOUNDS = { pm25: [5, 150], no2: [0, 200], aod: [0, 2.0] };   // no2 in ug/m3 (surface)
const WEIGHTS = { pm25: 0.5, no2: 0.3, aod: 0.2 };
const CATS = [[20, 'Good'], [40, 'Moderate'], [60, 'Unhealthy for sensitive groups'], [80, 'Unhealthy'], [100, 'Hazardous']];
const TTL_MS = 30 * 60 * 1000;
let cache = null;

const sub = (x, [lo, hi]) => Math.min(Math.max((x - lo) / (hi - lo), 0), 1) * 100;
const category = v => (CATS.find(c => v <= c[0]) || CATS[4])[1];

/** Missing inputs are skipped and the weights renormalised, never treated as 0. */
function computePI({ pm25, no2, aod, rain30 }) {
  const parts = { pm25, no2, aod };
  let num = 0, den = 0, best = null, bestC = -1;
  for (const k of Object.keys(WEIGHTS)) {
    if (parts[k] == null || Number.isNaN(parts[k])) continue;
    const c = sub(parts[k], BOUNDS[k]) * WEIGHTS[k];
    num += c; den += WEIGHTS[k];
    if (c > bestC) { bestC = c; best = k; }
  }
  if (!den) return null;
  const R = Math.min(Math.max((rain30 ?? 0) / 200, 0), 1);
  const pi = (num / den) * (1 - 0.25 * R);
  return { pi: +pi.toFixed(1), category: category(pi), driver: best };
}

function cities() {
  const p = path.join(__dirname, 'data', 'pollution_index.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return Object.entries(j.cities).map(([name, c]) => ({ name, lat: c.lat, lon: c.lon }));
}

async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

async function fetchLive() {
  const key = process.env.OPENMETEO_API_KEY;
  const aqHost = key ? 'customer-air-quality-api.open-meteo.com' : 'air-quality-api.open-meteo.com';
  const wxHost = key ? 'customer-api.open-meteo.com' : 'api.open-meteo.com';
  const list = cities();
  const loc = `latitude=${list.map(c => c.lat).join(',')}&longitude=${list.map(c => c.lon).join(',')}`;
  const k = key ? `&apikey=${encodeURIComponent(key)}` : '';
  const [aq, wx] = await Promise.all([
    getJSON(`https://${aqHost}/v1/air-quality?${loc}&hourly=pm2_5,nitrogen_dioxide,aerosol_optical_depth&past_days=2&forecast_days=2&timezone=GMT${k}`),
    getJSON(`https://${wxHost}/v1/forecast?${loc}&daily=precipitation_sum&past_days=30&forecast_days=1&timezone=GMT${k}`)
  ]);
  const aqArr = Array.isArray(aq) ? aq : [aq], wxArr = Array.isArray(wx) ? wx : [wx];
  const nowIso = new Date().toISOString().slice(0, 13);            // current UTC hour
  const out = {};
  list.forEach((c, i) => {
    const h = aqArr[i].hourly, rain30 = wxArr[i].daily.precipitation_sum.slice(0, 30).reduce((a, b) => a + (b || 0), 0);
    const hourly = h.time.map((t, j) => {
      const r = computePI({ pm25: h.pm2_5[j], no2: h.nitrogen_dioxide[j], aod: h.aerosol_optical_depth[j], rain30 });
      return r ? { t, pi: r.pi, forecast: t.slice(0, 13) > nowIso } : null;
    }).filter(Boolean);
    let idx = h.time.findIndex(t => t.slice(0, 13) === nowIso);
    if (idx < 0) idx = hourly.filter(x => !x.forecast).length - 1;
    const cur = computePI({ pm25: h.pm2_5[idx], no2: h.nitrogen_dioxide[idx], aod: h.aerosol_optical_depth[idx], rain30 });
    out[c.name] = { ...cur, time: h.time[idx], pm25: h.pm2_5[idx], no2: h.nitrogen_dioxide[idx], aod: h.aerosol_optical_depth[idx], rain30: +rain30.toFixed(1), hourly };
  });
  return { updated: new Date().toISOString(), source: 'Open-Meteo (CAMS) air quality + weather', keyed: !!key, cities: out,
    note: 'Live PI uses surface NO2 (ug/m3) with its own bounds; it is a model now-cast, not comparable to the satellite PI history or a regulatory AQI.' };
}

async function getLivePI() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await fetchLive();
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { getLivePI, computePI, fetchLive };
