/**
 * Trend Detector — Integrated Server with Live Gemini AI & FastAPI Proxy
 * 
 * 1. Serves frontend UI at http://localhost:5173
 * 2. Proxies /api/* to FastAPI backend (http://127.0.0.1:8000) when running
 * 3. Has built-in Gemini 2.5 Flash + NASA statistical grounding when backend is offline
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;
const BACKEND_HOST = process.env.BACKEND_HOST || '127.0.0.1';
const BACKEND_PORT = process.env.BACKEND_PORT || 8000;
const ROOT_DIR = __dirname;
const BACKEND_DIR = path.join(__dirname, '..', 'backend');

// Load environment variables from backend/.env or .env
function loadEnv() {
  const envPaths = [
    path.join(BACKEND_DIR, '.env'),
    path.join(ROOT_DIR, '.env'),
    path.join(ROOT_DIR, '..', '.env')
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

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Buffer request body for POST
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

  // ── Route /api/ and /health ──
  if (req.url.startsWith('/api/') || req.url === '/health') {
    let fallbackHandled = false;
    const safeFallback = () => {
      if (fallbackHandled || res.headersSent) return;
      fallbackHandled = true;
      handleLocalFallback(req, res, bodyBuffer);
    };

    // Attempt proxying to FastAPI backend first
    const proxyReq = http.request({
      host: BACKEND_HOST,
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${BACKEND_HOST}:${BACKEND_PORT}`,
        'content-length': bodyBuffer.length
      },
      timeout: 1000 // Quick fail if backend not active
    }, (proxyRes) => {
      if (fallbackHandled || res.headersSent) return;
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      safeFallback();
    });

    proxyReq.on('error', () => {
      safeFallback();
    });

    if (bodyBuffer.length > 0) {
      proxyReq.write(bodyBuffer);
    }
    proxyReq.end();
    return;
  }

  // ── Static Files ──
  handleStaticFiles(req, res);
});

// ── Built-in Gemini & Data Fallback Handler ──
async function handleLocalFallback(req, res, bodyBuffer) {
  if (res.headersSent) return;
  const urlParts = req.url.split('?')[0].split('/');
  const endpoint = urlParts[2];

  // 1. Assistant chat endpoint
  if (endpoint === 'assistant' && urlParts[3] === 'chat') {
    let payload = {};
    try {
      payload = JSON.parse(bodyBuffer.toString('utf-8'));
    } catch (e) {}

    const userMessage = payload.message || '';
    const result = await handleGeminiChat(userMessage);
    if (res.headersSent || res.writableEnded) return;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  // 2. Catalogs
  if (['variables', 'regions', 'missions', 'topics', 'datasets', 'learning', 'hotspots'].includes(endpoint)) {
    const catalogFile = endpoint === 'learning' ? 'learning_terms.json' : `${endpoint}.json`;
    const catPath = path.join(ROOT_DIR, 'catalogs', catalogFile);
    if (fs.existsSync(catPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      const raw = fs.readFileSync(catPath, 'utf-8');
      const data = JSON.parse(raw);
      res.end(JSON.stringify({ [endpoint]: data }));
      return;
    }
  }

  // 3. Time Series Data: /api/data/{variable}/{region}
  if (endpoint === 'data' && urlParts.length >= 5) {
    const varId = urlParts[3];
    const regId = urlParts[4];
    const dataPath = path.join(ROOT_DIR, 'data', 'prepared', varId, `${regId}.json`);
    if (fs.existsSync(dataPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      fs.createReadStream(dataPath).pipe(res);
      return;
    }
  }

  // 4. Health endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', mode: 'node-integrated' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ detail: `Endpoint not found: ${req.url}` }));
}

// ── Live Gemini Chat with Deterministic Statistical Grounding ──
async function handleGeminiChat(message) {
  const msgLower = message.toLowerCase();

  // Entity extraction
  let variableId = 'rainfall';
  if (msgLower.includes('smog') || msgLower.includes('aod') || msgLower.includes('pollution') || msgLower.includes('aerosol') || msgLower.includes('haze')) {
    variableId = 'aod';
  } else if (msgLower.includes('soil') || msgLower.includes('moisture') || msgLower.includes('drought')) {
    variableId = 'soil_moisture';
  } else if (msgLower.includes('temp') || msgLower.includes('warming') || msgLower.includes('heat')) {
    variableId = 'temperature';
  } else if (msgLower.includes('veg') || msgLower.includes('ndvi') || msgLower.includes('greenness') || msgLower.includes('crop')) {
    variableId = 'ndvi';
  }

  let regionId = variableId === 'aod' ? 'lahore_airshed' : (variableId === 'soil_moisture' ? 'indus_basin' : 'pakistan');
  if (msgLower.includes('lahore')) regionId = 'lahore_airshed';
  else if (msgLower.includes('karachi')) regionId = 'karachi';
  else if (msgLower.includes('indus')) regionId = 'indus_basin';
  else if (msgLower.includes('punjab')) regionId = 'punjab';
  else if (msgLower.includes('sindh')) regionId = 'sindh';
  else if (msgLower.includes('balochistan')) regionId = 'balochistan';
  else if (msgLower.includes('north') || msgLower.includes('mountain')) regionId = 'northern_pakistan';
  else if (msgLower.includes('south') || msgLower.includes('plain')) regionId = 'southern_pakistan';
  else if (msgLower.includes('california')) regionId = 'california';

  // Load data for grounding
  const dataPath = path.join(ROOT_DIR, 'data', 'prepared', variableId, `${regionId}.json`);
  let timeSeriesData = null;
  if (fs.existsSync(dataPath)) {
    try {
      timeSeriesData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    } catch (e) {}
  }

  // System prompt enforcing SRD §13
  const systemPrompt = `You are the Trend Detective AI Assistant for the NASA Space Apps Challenge 2026.
Your role is to help students, educators, and the public investigate Earth system trends using real NASA satellite data.
STRICT RULES:
1. NEVER invent numbers or statistical facts. Use only the provided computed results.
2. NEVER make unsupported causal claims. A trend does NOT prove its cause or guarantee future continuation.
3. Keep explanations clear, complete, and engaging for high school and college students.
4. Never output half-finished sentences or cut off mid-thought. Always close your paragraphs cleanly.
5. Always cite the NASA dataset provider (GES DISC, LAADS DAAC, etc.).`;

  let groundedContext = '';
  if (timeSeriesData && timeSeriesData.ols_trend) {
    const ols = timeSeriesData.ols_trend;
    groundedContext = `
ACTUAL COMPUTED SATELLITE/MODEL RESULTS (DO NOT ALTER ANY NUMBERS):
- Variable: ${timeSeriesData.variable_name} (Dataset: ${timeSeriesData.dataset}, Provider: ${timeSeriesData.provider})
- Region: ${timeSeriesData.region_name}
- Period: ${timeSeriesData.period.start} to ${timeSeriesData.period.end} (${timeSeriesData.n_observations} monthly observations)
- Rate of Change: ${ols.slope_per_year > 0 ? '+' : ''}${ols.slope_per_year} ${ols.slope_unit} (Total Change: ${ols.total_change > 0 ? '+' : ''}${ols.total_change} ${timeSeriesData.unit})
- Statistical Significance: ${ols.p_value < 0.05 ? 'Statistically significant (p < 0.05)' : 'Not statistically significant (p >= 0.05)'} (p-value = ${ols.p_value})
- 95% Confidence Interval: [${ols.ci_95_lower}, ${ols.ci_95_upper}] ${ols.slope_unit}
- Scientific Disclaimer: A trend does not prove cause or guarantee future continuation.
`;
  }

  const userPrompt = `User asked: "${message}"

Using the verified facts below, give a complete, friendly, and structured Earth Detective response for high school and college students.
Include:
1. A direct answer to what is changing and whether it is statistically significant.
2. The exact rate of change and time period.
3. A 'Why This Matters' explanation connected to human health, agriculture, or climate.
4. A gentle scientific reminder that a trend does not prove cause.
Ensure your response is complete with no unfinished sentences.

${groundedContext}`;

  // Call Gemini if key is present
  if (GEMINI_API_KEY) {
    try {
      const resp = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
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
            analysis_ref: {
              variable: variableId,
              region: regionId,
              data_url: `/api/data/${variableId}/${regionId}`
            },
            suggested_followup: `Ask: 'How does rainfall in Northern Pakistan compare to the South?'`,
            sources: [timeSeriesData?.dataset || 'NASA Earth Science', timeSeriesData?.provider || 'NASA GES DISC']
          };
        }
      }
    } catch (err) {
      console.warn('Gemini API fetch error in server.js:', err.message);
    }
  }

  // High quality deterministic fallback
  let fallbackReply = `🔍 **Investigation Result for ${timeSeriesData ? timeSeriesData.variable_name : variableId} in ${timeSeriesData ? timeSeriesData.region_name : regionId}**:\n\n`;
  if (timeSeriesData && timeSeriesData.ols_trend) {
    const ols = timeSeriesData.ols_trend;
    fallbackReply += `• **Rate of Change**: ${ols.slope_per_year > 0 ? '+' : ''}${ols.slope_per_year} ${ols.slope_unit} (Total change: ${ols.total_change > 0 ? '+' : ''}${ols.total_change} ${timeSeriesData.unit})\n`;
    fallbackReply += `• **Statistical Significance**: ${ols.p_value < 0.05 ? 'Statistically significant (p < 0.05)' : 'Not statistically significant'} (p-value: ${ols.p_value})\n`;
    fallbackReply += `• **Observation Window**: ${timeSeriesData.period.start} to ${timeSeriesData.period.end} (${timeSeriesData.n_observations} monthly points)\n\n`;
    fallbackReply += `**Dataset Source**: ${timeSeriesData.dataset} via ${timeSeriesData.provider}.\n\n`;
    fallbackReply += `⚠️ *Scientific Note: A trend does not prove cause or guarantee future continuation.*`;
  } else {
    fallbackReply += `Satellite observations from 2000 to 2024 are prepared for this investigation. Select a mission above to view the interactive time series chart!`;
  }

  return {
    reply: fallbackReply,
    is_ai_generated: true,
    analysis_ref: { variable: variableId, region: regionId },
    suggested_followup: "Try asking: 'Is air pollution increasing in Lahore?'",
    sources: ['NASA GES DISC', 'NASA LAADS DAAC']
  };
}

function handleStaticFiles(req, res) {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  let filePath = path.join(ROOT_DIR, reqPath);
  if (!fs.existsSync(filePath) && reqPath.startsWith('/backend/')) {
    filePath = path.join(BACKEND_DIR, reqPath.replace('/backend/', ''));
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
  console.log(`🌍 Trend Detector Server with Live Gemini 2.5 Flash AI`);
  console.log(`   Frontend UI:  http://localhost:${PORT}`);
  console.log(`   Backend Proxy: http://${BACKEND_HOST}:${BACKEND_PORT}`);
  console.log(`   Gemini Status: ${GEMINI_API_KEY ? 'Active (API Key loaded)' : 'Offline (No Key)'}`);
  console.log(`======================================================\n`);
});
