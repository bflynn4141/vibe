/**
 * Growth Leaderboard v2.0
 *
 * GET /api/growth/leaderboard - See who's building the most
 *
 * Now uses Vibe Score 2.0:
 * - Ships posted (building stuff)
 * - Reactions received (quality signal)
 * - Comments given (helping others)
 * - Streak consistency (showing up)
 * - Invites redeemed (growing community)
 *
 * The score rewards actual building behavior, not just vanity metrics.
 */

import { kv } from '@vercel/kv';
import { getVibeScore, getTierDisplay } from '../lib/vibescore.js';
import { setSecurityHeaders } from '../lib/security.js';

// System accounts to filter from leaderboard
const SYSTEM_ACCOUNTS = new Set([
  'vibe', 'system', 'solienne', 'scout', 'echo', 'test', 'admin',
  'health-check', 'testuser', 'testuser123', 'curltest',
  'test_migration_check', 'test_cap_check_xyz'
]);

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60');

  try {
    // Get all handle records
    const handles = await kv.hgetall('vibe:handles');

    if (!handles) {
      return res.status(200).json({
        success: true,
        leaderboard: [],
        stats: { total: 0, genesisRemaining: 100 }
      });
    }

    const leaderboard = [];
    const handleList = Object.entries(handles).filter(([h]) => !SYSTEM_ACCOUNTS.has(h));

    // Process handles in batches for performance
    const BATCH_SIZE = 10;
    for (let i = 0; i < handleList.length; i += BATCH_SIZE) {
      const batch = handleList.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async ([handle, record]) => {
          try {
            const data = typeof record === 'string' ? JSON.parse(record) : record;

            // Get Vibe Score
            const scoreData = await getVibeScore(kv, handle);

            // Get presence for online status
            const presence = await kv.get(`presence:${handle}`);
            const lastSeen = presence?.lastSeen;
            const isActive = lastSeen &&
              (Date.now() - new Date(lastSeen).getTime()) < 24 * 60 * 60 * 1000;

            // Get streak
            const streak = await kv.get(`streak:${handle}`) || { current: 0, longest: 0 };

            return {
              handle,
              genesis: data.genesis || false,
              genesisNumber: data.genesis_number || null,

              // New Vibe Score
              vibeScore: scoreData?.score || 0,
              tier: scoreData?.tier || 'newcomer',
              tierDisplay: scoreData ? getTierDisplay(scoreData.tier) : null,

              // Key metrics (from score breakdown)
              stats: scoreData?.stats ? {
                ships: scoreData.stats.shipsPosted,
                reactionsReceived: scoreData.stats.reactionsReceived,
                commentsGiven: scoreData.stats.commentsGiven,
                invitesRedeemed: scoreData.stats.invitesRedeemed,
              } : null,

              // Streak
              streak: streak.current,
              longestStreak: streak.longest,

              // Status
              isActive,
              lastActive: lastSeen || data.last_active_at,
              registeredAt: data.registeredAt,

              // Legacy growth score (for backwards compatibility)
              growthScore: scoreData?.score || 0,
            };
          } catch (err) {
            console.error(`[leaderboard] Error processing ${handle}:`, err.message);
            return null;
          }
        })
      );

      leaderboard.push(...batchResults.filter(r => r !== null));
    }

    // Sort by Vibe Score (descending)
    leaderboard.sort((a, b) => b.vibeScore - a.vibeScore);

    // Assign ranks
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Get stats
    const totalHandles = Object.keys(handles).filter(h => !SYSTEM_ACCOUNTS.has(h)).length;
    const activeCount = leaderboard.filter(u => u.isActive).length;

    // Tier distribution
    const tierCounts = {};
    for (const entry of leaderboard) {
      tierCounts[entry.tier] = (tierCounts[entry.tier] || 0) + 1;
    }

    return res.status(200).json({
      success: true,
      leaderboard: leaderboard.slice(0, 50), // Top 50
      stats: {
        total: totalHandles,
        genesisRemaining: Math.max(0, 100 - totalHandles),
        activeToday: activeCount,
        tierDistribution: tierCounts,
        averageVibeScore: Math.round(
          leaderboard.reduce((sum, u) => sum + u.vibeScore, 0) / Math.max(1, leaderboard.length)
        ),
      },
      scoreVersion: '2.0',
      note: 'Vibe Score now reflects actual building behavior: ships, reactions, comments, streaks, and community growth.',
    });

  } catch (e) {
    console.error('[leaderboard] Error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
