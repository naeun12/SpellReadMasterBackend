// middleware/auth.js
const { admin } = require('../config/firebase');

async function authenticate(req, res, next) {
  // 🔥 1. Allow OPTIONS preflight requests (CRITICAL for CORS)
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  // 🔥 2. Check for Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  // 🔥 3. Verify Firebase token
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = authenticate;
