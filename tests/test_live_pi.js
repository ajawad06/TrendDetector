// Mocks Open-Meteo, checks the live PI math, hourly series and key handling.
const assert = require('assert');
const { fetchLive, computePI } = require('../frontend/live_pi');
assert.deepStrictEqual(computePI({ pm25: 150, no2: 200, aod: 2, rain30: 0 }).pi, 100);
assert.strictEqual(computePI({ pm25: 77.5, no2: null, aod: null, rain30: 0 }).pi, 50);   // renormalised, not zero-filled
assert.strictEqual(computePI({ pm25: 150, no2: 200, aod: 2, rain30: 400 }).pi, 75);       // max rain discount
const urls = [];
global.fetch = async url => {
  urls.push(url);
  const n = url.split('latitude=')[1].split('&')[0].split(',').length, now = new Date();
  const times = Array.from({ length: 96 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2, i)).toISOString().slice(0, 16));
  const aq = () => ({ hourly: { time: times, pm2_5: times.map(() => 80), nitrogen_dioxide: times.map(() => 40), aerosol_optical_depth: times.map(() => 0.5) } });
  const wx = () => ({ daily: { precipitation_sum: Array(31).fill(2) } });
  const mk = url.includes('air-quality') ? aq : wx;
  return { ok: true, json: async () => Array.from({ length: n }, mk) };
};
(async () => {
  let d = await fetchLive();
  assert.strictEqual(Object.keys(d.cities).length, 8);
  assert(urls[0].includes('air-quality-api.open-meteo.com') && !urls[0].includes('apikey'));
  const c = d.cities.Lahore; assert(c.pi > 0 && c.hourly.some(h => h.forecast) && c.hourly.some(h => !h.forecast));
  process.env.OPENMETEO_API_KEY = 'k'; urls.length = 0; d = await fetchLive();
  assert(urls.every(u => u.includes('customer-') && u.includes('apikey=k')) && d.keyed);
  console.log('live PI tests passed; Lahore now =', c.pi, c.category);
})();
