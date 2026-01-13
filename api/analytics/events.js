/**
 * Analytics Events API
 *
 * GET /api/analytics/events - Get recent events
 * GET /api/analytics/events?handle=X - Get events for a specific user
 * GET /api/analytics/events?type=X - Filter by event type
 *
 * Returns:
 * - Recent events with timestamps
 * - Filterable by handle or type
 */

import { getEvents, VALID_EVENT_TYPES } from '../lib/events.js';

// Check if KV is configured
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// KV wrapper
async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    console.error('[analytics/events] KV load error:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const kv = await getKV();
  if (!kv) {
    return res.status(503).json({
      error: 'Analytics unavailable',
      reason: 'KV not configured'
    });
  }

  try {
    const { handle, type, limit } = req.query;

    // Validate type if provided
    if (type && !VALID_EVENT_TYPES.includes(type)) {
      return res.status(400).json({
        error: 'Invalid event type',
        valid_types: VALID_EVENT_TYPES
      });
    }

    const cappedLimit = Math.min(Math.max(1, parseInt(limit || '50')), 200);

    const { events, total, error } = await getEvents(kv, {
      handle: handle || null,
      type: type || null,
      limit: cappedLimit
    });

    if (error) {
      return res.status(500).json({ error, events: [] });
    }

    // Cache for 10 seconds
    res.setHeader('Cache-Control', 'public, max-age=10');

    return res.status(200).json({
      success: true,
      events,
      total,
      filters: {
        handle: handle || null,
        type: type || null,
        limit: cappedLimit
      },
      valid_types: VALID_EVENT_TYPES,
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('[analytics/events] Error:', e.message);
    return res.status(500).json({
      error: 'Failed to get events',
      message: e.message
    });
  }
}
