// Vercel serverless function: GET /api/config
// Tells the page whether a server-side key is configured (never returns the key).
module.exports = function handler(req, res) {
  const key = process.env.GEMINI_API_KEY || '';
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ hasKey: Boolean(key), model: model });
};
