/**
 * Events Logging — Analytics Infrastructure
 *
 * Simple event tracking to KV for measuring user behavior.
 * Events stored in a capped list for efficient retrieval.
 *
 * Usage:
 *   import { logEvent, getEvents, getEventsSummary } from './lib/events.js';
 *   await logEvent(kv, 'board_post_created', 'seth', { category: 'shipped' });
 */

// Event storage
const EVENTS_LIST = 'vibe:events';           // Main event log (capped)
const EVENTS_BY_HANDLE = 'vibe:events:user:'; // Per-user events: vibe:events:user:{handle}
const EVENTS_MAX = 10000;                     // Keep last 10k events
const EVENTS_PER_USER_MAX = 500;              // Keep last 500 per user

// Valid event types
const EVENT_TYPES = [
  'board_post_created',
  'message_sent',
  'invite_created',
  'invite_redeemed',
  'presence_heartbeat',
  'handle_registered',
  'streak_milestone',
  'profile_viewed'
];

/**
 * Log an event to KV
 * @param {object} kv - Vercel KV instance
 * @param {string} type - Event type (board_post_created, message_sent, etc.)
 * @param {string} handle - User handle
 * @param {object} data - Additional event data
 * @returns {{ success: boolean }}
 */
export async function logEvent(kv, type, handle, data = {}) {
  if (!kv) return { success: false, error: 'no_kv' };

  try {
    const event = {
      type,
      handle,
      data,
      timestamp: Date.now(),
      ts: new Date().toISOString()
    };

    // Store in main event log
    await kv.lpush(EVENTS_LIST, JSON.stringify(event));
    await kv.ltrim(EVENTS_LIST, 0, EVENTS_MAX - 1);

    // Store in per-user log
    if (handle) {
      await kv.lpush(`${EVENTS_BY_HANDLE}${handle}`, JSON.stringify(event));
      await kv.ltrim(`${EVENTS_BY_HANDLE}${handle}`, 0, EVENTS_PER_USER_MAX - 1);
    }

    // Update daily counters for fast aggregation
    const today = new Date().toISOString().split('T')[0];
    await kv.hincrby(`vibe:daily:${today}`, type, 1);
    await kv.hincrby(`vibe:daily:${today}`, 'total', 1);

    // Set expiry on daily counter (30 days)
    await kv.expire(`vibe:daily:${today}`, 60 * 60 * 24 * 30);

    return { success: true };
  } catch (e) {
    console.error('[events] Log error:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Get recent events (optionally filtered by handle or type)
 * @param {object} kv - Vercel KV instance
 * @param {object} options - { handle?, type?, limit? }
 * @returns {{ events: array, total: number }}
 */
export async function getEvents(kv, { handle = null, type = null, limit = 50 } = {}) {
  if (!kv) return { events: [], total: 0 };

  try {
    const cappedLimit = Math.min(Math.max(1, limit), 200);

    // Get from per-user log if handle specified
    const listKey = handle ? `${EVENTS_BY_HANDLE}${handle}` : EVENTS_LIST;
    const rawEvents = await kv.lrange(listKey, 0, cappedLimit - 1);

    let events = rawEvents.map(e => typeof e === 'string' ? JSON.parse(e) : e);

    // Filter by type if specified
    if (type) {
      events = events.filter(e => e.type === type);
    }

    const total = await kv.llen(listKey);

    return { events, total, limit: cappedLimit };
  } catch (e) {
    console.error('[events] Get error:', e.message);
    return { events: [], total: 0, error: e.message };
  }
}

/**
 * Get analytics summary (DAU, messages/day, posts/day)
 * @param {object} kv - Vercel KV instance
 * @param {number} days - Number of days to include (default 7)
 * @returns {{ summary: object }}
 */
export async function getEventsSummary(kv, days = 7) {
  if (!kv) return { summary: null, error: 'no_kv' };

  try {
    const dailyStats = [];
    const now = new Date();

    // Collect stats for each day
    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const stats = await kv.hgetall(`vibe:daily:${dateStr}`) || {};
      dailyStats.push({
        date: dateStr,
        board_posts: parseInt(stats.board_post_created || 0),
        messages: parseInt(stats.message_sent || 0),
        invites_created: parseInt(stats.invite_created || 0),
        invites_redeemed: parseInt(stats.invite_redeemed || 0),
        heartbeats: parseInt(stats.presence_heartbeat || 0),
        total: parseInt(stats.total || 0)
      });
    }

    // Calculate totals
    const totals = dailyStats.reduce((acc, day) => ({
      board_posts: acc.board_posts + day.board_posts,
      messages: acc.messages + day.messages,
      invites_created: acc.invites_created + day.invites_created,
      invites_redeemed: acc.invites_redeemed + day.invites_redeemed,
      total_events: acc.total_events + day.total
    }), { board_posts: 0, messages: 0, invites_created: 0, invites_redeemed: 0, total_events: 0 });

    // Get unique active users from presence (approximate DAU)
    // We'll count unique handles in today's events as a proxy
    const today = now.toISOString().split('T')[0];
    const recentEvents = await kv.lrange(EVENTS_LIST, 0, 999);
    const todayHandles = new Set();
    const weekHandles = new Set();

    for (const raw of recentEvents) {
      const event = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (event.handle && event.ts?.startsWith(today)) {
        todayHandles.add(event.handle);
      }
      if (event.handle) {
        weekHandles.add(event.handle);
      }
    }

    return {
      summary: {
        period: `${days} days`,
        today: dailyStats[0],
        totals,
        dau_estimate: todayHandles.size,
        wau_estimate: weekHandles.size,
        daily_breakdown: dailyStats
      }
    };
  } catch (e) {
    console.error('[events] Summary error:', e.message);
    return { summary: null, error: e.message };
  }
}

// Export event types for validation
export const VALID_EVENT_TYPES = EVENT_TYPES;
