/**
 * Karma API for vibe-terminal
 *
 * GET /api/karma/:username - Get karma score and breakdown
 *
 * Returns:
 * {
 *   karma: number,
 *   tier: "new" | "active" | "rising" | "pro" | "expert" | "master" | "legend",
 *   breakdown: { sessions, projects, helpGiven, gigs }
 * }
 *
 * Tier thresholds:
 * - Legend: 100,000+
 * - Master: 50,000+
 * - Expert: 20,000+
 * - Pro: 10,000+
 * - Rising: 5,000+
 * - Active: 1,000+
 * - New: 0+
 */

import { kv } from '@vercel/kv';

// Karma tier thresholds
const KARMA_TIERS = [
  { tier: 'legend', min: 100000 },
  { tier: 'master', min: 50000 },
  { tier: 'expert', min: 20000 },
  { tier: 'pro', min: 10000 },
  { tier: 'rising', min: 5000 },
  { tier: 'active', min: 1000 },
  { tier: 'new', min: 0 }
];

function getTier(karma) {
  for (const { tier, min } of KARMA_TIERS) {
    if (karma >= min) return tier;
  }
  return 'new';
}

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

  // Extract username from URL path
  const urlPath = req.url?.split('?')[0] || '';
  const pathSegments = urlPath.split('/').filter(Boolean);
  const username = pathSegments[pathSegments.length - 1]?.toLowerCase().trim();

  if (!username) {
    return res.status(400).json({
      success: false,
      error: 'Username required'
    });
  }

  try {
    // Check user exists
    const handleRecord = await kv.hget('vibe:handles', username);
    if (!handleRecord) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = typeof handleRecord === 'string' ? JSON.parse(handleRecord) : handleRecord;

    // Get board posts (sessions/projects)
    const postIds = await kv.lrange(`board:user:${username}`, 0, 999) || [];
    let sessionsKarma = 0;
    let projectsKarma = 0;

    for (const postId of postIds) {
      const postData = await kv.get(`board:entry:${postId}`);
      if (postData) {
        const post = typeof postData === 'string' ? JSON.parse(postData) : postData;
        if (post.category === 'shipped') {
          projectsKarma += 100; // 100 karma per ship
        } else {
          sessionsKarma += 10; // 10 karma per other post
        }
      }
    }

    // Get streak bonus
    const streakData = await kv.get(`streak:${username}`) || { current: 0, longest: 0 };
    const streakKarma = (streakData.longest || 0) * 5; // 5 karma per day of longest streak

    // Get gig karma
    const gigIds = await kv.smembers(`vibe:gigs:by:${username}`) || [];
    let gigsKarma = 0;
    let completedGigs = 0;

    for (const gigId of gigIds) {
      const gigData = await kv.hget('vibe:gigs', gigId);
      if (gigData) {
        const gig = typeof gigData === 'string' ? JSON.parse(gigData) : gigData;
        if (gig.status === 'completed') {
          completedGigs++;
          gigsKarma += 500; // 500 karma per completed gig
        }
      }
    }

    // Get help given karma (from messages sent helping others)
    // For now, estimate from message count
    const messageCount = userData.messages_sent || 0;
    const helpGivenKarma = messageCount * 5; // 5 karma per message

    // Get invite karma (successful invites)
    const inviteCodes = await kv.smembers(`vibe:invites:by:${username}`) || [];
    let inviteKarma = 0;
    for (const code of inviteCodes) {
      const codeData = await kv.hget('vibe:invites', code);
      if (codeData) {
        const invite = typeof codeData === 'string' ? JSON.parse(codeData) : codeData;
        if (invite.status === 'used') {
          inviteKarma += 200; // 200 karma per successful invite
        }
      }
    }

    // Genesis bonus
    const genesisKarma = userData.genesis ? 1000 : 0;
    const founderKarma = (userData.genesis && userData.genesis_number <= 100) ? 5000 : 0;

    // Calculate total
    const totalKarma = sessionsKarma + projectsKarma + streakKarma + gigsKarma +
                       helpGivenKarma + inviteKarma + genesisKarma + founderKarma;

    const tier = getTier(totalKarma);

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300');

    return res.status(200).json({
      success: true,
      karma: totalKarma,
      tier,
      breakdown: {
        sessions: sessionsKarma + streakKarma,
        projects: projectsKarma,
        helpGiven: helpGivenKarma + inviteKarma,
        gigs: gigsKarma
      },
      details: {
        posts: postIds.length,
        completedGigs,
        longestStreak: streakData.longest || 0,
        successfulInvites: inviteCodes.filter(async c => {
          const d = await kv.hget('vibe:invites', c);
          return d && (typeof d === 'string' ? JSON.parse(d) : d).status === 'used';
        }).length,
        isGenesis: userData.genesis || false,
        isFounder: userData.genesis && userData.genesis_number <= 100
      }
    });

  } catch (e) {
    console.error('[karma] Error:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get karma',
      message: e.message
    });
  }
}
