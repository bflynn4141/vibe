/**
 * Notifications API - Unified Notification Stream
 *
 * GET /api/notifications?user=X - Get notifications for user
 * GET /api/notifications?user=X&since=<timestamp> - Get new notifications since timestamp
 * POST /api/notifications/read - Mark notifications as read
 *
 * Aggregates notifications from:
 * - Reactions on your ships
 * - Comments on your ships
 * - DMs received
 * - Gig matches
 * - Achievements/milestones
 * - System announcements
 *
 * Designed for terminal integration - poll every 30s for new notifications.
 */

import { kv } from '@vercel/kv';
import { checkRateLimit, rateLimitResponse, getClientIP, hashIP } from './lib/ratelimit.js';
import { setSecurityHeaders } from './lib/security.js';

// Notification types
const NOTIFICATION_TYPES = [
  'reaction',           // Someone reacted to your ship
  'comment',            // Someone commented on your ship
  'mention',            // Someone mentioned you
  'dm',                 // New DM received
  'gig_match',          // A gig matches your skills
  'gig_application',    // Someone applied to your gig
  'achievement',        // You earned an achievement
  'profile_view',       // Someone viewed your profile (weekly summary)
  'weekly_digest',      // Your weekly stats
  'system',             // Platform announcements
];

// Max notifications per user
const MAX_NOTIFICATIONS = 100;

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limit
  const clientIP = getClientIP(req);
  const rateCheck = await checkRateLimit(`notifications:${hashIP(clientIP)}`, {
    max: 60,
    windowMs: 60 * 1000
  });
  if (!rateCheck.success) {
    return rateLimitResponse(res);
  }

  // POST - Mark notifications as read
  if (req.method === 'POST') {
    const { user, ids, markAllRead } = req.body;

    if (!user) {
      return res.status(400).json({ error: 'user required' });
    }

    const handle = user.toLowerCase().trim();

    try {
      if (markAllRead) {
        // Mark all as read
        const notifKey = `vibe:notifications:${handle}`;
        const notifications = await kv.get(notifKey) || [];

        const updated = notifications.map(n => ({ ...n, read: true }));
        await kv.set(notifKey, updated);

        return res.status(200).json({
          success: true,
          marked: notifications.length
        });
      }

      if (ids && Array.isArray(ids)) {
        // Mark specific IDs as read
        const notifKey = `vibe:notifications:${handle}`;
        const notifications = await kv.get(notifKey) || [];

        const idSet = new Set(ids);
        const updated = notifications.map(n =>
          idSet.has(n.id) ? { ...n, read: true } : n
        );
        await kv.set(notifKey, updated);

        return res.status(200).json({
          success: true,
          marked: ids.length
        });
      }

      return res.status(400).json({ error: 'ids or markAllRead required' });

    } catch (e) {
      console.error('[notifications] POST error:', e.message);
      return res.status(500).json({ error: 'Failed to mark as read' });
    }
  }

  // GET - Fetch notifications
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, since, type, limit } = req.query;

  if (!user) {
    return res.status(400).json({ error: 'user required' });
  }

  const handle = user.toLowerCase().trim();
  const cappedLimit = Math.min(Math.max(1, parseInt(limit || '50')), 100);

  try {
    // Get stored notifications
    const notifKey = `vibe:notifications:${handle}`;
    let notifications = await kv.get(notifKey) || [];

    // Also check messages for DM notifications (real-time)
    const dmNotifications = await getDMNotifications(handle);
    notifications = mergeNotifications(notifications, dmNotifications);

    // Check for achievement notifications
    const achievements = await checkAchievements(handle);
    notifications = mergeNotifications(notifications, achievements);

    // Filter by type if specified
    if (type && NOTIFICATION_TYPES.includes(type)) {
      notifications = notifications.filter(n => n.type === type);
    }

    // Filter by timestamp if specified
    if (since) {
      const sinceDate = new Date(since);
      notifications = notifications.filter(n =>
        new Date(n.createdAt) > sinceDate
      );
    }

    // Sort by newest first
    notifications.sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Apply limit
    notifications = notifications.slice(0, cappedLimit);

    // Count unread
    const allNotifs = await kv.get(notifKey) || [];
    const unreadCount = allNotifs.filter(n => !n.read).length + dmNotifications.filter(n => !n.read).length;

    // Summary by type
    const summary = {};
    for (const n of allNotifs.concat(dmNotifications)) {
      if (!n.read) {
        summary[n.type] = (summary[n.type] || 0) + 1;
      }
    }

    return res.status(200).json({
      success: true,
      notifications,
      unread: unreadCount,
      summary,
      types: NOTIFICATION_TYPES,
      timestamp: new Date().toISOString()
    });

  } catch (e) {
    console.error('[notifications] GET error:', e.message);
    return res.status(500).json({ error: 'Failed to get notifications' });
  }
}

/**
 * Get DM notifications from messages
 */
async function getDMNotifications(handle) {
  try {
    const messages = await kv.get('vibe:messages') || [];
    const unreadDMs = messages.filter(m =>
      m.to === handle && !m.read && m.from !== 'vibe'
    );

    return unreadDMs.map(m => ({
      id: `dm_${m.id}`,
      type: 'dm',
      from: m.from,
      preview: m.text.substring(0, 100),
      createdAt: m.createdAt,
      read: false,
      data: { messageId: m.id }
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Check for new achievements
 */
async function checkAchievements(handle) {
  const achievements = [];

  try {
    // Get user stats
    const streak = await kv.get(`streak:${handle}`) || { current: 0, longest: 0, badges: [] };
    const postIds = await kv.lrange(`board:user:${handle}`, 0, -1) || [];
    const achievementKey = `vibe:achievements:${handle}`;
    const earnedAchievements = await kv.get(achievementKey) || [];
    const earnedSet = new Set(earnedAchievements);

    // Check milestones
    const milestones = [
      { id: 'first_ship', condition: postIds.length >= 1, title: 'First Ship!', emoji: '🚀' },
      { id: 'five_ships', condition: postIds.length >= 5, title: '5 Ships', emoji: '🎯' },
      { id: 'ten_ships', condition: postIds.length >= 10, title: '10 Ships', emoji: '🏆' },
      { id: 'streak_3', condition: streak.current >= 3, title: '3 Day Streak', emoji: '🔥' },
      { id: 'streak_7', condition: streak.current >= 7, title: 'Verified Builder', emoji: '✓' },
      { id: 'streak_30', condition: streak.current >= 30, title: 'Month of Building', emoji: '📅' },
    ];

    const newAchievements = [];
    for (const milestone of milestones) {
      if (milestone.condition && !earnedSet.has(milestone.id)) {
        newAchievements.push(milestone.id);
        achievements.push({
          id: `achievement_${milestone.id}_${Date.now()}`,
          type: 'achievement',
          title: milestone.title,
          emoji: milestone.emoji,
          createdAt: new Date().toISOString(),
          read: false,
          data: { achievementId: milestone.id }
        });
      }
    }

    // Save newly earned achievements
    if (newAchievements.length > 0) {
      await kv.set(achievementKey, [...earnedAchievements, ...newAchievements]);
    }

  } catch (e) {
    console.error('[notifications] Achievement check error:', e.message);
  }

  return achievements;
}

/**
 * Merge notifications, avoiding duplicates
 */
function mergeNotifications(existing, newNotifs) {
  const existingIds = new Set(existing.map(n => n.id));
  const merged = [...existing];

  for (const n of newNotifs) {
    if (!existingIds.has(n.id)) {
      merged.push(n);
    }
  }

  return merged;
}

/**
 * Store a notification for a user
 * Called from other endpoints (reactions, comments, etc.)
 */
export async function storeNotification(kv, handle, notification) {
  if (!kv || !handle || !notification) return false;

  try {
    const notifKey = `vibe:notifications:${handle}`;
    const notifications = await kv.get(notifKey) || [];

    notifications.unshift({
      id: notification.id || `notif_${Date.now().toString(36)}`,
      ...notification,
      createdAt: notification.createdAt || new Date().toISOString(),
      read: false,
    });

    // Cap at max
    if (notifications.length > MAX_NOTIFICATIONS) {
      notifications.splice(MAX_NOTIFICATIONS);
    }

    await kv.set(notifKey, notifications);
    return true;

  } catch (e) {
    console.error('[notifications] Store error:', e.message);
    return false;
  }
}
