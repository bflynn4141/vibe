/**
 * GET /api/reputation/score
 *
 * Get reputation score and tier info for a user
 * Returns default "genesis" tier if user not found (graceful onboarding)
 *
 * Query params:
 * - handle: User handle (required)
 */

import { getSQL, isPostgresEnabled } from '../../lib/db.js';
import { kv } from '@vercel/kv';

// Default tier structure for new users
const DEFAULT_TIER = {
  tier: 'genesis',
  overall_score: 0,
  scores: { economic: 0, social: 0, expert: 0, creator: 0 },
  daily_budget: 10,
  unlocks: ['basic_messaging', 'presence', 'discovery']
};

const TIER_THRESHOLDS = [
  { tier: 'genesis', min: 0, daily_budget: 10 },
  { tier: 'bronze', min: 100, daily_budget: 25 },
  { tier: 'silver', min: 500, daily_budget: 50 },
  { tier: 'gold', min: 2000, daily_budget: 100 },
  { tier: 'platinum', min: 5000, daily_budget: 250 },
  { tier: 'diamond', min: 10000, daily_budget: 500 }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { handle } = req.query;

    if (!handle) {
      return res.status(400).json({
        error: 'Missing required parameter: handle'
      });
    }

    const cleanHandle = handle.replace('@', '').toLowerCase();

    // Try to get from KV cache first (fast path)
    const cached = await kv.get(`reputation:${cleanHandle}`);
    if (cached) {
      return res.status(200).json({
        success: true,
        ...cached,
        source: 'cache'
      });
    }

    // Check if Postgres is configured
    if (!isPostgresEnabled()) {
      // Return default tier with activity-based scoring from KV
      const activityScore = await calculateActivityScore(cleanHandle);
      const tier = getTierForScore(activityScore);

      const response = {
        success: true,
        handle: cleanHandle,
        overall_score: activityScore,
        tier: tier.tier,
        scores: {
          economic: 0,
          social: activityScore,
          expert: 0,
          creator: 0
        },
        badges: [],
        rank: null,
        percentile: null,
        next_tier: getNextTier(tier.tier)?.tier || null,
        progress_to_next: calculateProgress(activityScore, tier),
        points_needed: getNextTier(tier.tier) ? getNextTier(tier.tier).min - activityScore : 0,
        tier_unlocks: DEFAULT_TIER.unlocks,
        daily_budget: tier.daily_budget,
        source: 'activity'
      };

      // Cache for 5 minutes
      await kv.set(`reputation:${cleanHandle}`, response, { ex: 300 });

      return res.status(200).json(response);
    }

    // Full Postgres path
    const sql = getSQL();

    try {
      const scoreResult = await sql`
        SELECT * FROM reputation_scores
        WHERE handle = ${cleanHandle}
      `;

      if (scoreResult.length === 0) {
        // User not in reputation table yet - return default
        const activityScore = await calculateActivityScore(cleanHandle);
        const tier = getTierForScore(activityScore);

        return res.status(200).json({
          success: true,
          handle: cleanHandle,
          overall_score: activityScore,
          tier: tier.tier,
          scores: { economic: 0, social: activityScore, expert: 0, creator: 0 },
          badges: [],
          rank: null,
          next_tier: getNextTier(tier.tier)?.tier || null,
          progress_to_next: calculateProgress(activityScore, tier),
          daily_budget: tier.daily_budget,
          message: 'Keep participating to earn reputation!',
          source: 'default'
        });
      }

      const score = scoreResult[0];

      // Get badges
      let badges = [];
      try {
        const badgesResult = await sql`
          SELECT b.badge_id, b.name, b.description, b.icon, b.category, b.rarity
          FROM badge_awards ba
          JOIN badges b ON ba.badge_id = b.badge_id
          WHERE ba.handle = ${cleanHandle}
          ORDER BY ba.awarded_at DESC
        `;
        badges = badgesResult.map(b => ({
          id: b.badge_id,
          name: b.name,
          description: b.description,
          icon: b.icon,
          category: b.category,
          rarity: b.rarity
        }));
      } catch (e) {
        // Badges table might not exist
      }

      const tier = getTierForScore(score.overall_score);
      const nextTier = getNextTier(tier.tier);

      return res.status(200).json({
        success: true,
        handle: cleanHandle,
        overall_score: score.overall_score,
        tier: score.tier || tier.tier,
        scores: {
          economic: score.economic_score || 0,
          social: score.social_score || 0,
          expert: score.expert_score || 0,
          creator: score.creator_score || 0
        },
        badges,
        next_tier: nextTier?.tier || null,
        progress_to_next: calculateProgress(score.overall_score, tier),
        points_needed: nextTier ? nextTier.min - score.overall_score : 0,
        daily_budget: tier.daily_budget,
        source: 'postgres'
      });

    } catch (dbError) {
      // Database query failed (table doesn't exist, etc.)
      console.error('[Reputation] DB error:', dbError.message);

      // Fallback to activity-based scoring
      const activityScore = await calculateActivityScore(cleanHandle);
      const tier = getTierForScore(activityScore);

      return res.status(200).json({
        success: true,
        handle: cleanHandle,
        overall_score: activityScore,
        tier: tier.tier,
        scores: { economic: 0, social: activityScore, expert: 0, creator: 0 },
        badges: [],
        next_tier: getNextTier(tier.tier)?.tier || null,
        progress_to_next: calculateProgress(activityScore, tier),
        daily_budget: tier.daily_budget,
        source: 'fallback'
      });
    }

  } catch (error) {
    console.error('[Reputation] Score error:', error);
    return res.status(500).json({
      error: 'Failed to fetch reputation score',
      details: error.message
    });
  }
}

// Calculate activity score from KV data (messages, presence, ships)
async function calculateActivityScore(handle) {
  let score = 0;

  try {
    // Check presence activity
    const presence = await kv.get(`presence:${handle}`);
    if (presence) {
      score += 10; // Has set up presence
      if (presence.workingOn) score += 5; // Has a project description
    }

    // Check message activity (rough estimate)
    const threads = await kv.smembers(`threads:${handle}`) || [];
    score += Math.min(threads.length * 5, 50); // Up to 50 points for messaging

    // Check ships/posts
    const posts = await kv.lrange(`board:user:${handle}`, 0, 20) || [];
    score += Math.min(posts.length * 10, 100); // Up to 100 points for shipping

  } catch (e) {
    // KV errors shouldn't break the response
  }

  return score;
}

function getTierForScore(score) {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (score >= TIER_THRESHOLDS[i].min) {
      return TIER_THRESHOLDS[i];
    }
  }
  return TIER_THRESHOLDS[0];
}

function getNextTier(currentTier) {
  const idx = TIER_THRESHOLDS.findIndex(t => t.tier === currentTier);
  if (idx >= 0 && idx < TIER_THRESHOLDS.length - 1) {
    return TIER_THRESHOLDS[idx + 1];
  }
  return null;
}

function calculateProgress(score, currentTier) {
  const next = getNextTier(currentTier.tier);
  if (!next) return 1.0;

  const range = next.min - currentTier.min;
  const progress = score - currentTier.min;
  return range > 0 ? Math.min(progress / range, 1.0) : 0;
}
