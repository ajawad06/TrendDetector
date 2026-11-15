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
  let matchedCities = validCities.filter(c => msgLower.includes(c));
  if (matchedCities.length === 0) matchedCities = ['lahore'];
  // Keep the order the cities were mentioned in, so "X vs Y" reads naturally; cap to 4 to keep the prompt small.
  matchedCities.sort((a, b) => msgLower.indexOf(a) - msgLower.indexOf(b));
  matchedCities = matchedCities.slice(0, 4);
  const matchedCity = matchedCities[0];

  const seriesData = getSeriesData(projectRoots);
  const factLines = [];

  for (const city of matchedCities) {
    if (!seriesData || !seriesData[city]) continue;
    const pts = seriesData[city].variables[matchedVar];
    if (!pts || pts.length !== 240) continue;
    const vals = pts.map(p => p.value);

    const n = vals.length;
    let sumY = 0, sumX = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      const x = i / 12.0;
      sumX += x; sumY += vals[i]; sumXY += x * vals[i]; sumXX += x * x;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const cityName = seriesData[city].name;
    const rate = `${slope > 0 ? '+' : ''}${matchedVar === 'no2' ? (slope / 1e15).toFixed(3) + ' x10^15' : slope.toFixed(4)} per year`;
    factLines.push(`- ${cityName} (lat: ${seriesData[city].lat}, lon: ${seriesData[city].lon}): rate of change ${rate}`);
  }

  let groundedFacts = "";
  if (factLines.length) {
    groundedFacts = `
VERIFIED FACTS FROM OBSERVATION DATASET (DO NOT ALTER):
- Variable: ${matchedVar.toUpperCase()}
- Period: 2005-01-01 to 2024-12-01 (240 consecutive monthly points per city, 0% missing)
${factLines.join('\n')}
`;
  }

  const systemPrompt = `You are the Trend Detective AI assistant for a Pakistan air-quality dashboard, grounded in real monthly observations (2005–2024) across 8 Pakistani cities (Lahore, Karachi, Islamabad, Peshawar, Quetta, Faisalabad, Multan, Hyderabad) measuring PM2.5 (smog), AOD (haze), Rainfall, and NO2 (traffic/industrial fumes).
RULES:
1. A "VERIFIED FACTS" block is provided below with real numbers for the variable and cit(ies) the user asked about. If that block is present, you ALREADY have what you need — answer directly using only those numbers, never invent others. Only decline ("I cannot answer that from this dataset.") when the user asks about a genuinely different variable or city that is not PM2.5/AOD/Rainfall/NO2 or not one of the 8 listed cities.
2. General questions are always in scope even without numbers attached: greetings ("hi"/"hello"), definitions ("what is NO2?", "what does AOD mean?"), and how-to questions ("how do I compare two cities?", "how do I read a trend?"). Answer these directly and helpfully — never refuse a greeting or a definition.
3. The facts block may list more than one city for the same variable — that is a deliberate comparison; compare their rates of change directly and say which is rising faster, falling, or roughly flat. Never refuse just because more than one city is listed.
4. NEVER make unsupported causal claims. A statistical trend does not prove a cause or guarantee future continuation.
5. Keep explanations complete and accessible for students and educators.`;

  const looksLikeFalseRefusal = (text) =>
    text.length < 150 && /\bcannot answer\b|\bcan't answer\b|\bdon'?t have (that|the|any) (information|data)\b|\bi'?m sorry\b/i.test(text);

  let rateLimited = false;

  async function callGroq() {
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
        temperature: 0.1,
        max_tokens: 2048
      })
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      if (resp.status === 429) rateLimited = true;
      console.warn(`Groq API error: HTTP ${resp.status} ${resp.statusText} — ${body.slice(0, 300)}`);
      return null;
    }
    rateLimited = false;
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text || !text.trim()) {
      console.warn("Groq API returned 200 but no message content:", JSON.stringify(data).slice(0, 300));
      return null;
    }
    return text.trim();
  }

  if (GROQ_API_KEY && groundedFacts) {
    try {
      let text = await callGroq();
      if (!text && rateLimited) {
        // Brief backoff, then one retry — most single-user bursts clear within a couple of seconds.
        await new Promise((r) => setTimeout(r, 2500));
        text = await callGroq();
      } else if (text && looksLikeFalseRefusal(text)) {
        // The model occasionally refuses even though it has the facts it needs; retry once before giving up.
        text = (await callGroq()) || text;
      }
      if (text) {
        return {
          reply: text,
          is_ai_generated: true,
          analysis_ref: { variable: matchedVar, region: matchedCity }
        };
      }
    } catch (e) {
      console.warn("Groq API request failed:", e.message);
    }
  }

  if (rateLimited) {
    return {
      reply: "The AI assistant is getting a lot of questions right now and hit a short rate limit. Please wait a few seconds and try again.",
      is_ai_generated: false,
      analysis_ref: { variable: matchedVar, region: matchedCity }
    };
  }

  const cName = matchedCity.charAt(0).toUpperCase() + matchedCity.slice(1);
  return {
    reply: `🔍 **Grounded Observation for ${matchedVar.toUpperCase()} in ${cName}** (2005–2024):\n\nBased on 240 consecutive monthly observations, select **${matchedVar.toUpperCase()}** and **${cName}** above in the workspace to inspect the verified time series chart, anomaly fit, and statistical significance.\n\n⚠️ *A trend describes historical association and does not by itself prove a cause.*`,
    is_ai_generated: false,
    analysis_ref: { variable: matchedVar, region: matchedCity }
  };
}

module.exports = { handleGroundedChat, GROQ_API_KEY };
