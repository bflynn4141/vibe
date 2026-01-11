/**
 * Claude Activity API - The Session Graph
 *
 * Captures what Claude Code is actually doing across the network.
 * This is the moat: understanding how developers use AI in their terminal.
 *
 * POST /api/claude-activity - Record Claude activity from terminal
 * GET /api/claude-activity - Get activity feed (optionally filtered)
 * GET /api/claude-activity?handle=@user - Get user's Claude activity
 * GET /api/claude-activity?stream=true - SSE stream (real-time)
 *
 * Activity Types:
 * - reading: Files being read/explored
 * - writing: Code being generated/modified
 * - thinking: Reasoning/planning process
 * - tool: Tools being used (grep, bash, etc)
 * - suggestion: Fixes/improvements suggested
 *
 * The Moat:
 * - Aggregate patterns → Templates
 * - Popular workflows → Discovery
 * - Desire paths → Product evolution
 */

import crypto from 'crypto';
import {
  checkRateLimit,
  setRateLimitHeaders,
  rateLimitResponse,
  hashIP,
  getClientIP
} from './lib/ratelimit.js';

// ============ INLINE AUTH ============
const AUTH_SECRET = process.env.VIBE_AUTH_SECRET || 'dev-secret-change-in-production';

function extractToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const vibeToken = req.headers?.['x-vibe-token'] || req.headers?.['X-Vibe-Token'];
  if (vibeToken) return vibeToken;
  if (req.query?.token) return req.query.token;
  return null;
}

function verifyToken(token, expectedHandle) {
  if (!token) return { valid: false, error: 'No token provided' };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, error: 'Invalid token format' };
  const [sessionId, providedSignature] = parts;
  const handle = expectedHandle.toLowerCase().replace('@', '');
  const payload = `${sessionId}:${handle}`;
  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
      return { valid: false, error: 'Invalid signature' };
    }
  } catch (e) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true, sessionId };
}
// ============ END AUTH ============

// Check if KV is configured
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Activity TTL in seconds (1 hour - recent activity only)
const ACTIVITY_TTL = 3600;

// Redis keys
const ACTIVITY_STREAM = 'claude:activity:stream'; // Sorted set: score=timestamp, member=activityId
const ACTIVITY_BY_USER = (handle) => `claude:activity:user:${handle}`; // Per-user activity
const ACTIVITY_DATA = (id) => `claude:activity:${id}`; // Activity data hash

// In-memory fallback
let memoryActivities = [];
const MAX_MEMORY_ACTIVITIES = 100;

// KV wrapper
async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

// ============ ACTIVITY STORAGE ============

/**
 * Record Claude activity event
 */
async function recordActivity(activityData) {
  const kv = await getKV();
  const activityId = `act_${crypto.randomBytes(8).toString('base64url')}`;
  const timestamp = Date.now();

  const activity = {
    id: activityId,
    timestamp,
    ...activityData
  };

  if (kv) {
    try {
      // Store activity data
      await kv.hset(ACTIVITY_DATA(activityId), activity);

      // Add to global stream (sorted by timestamp)
      await kv.zadd(ACTIVITY_STREAM, { score: timestamp, member: activityId });

      // Add to user-specific stream
      if (activity.handle) {
        await kv.zadd(ACTIVITY_BY_USER(activity.handle), { score: timestamp, member: activityId });
      }

      // Set TTL on activity data
      await kv.expire(ACTIVITY_DATA(activityId), ACTIVITY_TTL);

      return { success: true, activityId };
    } catch (error) {
      console.error('KV activity write failed:', error);
      // Fall through to memory
    }
  }

  // Memory fallback
  memoryActivities.unshift(activity);
  if (memoryActivities.length > MAX_MEMORY_ACTIVITIES) {
    memoryActivities = memoryActivities.slice(0, MAX_MEMORY_ACTIVITIES);
  }

  return { success: true, activityId };
}

/**
 * Get recent activity feed
 */
async function getActivityFeed({ handle, limit = 50, offset = 0 }) {
  const kv = await getKV();

  if (kv) {
    try {
      // Get activity IDs from appropriate stream
      const streamKey = handle ? ACTIVITY_BY_USER(handle) : ACTIVITY_STREAM;
      const activityIds = await kv.zrange(streamKey, 0, limit - 1, { rev: true });

      if (activityIds.length === 0) return [];

      // Fetch activity data for each ID
      const activities = await Promise.all(
        activityIds.map(id => kv.hgetall(ACTIVITY_DATA(id)))
      );

      return activities.filter(Boolean);
    } catch (error) {
      console.error('KV activity read failed:', error);
      // Fall through to memory
    }
  }

  // Memory fallback
  let activities = memoryActivities;
  if (handle) {
    activities = activities.filter(a => a.handle === handle);
  }
  return activities.slice(offset, offset + limit);
}

/**
 * Get activity stats (for desire paths analysis)
 */
async function getActivityStats() {
  const kv = await getKV();

  if (kv) {
    try {
      const totalCount = await kv.zcard(ACTIVITY_STREAM);
      return { totalActivities: totalCount };
    } catch (error) {
      console.error('KV stats read failed:', error);
    }
  }

  // Memory fallback
  return { totalActivities: memoryActivities.length };
}

// ============ HTTP HANDLER ============

export default async function handler(req, res) {
  const clientIP = getClientIP(req);
  const ipHash = hashIP(clientIP);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vibe-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - Record activity
  if (req.method === 'POST') {
    // Rate limit: 100 activity events per minute per IP
    const allowed = await checkRateLimit(ipHash, 'claude-activity-post', 100, 60);
    setRateLimitHeaders(res, allowed);
    if (!allowed.success) {
      return rateLimitResponse(res, allowed);
    }

    const { handle, type, content, details, sessionId } = req.body;

    // Validate required fields
    if (!handle || !type || !content) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['handle', 'type', 'content']
      });
    }

    // Validate activity type
    const validTypes = ['reading', 'writing', 'thinking', 'tool', 'suggestion'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid activity type',
        validTypes
      });
    }

    // Verify token for write operations
    const token = extractToken(req);
    const auth = verifyToken(token, handle);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.error });
    }

    try {
      const result = await recordActivity({
        handle: handle.toLowerCase().replace('@', ''),
        type,
        content,
        details,
        sessionId: sessionId || auth.sessionId
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error('Activity recording failed:', error);
      return res.status(500).json({ error: 'Failed to record activity' });
    }
  }

  // GET - Retrieve activity feed
  if (req.method === 'GET') {
    // Rate limit: 60 requests per minute per IP
    const allowed = await checkRateLimit(ipHash, 'claude-activity-get', 60, 60);
    setRateLimitHeaders(res, allowed);
    if (!allowed.success) {
      return rateLimitResponse(res, allowed);
    }

    const { handle, limit, offset, stats, stream } = req.query;

    // SSE streaming support (for real-time feed)
    if (stream === 'true') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send initial data
      const activities = await getActivityFeed({ handle, limit: 10 });
      res.write(`data: ${JSON.stringify({ type: 'initial', activities })}\n\n`);

      // Keep connection alive with heartbeat every 30s
      const heartbeat = setInterval(() => {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
      }, 30000);

      // Cleanup on close
      req.on('close', () => {
        clearInterval(heartbeat);
        res.end();
      });

      return;
    }

    // Stats endpoint (for desire paths)
    if (stats === 'true') {
      const statistics = await getActivityStats();
      return res.status(200).json(statistics);
    }

    // Regular feed
    try {
      const activities = await getActivityFeed({
        handle: handle?.toLowerCase().replace('@', ''),
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0
      });

      return res.status(200).json({ activities });
    } catch (error) {
      console.error('Activity retrieval failed:', error);
      return res.status(500).json({ error: 'Failed to retrieve activity' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
