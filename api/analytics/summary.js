/**
 * Analytics Summary API
 *
 * GET /api/analytics/summary - Get platform metrics
 *
 * Returns:
 * - DAU/WAU estimates
 * - Messages per day
 * - Board posts per day
 * - Invite conversion
 * - Daily breakdown
 */

import { getEventsSummary } from '../lib/events.js';
import { checkRateLimit, rateLimitResponse, getClientIP, hashIP } from '../lib/ratelimit.js';
import { setSecurityHeaders } from '../lib/security.js';

// Check if KV is configured
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// KV wrapper
async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    console.error('[analytics/summary] KV load error:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 30 requests per minute per IP
  const clientIP = getClientIP(req);
  const rateCheck = await checkRateLimit(`analytics:summary:${hashIP(clientIP)}`, {
    max: 30,
    windowMs: 60 * 1000
  });

  if (!rateCheck.success) {
    return rateLimitResponse(res);
  }

  const kv = await getKV();
  if (!kv) {
    return res.status(503).json({
      error: 'Analytics unavailable',
      reason: 'KV not configured'
    });
  }

  try {
    const days = parseInt(req.query.days || '7');
    const cappedDays = Math.min(Math.max(1, days), 30);

    const { summary, error } = await getEventsSummary(kv, cappedDays);

    if (error) {
      return res.status(500).json({ error, summary: null });
    }

    // Add handle stats for context
    const handleCount = await kv.hlen('vibe:handles') || 0;

    // Cache for 30 seconds (fresh enough for dashboards)
    res.setHeader('Cache-Control', 'public, max-age=30');

    return res.status(200).json({
      success: true,
      platform: {
        registered_handles: handleCount,
        genesis_remaining: Math.max(0, 100 - handleCount)
      },
      ...summary,
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('[analytics/summary] Error:', e.message);
    return res.status(500).json({
      error: 'Failed to generate summary',
      message: e.message
    });
  }
}
