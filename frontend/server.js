/**
 * Trend Detector — Integrated Server with Live Groq AI & Grounded Statistical Context
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

const { getLivePI } = require('./live_pi');
const { handleGroundedChat } = require('./lib/groundedChat');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

// Cache series data for server-side AI grounding
let cachedSeriesData = null;
function getSeriesData() {
  if (cachedSeriesData) return cachedSeriesData;
  const paths = [
    path.join(ROOT_DIR, 'data', 'series.json'),
    path.join(PROJECT_ROOT, 'frontend', 'data', 'series.json')
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

  // Live Pollution Index (Open-Meteo now-cast)
  if (req.url.split('?')[0] === '/api/live-pi') {
    try {
      const data = await getLivePI();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Live data unavailable: ' + e.message }));
    }
    return;
  }

  // Assistant Chat
  if (req.url.startsWith('/api/assistant/chat')) {
    let payload = {};
    try {
      payload = JSON.parse(bodyBuffer.toString('utf-8'));
    } catch (e) {}

    const userMessage = payload.message || '';
    const result = await handleGroundedChat(userMessage, [PROJECT_ROOT, ROOT_DIR]);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  // Series JSON Direct Endpoint
  if (req.url === '/api/series' || req.url === '/data/series.json') {
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

    // HTTP Range support for smooth video streaming and looping
    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.webm')) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      fileStream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': stats.size,
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
  console.log(`   Groq AI:      ${GROQ_API_KEY ? 'Active (API Key loaded)' : 'Deterministic Grounding'}`);
  console.log(`======================================================\n`);
});
