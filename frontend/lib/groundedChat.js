/**
 * Shared "grounded chat" logic used by both the local dev server (server.js)
 * and the Vercel serverless function (api/assistant/chat.js), so there is
 * exactly one implementation to keep correct.
 */
const fs = require('fs');
const path = require('path');

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';

let cachedSeriesData = null;
function getSeriesData(projectRoots) {
  if (cachedSeriesData) return cachedSeriesData;
  const roots = Array.isArray(projectRoots) ? projectRoots : [projectRoots];
  const paths = roots.flatMap(root => [
    path.join(root, 'public', 'data', 'series.json'),
    path.join(root, 'data', 'series.json')
  ]);
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

/** Grounded Chat Handler strictly constrained to the 4 variables & 8 cities. */
async function handleGroundedChat(message, projectRoots) {
  const msgLower = message.toLowerCase();

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

  const seriesData = getSeriesData(projectRoots);
  let groundedFacts = "";

  if (seriesData && seriesData[matchedCity]) {
    const pts = seriesData[matchedCity].variables[matchedVar];
    if (pts && pts.length === 240) {
      const vals = pts.map(p => p.value);

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

  if (GROQ_API_KEY && groundedFacts) {
    try {
      const resp = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${groundedFacts}\n\nUser asked: "${message}"` }
          ],
          temperature: 0.2,
          max_tokens: 2048
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content;
        if (text && text.trim()) {
          return {
            reply: text.trim(),
            is_ai_generated: true,
            analysis_ref: { variable: matchedVar, region: matchedCity }
          };
        }
        console.warn("Groq API returned 200 but no message content:", JSON.stringify(data).slice(0, 300));
      } else {
        const body = await resp.text().catch(() => '');
        console.warn(`Groq API error: HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 300)}`);
      }
    } catch (e) {
      console.warn("Groq API request failed:", e.message);
    }
  }

  const cName = matchedCity.charAt(0).toUpperCase() + matchedCity.slice(1);
  return {
    reply: `🔍 **Grounded Observation for ${matchedVar.toUpperCase()} in ${cName}** (2005–2024):\n\nBased on 240 consecutive monthly observations, select **${matchedVar.toUpperCase()}** and **${cName}** above in the workspace to inspect the verified time series chart, anomaly fit, and statistical significance.\n\n⚠️ *A trend describes historical association and does not by itself prove a cause.*`,
    is_ai_generated: false,
    analysis_ref: { variable: matchedVar, region: matchedCity }
  };
}

module.exports = { handleGroundedChat, GROQ_API_KEY };
