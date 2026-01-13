/**
 * Vibe Score 2.0 - Behavior-Based Reputation
 *
 * The Vibe Score reflects actual building behavior, not vanity metrics.
 * It's computed from observed actions, making it hard to game.
 *
 * Components:
 * - Ships posted (building stuff)
 * - Reactions received (quality signal from community)
 * - Comments given (helping others)
 * - Streak consistency (showing up daily)
 * - Gigs completed (professional credibility)
 * - Invites redeemed (growing the community)
 *
 * The score is normalized by tenure to avoid penalizing new members
 * while still rewarding sustained contribution.
 */

// Weights for each behavior type
const WEIGHTS = {
  ships: 10,              // Each ship posted
  reactionsReceived: 5,   // Quality signal
  commentsGiven: 3,       // Helping others
  commentsReceived: 2,    // Engagement magnet
  streakCurrent: 2,       // Active consistency
  streakLongest: 1,       // Historical consistency
  gigsCompleted: 50,      // Professional work
  gigsPosted: 5,          // Creating opportunities
  invitesRedeemed: 20,    // Community growth
  profileViews: 0.5,      // Visibility (capped)
};

// Caps to prevent gaming
const CAPS = {
  profileViews: 100,      // Max 50 points from views
  reactionsReceived: 500, // Max 2500 points from reactions
};

/**
 * Calculate Vibe Score from user stats
 * @param {object} stats - User statistics
 * @returns {{ score: number, breakdown: object, tier: string }}
 */
export function calculateVibeScore(stats) {
  const {
    shipsPosted = 0,
    reactionsReceived = 0,
    commentsGiven = 0,
    commentsReceived = 0,
    streakCurrent = 0,
    streakLongest = 0,
    gigsCompleted = 0,
    gigsPosted = 0,
    invitesRedeemed = 0,
    profileViews = 0,
    daysActive = 1,
  } = stats;

  // Apply caps
  const cappedViews = Math.min(profileViews, CAPS.profileViews);
  const cappedReactions = Math.min(reactionsReceived, CAPS.reactionsReceived);

  // Calculate breakdown
  const breakdown = {
    ships: shipsPosted * WEIGHTS.ships,
    reactions: cappedReactions * WEIGHTS.reactionsReceived,
    commenting: commentsGiven * WEIGHTS.commentsGiven,
    engagement: commentsReceived * WEIGHTS.commentsReceived,
    streak: (streakCurrent * WEIGHTS.streakCurrent) + (streakLongest * WEIGHTS.streakLongest),
    gigs: (gigsCompleted * WEIGHTS.gigsCompleted) + (gigsPosted * WEIGHTS.gigsPosted),
    growth: invitesRedeemed * WEIGHTS.invitesRedeemed,
    visibility: cappedViews * WEIGHTS.profileViews,
  };

  // Raw score
  const raw = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  // Normalize by tenure (sqrt to avoid penalizing veterans too much)
  // Minimum 1 day to avoid division issues
  const normalized = raw / Math.sqrt(Math.max(1, daysActive));

  // Round to whole number
  const score = Math.round(normalized);

  // Determine tier
  const tier = getScoreTier(score);

  return {
    score,
    raw: Math.round(raw),
    breakdown,
    tier,
    daysActive,
  };
}

/**
 * Get tier based on score
 * @param {number} score
 * @returns {string}
 */
function getScoreTier(score) {
  if (score >= 1000) return 'legendary';  // Top builders
  if (score >= 500) return 'elite';       // Very active
  if (score >= 200) return 'established'; // Regular contributor
  if (score >= 50) return 'rising';       // Getting started
  return 'newcomer';                       // Just joined
}

/**
 * Get tier display info
 * @param {string} tier
 * @returns {{ emoji: string, label: string, color: string }}
 */
export function getTierDisplay(tier) {
  const tiers = {
    legendary: { emoji: '👑', label: 'Legendary', color: '#FFD700' },
    elite: { emoji: '⚡', label: 'Elite', color: '#9B59B6' },
    established: { emoji: '🏆', label: 'Established', color: '#3498DB' },
    rising: { emoji: '🌟', label: 'Rising', color: '#2ECC71' },
    newcomer: { emoji: '🌱', label: 'Newcomer', color: '#95A5A6' },
  };
  return tiers[tier] || tiers.newcomer;
}

/**
 * Gather stats for a user from KV
 * @param {object} kv - Vercel KV instance
 * @param {string} handle - User handle
 * @returns {Promise<object>} User stats
 */
export async function gatherUserStats(kv, handle) {
  if (!kv || !handle) return null;

  try {
    const normalizedHandle = handle.toLowerCase().trim();

    // Fetch all relevant data in parallel
    const [
      userPosts,
      streak,
      inviteStats,
      profileData,
      gigsData,
    ] = await Promise.all([
      kv.lrange(`board:user:${normalizedHandle}`, 0, -1),
      kv.get(`streak:${normalizedHandle}`),
      kv.get(`vibe:invites:stats:${normalizedHandle}`),
      kv.get(`vibe:profile:${normalizedHandle}`),
      kv.smembers(`gigs:user:${normalizedHandle}`),
    ]);

    // Count ships
    const shipsPosted = userPosts?.length || 0;

    // Count reactions received across all posts
    let reactionsReceived = 0;
    let commentsReceived = 0;
    if (userPosts && userPosts.length > 0) {
      const postData = await Promise.all(
        userPosts.slice(0, 50).map(id => kv.get(`board:entry:${id}`))
      );
      for (const post of postData) {
        if (post?.reactions) {
          reactionsReceived += Object.values(post.reactions)
            .reduce((sum, users) => sum + (users?.length || 0), 0);
        }
        if (post?.comments) {
          commentsReceived += post.comments.length;
        }
      }
    }

    // Get comments given (from events)
    const userEvents = await kv.lrange(`vibe:events:user:${normalizedHandle}`, 0, 200);
    let commentsGiven = 0;
    if (userEvents) {
      for (const raw of userEvents) {
        const event = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (event.type === 'board_comment_created') {
          commentsGiven++;
        }
      }
    }

    // Streak data
    const streakData = streak || { current: 0, longest: 0 };

    // Invite stats
    const invites = inviteStats || { redeemed: 0 };

    // Profile views
    const profile = profileData || { views: 0, viewsThisWeek: 0 };

    // Gigs
    let gigsCompleted = 0;
    let gigsPosted = 0;
    if (gigsData && gigsData.length > 0) {
      const gigDetails = await Promise.all(
        gigsData.map(id => kv.get(`gig:${id}`))
      );
      for (const gig of gigDetails) {
        if (gig?.poster === normalizedHandle) gigsPosted++;
        if (gig?.hired === normalizedHandle) gigsCompleted++;
      }
    }

    // Calculate days active (from first event or registration)
    let daysActive = 1;
    if (userEvents && userEvents.length > 0) {
      const firstEvent = userEvents[userEvents.length - 1];
      const event = typeof firstEvent === 'string' ? JSON.parse(firstEvent) : firstEvent;
      if (event.ts) {
        const firstDate = new Date(event.ts);
        const now = new Date();
        daysActive = Math.max(1, Math.floor((now - firstDate) / (1000 * 60 * 60 * 24)));
      }
    }

    return {
      handle: normalizedHandle,
      shipsPosted,
      reactionsReceived,
      commentsGiven,
      commentsReceived,
      streakCurrent: streakData.current || 0,
      streakLongest: streakData.longest || 0,
      gigsCompleted,
      gigsPosted,
      invitesRedeemed: invites.redeemed || 0,
      profileViews: profile.views || 0,
      daysActive,
    };
  } catch (e) {
    console.error('[vibescore] Stats gathering error:', e.message);
    return null;
  }
}

/**
 * Calculate and cache vibe score for a user
 * @param {object} kv - Vercel KV instance
 * @param {string} handle - User handle
 * @returns {Promise<object>} Score result
 */
export async function getVibeScore(kv, handle) {
  if (!kv || !handle) return null;

  const normalizedHandle = handle.toLowerCase().trim();

  // Check cache first (5 min TTL)
  const cacheKey = `vibe:score:${normalizedHandle}`;
  const cached = await kv.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Gather stats and calculate
  const stats = await gatherUserStats(kv, normalizedHandle);
  if (!stats) return null;

  const scoreResult = calculateVibeScore(stats);
  const result = {
    ...scoreResult,
    stats,
    handle: normalizedHandle,
    computedAt: new Date().toISOString(),
  };

  // Cache for 5 minutes
  await kv.set(cacheKey, result, { ex: 300 });

  return result;
}
