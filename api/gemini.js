const https = require('https');

// Vercel serverless function: POST /api/gemini
// The API key comes ONLY from the GEMINI_API_KEY environment variable in Vercel.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const apiKey = (data.apiKey || process.env.GEMINI_API_KEY || '').trim();
    const model = data.model || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    const prompt = data.prompt;

    if (!apiKey) {
      return res.status(400).json({ error: 'GEMINI_API_KEY is not set in Vercel environment variables' });
    }

    const modelsToTry = [model];
    const preferredFallbacks = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];
    for (const f of preferredFallbacks) {
      if (!modelsToTry.includes(f)) modelsToTry.push(f);
    }

    for (let i = 0; i < modelsToTry.length; i++) {
      try {
        const result = await makeGeminiRequest(apiKey, modelsToTry[i], prompt);
        return res.status(200).json(result);
      } catch (err) {
        const msg = err.message || '';
        const isRetryable = /high demand|overloaded|unavailable|resource exhausted|quota|exceeded|rate limit|429|not found|not supported|404|timed out/i.test(msg);
        if (!isRetryable || i === modelsToTry.length - 1) {
          return res.status(502).json({ error: msg });
        }
      }
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function makeGeminiRequest(apiKey, model, prompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4
      }
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400 || json.error) {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
            return;
          }
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            reject(new Error('No text returned from Gemini API'));
            return;
          }
          let cleaned = text.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
          }
          resolve(JSON.parse(cleaned));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.setTimeout(20000, () => req.destroy(new Error('Gemini request timed out')));
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
