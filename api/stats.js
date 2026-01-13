/**
 * Stats API - Live network statistics for homepage
 *
 * GET /api/stats - Get current network stats
 */

import { checkRateLimit, rateLimitResponse, getClientIP, hashIP } from './lib/ratelimit.js';
import { setSecurityHeaders } from './lib/security.js';

// Check if KV is configured
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=30'); // Cache for 30 seconds

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit by IP: 60 requests per minute (generous for homepage polling)
  const clientIP = getClientIP(req);
  const rateCheck = await checkRateLimit(`stats:${hashIP(clientIP)}`, {
    max: 60,
    windowMs: 60 * 1000
  });

  if (!rateCheck.success) {
    return rateLimitResponse(res);
  }

  try {
    const kv = await getKV();

    let users = 12;    // Default fallback
    let messages = 47; // Default fallback

    if (kv) {
      // Count users
      const userKeys = await kv.keys('user:*');
      users = userKeys.length || users;

      // Count messages
      const allMessages = await kv.get('vibe:messages');
      messages = Array.isArray(allMessages) ? allMessages.length : messages;
    }

    return res.status(200).json({
      success: true,
      users,
      messages,
      storage: KV_CONFIGURED ? 'kv' : 'memory',
      cachedAt: new Date().toISOString()
    });
  } catch (e) {
    // Return fallback stats on error
    return res.status(200).json({
      success: true,
      users: 12,
      messages: 47,
      storage: 'fallback',
      error: e.message
    });
  }
}
