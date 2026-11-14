/**
 * Trend Detector — Integrated Server with Live Gemini AI & Grounded Statistical Context
 * Operating exclusively on real observation data (pk_city_monthly_final.csv).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;
const ROOT_DIR = __dirname;
const PROJECT_ROOT = path.join(__dirname, '..');

// Load environment variables
function loadEnv() {
  const envPaths = [
    path.join(PROJECT_ROOT, '.env'),
    path.join(ROOT_DIR, '.env'),
    path.join(PROJECT_ROOT, 'backend', '.env')
  ];
  for (const ep of envPaths) {
    if (fs.existsSync(ep)) {
      try {
        const lines = fs.readFileSync(ep, 'utf-8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {}
    }
  }
}
loadEnv();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Cache series data for server-side AI grounding
let cachedSeriesData = null;
function getSeriesData() {
  if (cachedSeriesData) return cachedSeriesData;
  const paths = [
    path.join(PROJECT_ROOT, 'public', 'data', 'series.json'),
    path.join(ROOT_DIR, 'public', 'data', 'series.json'),
    path.join(ROOT_DIR, 'data', 'series.json')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        cachedSeriesData = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return cachedSeriesData;
      } catch (e) {}
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Buffer POST body
  let bodyBuffer = Buffer.alloc(0);
  if (req.method === 'POST') {
    try {
      bodyBuffer = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read request body' }));
      return;
    }
  }

  // Health
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', mode: 'real-data-engine' }));
    return;
  }

  // Assistant Chat
  if (req.url.startsWith('/api/assistant/chat')) {
    let payload = {};
    try {
      payload = JSON.parse(bodyBuffer.toString('utf-8'));
    } catch (e) {}

    const userMessage = payload.message || '';
    const result = await handleGroundedChat(userMessage);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  // Series JSON Direct Endpoint
  if (req.url === '/api/series' || req.url === '/public/data/series.json' || req.url === '/data/series.json') {
    const series = getSeriesData();
    if (series) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(series));
      return;
    }
  }

  // Static files
  handleStaticFiles(req, res);
});

// Grounded Chat Handler strictly constrained to the 4 variables & 8 cities
async function handleGroundedChat(message) {
  const msgLower = message.toLowerCase();

  // Out-of-scope check
  const forbidden = ['soil', 'moisture', 'temperature', 'warming', 'heat', 'ndvi', 'greenness', 'forest', 'deforestation', 'amazon', 'california', 'global', 'co2', 'carbon'];
  for (const term of forbidden) {
    if (msgLower.includes(term)) {
      return {
        reply: "I cannot answer that from this dataset. Our verified observations cover strictly **PM2.5, Aerosol Optical Depth (AOD), Monthly Rainfall, and Tropospheric NO₂** across 8 cities in Pakistan from 2005 to 2024.",
        is_ai_generated: false,
        suggested_followup: "Try asking: 'What are the PM2.5 trends in Lahore?' or 'Compare rainfall between Peshawar and Karachi.'"
      };
    }
  }

  // Scope entities
  const validVars = {
    'rain': 'rain_mm',
    'precipitation': 'rain_mm',
    'rainfall': 'rain_mm',
    'monsoon': 'rain_mm',
    'no2': 'no2',
    'nitrogen': 'no2',
    'aod': 'aod',
    'aerosol': 'aod',
    'haze': 'aod',
    'pm25': 'pm25',
    'smog': 'pm25',
    'particulate': 'pm25',
    'pollution': 'pm25'
  };

  let matchedVar = 'pm25';
  for (const [k, v] of Object.entries(validVars)) {
    if (msgLower.includes(k)) {
      matchedVar = v;
      break;
    }
  }

  const validCities = ['lahore', 'karachi', 'islamabad', 'peshawar', 'quetta', 'faisalabad', 'multan', 'hyderabad'];
  let matchedCity = 'lahore';
  for (const c of validCities) {
    if (msgLower.includes(c)) {
      matchedCity = c;
      break;
    }
  }

  const seriesData = getSeriesData();
  let groundedFacts = "";

  if (seriesData && seriesData[matchedCity]) {
    const pts = seriesData[matchedCity].variables[matchedVar];
    if (pts && pts.length === 240) {
      const dates = pts.map(p => p.date);
      const vals = pts.map(p => p.value);
      
      // Calculate basic grounded stats
      const n = vals.length;
      let sumY = 0, sumX = 0, sumXY = 0, sumXX = 0;
      for (let i = 0; i < n; i++) {
        const x = i / 12.0;
        sumX += x; sumY += vals[i]; sumXY += x * vals[i]; sumXX += x * x;
      }
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const cityName = seriesData[matchedCity].name;

      groundedFacts = `
VERIFIED FACTS FROM OBSERVATION DATASET (DO NOT ALTER):
- Variable: ${matchedVar.toUpperCase()}
- City: ${cityName} (lat: ${seriesData[matchedCity].lat}, lon: ${seriesData[matchedCity].lon})
- Period: 2005-01-01 to 2024-12-01 (240 consecutive monthly points, 0% missing)
- Rate of Change: ${slope > 0 ? '+' : ''}${matchedVar === 'no2' ? (slope / 1e15).toFixed(3) + ' x10^15' : slope.toFixed(4)} per year
`;
    }
  }

  const systemPrompt = `You are the Trend Detective AI grounded exclusively in real monthly observations (2005–2024) across 8 Pakistani cities (Lahore, Karachi, Islamabad, Peshawar, Quetta, Faisalabad, Multan, Hyderabad) measuring PM2.5, AOD, Rainfall, and NO2.
RULES:
1. Use ONLY the verified observational facts provided below. Never invent numbers.
2. If asked about variables or regions outside this dataset, decline politely: "I cannot answer that from this dataset."
3. NEVER make unsupported causal claims. A statistical trend does not prove a cause or guarantee future continuation.
4. Keep explanations complete and accessible for students and educators.`;

  if (GEMINI_API_KEY && groundedFacts) {
    try {
      const resp = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${groundedFacts}\n\nUser asked: "${message}"` }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim()) {
          return {
            reply: text.trim(),
            is_ai_generated: true,
            analysis_ref: { variable: matchedVar, region: matchedCity }
          };
        }
      }
    } catch (e) {
      console.warn("Gemini API error:", e.message);
    }
  }

  // Fallback if no key or error
  const cName = matchedCity.charAt(0).toUpperCase() + matchedCity.slice(1);
  return {
    reply: `🔍 **Grounded Observation for ${matchedVar.toUpperCase()} in ${cName}** (2005–2024):\n\nBased on 240 consecutive monthly observations, select **${matchedVar.toUpperCase()}** and **${cName}** above in the workspace to inspect the verified time series chart, anomaly fit, and statistical significance.\n\n⚠️ *A trend describes historical association and does not by itself prove a cause.*`,
    is_ai_generated: false,
    analysis_ref: { variable: matchedVar, region: matchedCity }
  };
}

function handleStaticFiles(req, res) {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  let filePath = path.join(ROOT_DIR, reqPath);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PROJECT_ROOT, reqPath);
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🌍 Trend Detector Server — Real Observational Dataset`);
  console.log(`   Frontend UI:  http://localhost:${PORT}`);
  console.log(`   Dataset:      data/raw/pk_city_monthly_final.csv`);
  console.log(`   Gemini AI:    ${GEMINI_API_KEY ? 'Active (API Key loaded)' : 'Deterministic Grounding'}`);
  console.log(`======================================================\n`);
});
