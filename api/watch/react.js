/**
 * Watch Reactions API
 *
 * POST /api/watch/react - Send a reaction to a live broadcast
 * GET /api/watch/react?room=X - Get reactions for broadcaster to display
 *
 * Reactions flow:
 * 1. Viewer sends reaction (POST)
 * 2. Stored in KV queue for the room
 * 3. Broadcaster polls (GET) to show reactions in terminal overlay
 *
 * Supported reactions: fire, mind_blown, hundred, eyes, clap, rocket
 */

import { kv } from '@vercel/kv';
import { checkRateLimit, rateLimitResponse, getClientIP, hashIP } from '../lib/ratelimit.js';
import { setSecurityHeaders } from '../lib/security.js';

// Reaction emoji mapping
const REACTIONS = {
  fire: '🔥',
  mind_blown: '🤯',
  hundred: '💯',
  eyes: '👀',
  clap: '👏',
  rocket: '🚀',
  heart: '❤️',
  ship: '🚢',
};

// Max reactions to store per room
const MAX_REACTIONS = 100;

// Reaction TTL (1 hour)
const REACTION_TTL = 3600;

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - Send a reaction
  if (req.method === 'POST') {
    const { roomId, reaction, viewerId, handle } = req.body;

    if (!roomId || !reaction) {
      return res.status(400).json({
        success: false,
        error: 'Missing roomId or reaction'
      });
    }

    // Validate reaction type
    if (!REACTIONS[reaction]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reaction type',
        valid_reactions: Object.keys(REACTIONS)
      });
    }

    // Rate limit: 30 reactions per minute per IP
    const clientIP = getClientIP(req);
    const rateCheck = await checkRateLimit(`watch:react:${hashIP(clientIP)}`, {
      max: 30,
      windowMs: 60 * 1000
    });

    if (!rateCheck.success) {
      return rateLimitResponse(res);
    }

    try {
      // Check if broadcast exists
      const broadcasts = await kv.get('vibe:broadcasts') || {};
      if (!broadcasts[roomId]) {
        return res.status(404).json({
          success: false,
          error: 'Broadcast not found'
        });
      }

      // Add to reaction queue
      const reactionKey = `vibe:reactions:${roomId}`;
      const reactionData = {
        id: `react_${Date.now().toString(36)}`,
        reaction,
        emoji: REACTIONS[reaction],
        viewerId: viewerId || 'anonymous',
        handle: handle || 'viewer',
        timestamp: Date.now()
      };

      await kv.lpush(reactionKey, JSON.stringify(reactionData));

      // Trim to max reactions
      await kv.ltrim(reactionKey, 0, MAX_REACTIONS - 1);

      // Set TTL
      await kv.expire(reactionKey, REACTION_TTL);

      // Increment reaction count for this broadcast
      const countKey = `vibe:reaction_count:${roomId}`;
      const count = await kv.incr(countKey);
      await kv.expire(countKey, REACTION_TTL);

      return res.status(200).json({
        success: true,
        reaction: reactionData,
        totalReactions: count
      });

    } catch (e) {
      console.error('[watch/react] POST error:', e.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to send reaction'
      });
    }
  }

  // GET - Get reactions for a room (broadcaster polling)
  if (req.method === 'GET') {
    const { room, since, limit: queryLimit } = req.query;

    if (!room) {
      return res.status(400).json({
        success: false,
        error: 'Missing room parameter'
      });
    }

    const limit = Math.min(parseInt(queryLimit || '20'), 50);

    try {
      const reactionKey = `vibe:reactions:${room}`;
      const rawReactions = await kv.lrange(reactionKey, 0, limit - 1);

      let reactions = rawReactions.map(r =>
        typeof r === 'string' ? JSON.parse(r) : r
      );

      // Filter by timestamp if since is provided
      if (since) {
        const sinceTs = parseInt(since);
        reactions = reactions.filter(r => r.timestamp > sinceTs);
      }

      // Get total count
      const countKey = `vibe:reaction_count:${room}`;
      const totalReactions = await kv.get(countKey) || 0;

      return res.status(200).json({
        success: true,
        reactions,
        count: reactions.length,
        totalReactions,
        timestamp: Date.now()
      });

    } catch (e) {
      console.error('[watch/react] GET error:', e.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to get reactions'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
