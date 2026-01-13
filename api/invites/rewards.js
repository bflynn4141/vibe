/**
 * Invite Rewards API — Track invite quality and earn rewards
 *
 * GET /api/invites/rewards?handle=X - Get invite performance stats
 *
 * "Earn rewards for inviting the right people" - Rob Goldman
 *
 * Quality metrics:
 * - Stayed: Still active after 7 days
 * - Shipped: Posted at least one ship to the board
 * - Invited: Successfully invited others (viral chain)
 */

const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    console.error('[invites/rewards] KV load error:', e.message);
    return null;
  }
}

// Quality thresholds
const QUALITY_THRESHOLDS = {
  stayed_days: 7,        // Days to count as "stayed"
  shipped_count: 1,      // Ships to count as "shipped"
  invited_count: 1       // Successful invites to count as "invited"
};

// Reward tiers
const REWARD_TIERS = {
  bronze: { quality_invites: 1, bonus_codes: 1, badge: 'connector' },
  silver: { quality_invites: 3, bonus_codes: 2, badge: 'networker' },
  gold: { quality_invites: 5, bonus_codes: 3, badge: 'influencer' },
  platinum: { quality_invites: 10, bonus_codes: 5, badge: 'kingmaker' }
};

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

  const kv = await getKV();
  if (!kv) {
    return res.status(503).json({
      success: false,
      error: 'Service unavailable'
    });
  }

  const { handle } = req.query;

  if (!handle) {
    return res.status(400).json({
      success: false,
      error: 'Handle required'
    });
  }

  const normalizedHandle = handle.toLowerCase().trim();

  try {
    // Get all invite codes created by this user
    const userCodesKey = 'vibe:invites:by:' + normalizedHandle;
    const codelist = await kv.smembers(userCodesKey) || [];

    const invites = [];
    let qualityCount = 0;
    let totalRedeemed = 0;

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    for (const code of codelist) {
      const codeData = await kv.hget('vibe:invites', code);
      if (!codeData) continue;

      const invite = typeof codeData === 'string' ? JSON.parse(codeData) : codeData;

      if (invite.status !== 'used' || !invite.used_by) {
        // Not redeemed yet
        invites.push({
          code: invite.code,
          status: invite.status,
          created_at: invite.created_at,
          quality: null
        });
        continue;
      }

      totalRedeemed++;

      // Check quality metrics for the invited user
      const invitedHandle = invite.used_by;
      const invitedRecord = await kv.hget('vibe:handles', invitedHandle);
      const invitedData = invitedRecord ?
        (typeof invitedRecord === 'string' ? JSON.parse(invitedRecord) : invitedRecord) : null;

      // Check if they stayed (last active within threshold)
      const lastActive = invitedData?.last_active_at ? new Date(invitedData.last_active_at).getTime() : 0;
      const usedAt = invite.used_at ? new Date(invite.used_at).getTime() : 0;
      const stayed = lastActive > 0 && (now - usedAt > sevenDaysMs) && (now - lastActive < sevenDaysMs * 2);

      // Check if they shipped (board posts)
      const boardPosts = await kv.lrange(`board:user:${invitedHandle}`, 0, 10) || [];
      const shippedPosts = [];
      for (const postId of boardPosts) {
        const post = await kv.get(`board:entry:${postId}`);
        if (post) {
          const postData = typeof post === 'string' ? JSON.parse(post) : post;
          if (postData.category === 'shipped') {
            shippedPosts.push(postId);
          }
        }
      }
      const shipped = shippedPosts.length >= QUALITY_THRESHOLDS.shipped_count;

      // Check if they invited others
      const theirCodes = await kv.smembers(`vibe:invites:by:${invitedHandle}`) || [];
      let theirRedeemed = 0;
      for (const theirCode of theirCodes) {
        const theirCodeData = await kv.hget('vibe:invites', theirCode);
        if (theirCodeData) {
          const parsed = typeof theirCodeData === 'string' ? JSON.parse(theirCodeData) : theirCodeData;
          if (parsed.status === 'used') theirRedeemed++;
        }
      }
      const invited = theirRedeemed >= QUALITY_THRESHOLDS.invited_count;

      // Calculate quality score
      const qualityScore = (stayed ? 1 : 0) + (shipped ? 2 : 0) + (invited ? 2 : 0);
      const isQuality = qualityScore >= 2; // At least stayed+shipped or just shipped+invited

      if (isQuality) qualityCount++;

      invites.push({
        code: invite.code,
        status: 'redeemed',
        used_by: invitedHandle,
        used_at: invite.used_at,
        quality: {
          stayed,
          shipped,
          invited,
          score: qualityScore,
          is_quality: isQuality
        }
      });
    }

    // Determine reward tier
    let currentTier = null;
    let nextTier = null;
    let bonusCodesEarned = 0;
    let badges = [];

    for (const [tierName, tier] of Object.entries(REWARD_TIERS)) {
      if (qualityCount >= tier.quality_invites) {
        currentTier = tierName;
        bonusCodesEarned = tier.bonus_codes;
        badges.push(tier.badge);
      } else if (!nextTier) {
        nextTier = {
          name: tierName,
          needed: tier.quality_invites - qualityCount,
          reward: tier.bonus_codes
        };
      }
    }

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'private, max-age=300');

    return res.status(200).json({
      success: true,
      handle: normalizedHandle,
      stats: {
        total_codes: codelist.length,
        total_redeemed: totalRedeemed,
        quality_invites: qualityCount,
        conversion_rate: codelist.length > 0 ? Math.round((totalRedeemed / codelist.length) * 100) : 0,
        quality_rate: totalRedeemed > 0 ? Math.round((qualityCount / totalRedeemed) * 100) : 0
      },
      rewards: {
        current_tier: currentTier,
        bonus_codes_earned: bonusCodesEarned,
        badges,
        next_tier: nextTier
      },
      invites: invites.sort((a, b) => {
        // Quality invites first, then by date
        if (a.quality?.is_quality && !b.quality?.is_quality) return -1;
        if (!a.quality?.is_quality && b.quality?.is_quality) return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }),
      thresholds: QUALITY_THRESHOLDS,
      tiers: REWARD_TIERS
    });

  } catch (e) {
    console.error('[invites/rewards] Error:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get rewards',
      message: e.message
    });
  }
}
