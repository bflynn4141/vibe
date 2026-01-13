/**
 * User Profile API for vibe-terminal
 *
 * GET /api/profiles/:username - Get profile matching terminal's expected shape
 *
 * Returns:
 * {
 *   username: string,
 *   displayName?: string,
 *   avatarUrl?: string,
 *   bio?: string,
 *   stats: { totalSessions, totalHours, projectsShipped, karma },
 *   skills: [{ name, proficiency, hoursUsed }],
 *   badges: [{ id, name, rarity }],
 *   recentProjects: [{ name, languages[], createdAt }],
 *   availableForHire: boolean,
 *   hourlyRate?: number,
 *   completedGigs: number,
 *   gigRating?: number
 * }
 */

import { kv } from '@vercel/kv';

// Skill categories for proficiency calculation
const SKILL_CATEGORIES = {
  languages: ['javascript', 'typescript', 'python', 'rust', 'go', 'ruby', 'swift', 'kotlin', 'java', 'sql'],
  frameworks: ['react', 'vue', 'angular', 'nextjs', 'svelte', 'tailwind', 'express', 'django', 'rails'],
  ai_ml: ['ai', 'ml', 'llm', 'gpt', 'claude', 'langchain', 'rag', 'agents', 'mcp'],
  tools: ['git', 'docker', 'aws', 'vercel', 'supabase', 'postgres', 'redis', 'mongodb']
};

// Badge definitions based on activity
const BADGE_DEFINITIONS = [
  { id: 'genesis', name: 'Genesis', rarity: 'legendary', check: (u) => u.genesis },
  { id: 'first-100', name: 'First 100', rarity: 'epic', check: (u) => u.genesis && u.genesis_number <= 100 },
  { id: 'shipper', name: 'Shipper', rarity: 'rare', check: (u, s) => s.ships >= 5 },
  { id: 'prolific', name: 'Prolific', rarity: 'epic', check: (u, s) => s.ships >= 20 },
  { id: 'streak-7', name: 'Week Warrior', rarity: 'common', check: (u, s) => s.longestStreak >= 7 },
  { id: 'streak-30', name: 'Monthly Master', rarity: 'rare', check: (u, s) => s.longestStreak >= 30 },
  { id: 'gig-master', name: 'Gig Master', rarity: 'rare', check: (u, s) => s.completedGigs >= 5 }
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
    // Get user's handle record
    const handleRecord = await kv.hget('vibe:handles', username);
    if (!handleRecord) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = typeof handleRecord === 'string' ? JSON.parse(handleRecord) : handleRecord;

    // Get board posts for activity data
    const postIds = await kv.lrange(`board:user:${username}`, 0, 99) || [];
    const posts = [];
    const skillCounts = {};
    let shippedCount = 0;

    for (const postId of postIds) {
      const postData = await kv.get(`board:entry:${postId}`);
      if (postData) {
        const post = typeof postData === 'string' ? JSON.parse(postData) : postData;
        posts.push(post);

        if (post.category === 'shipped') {
          shippedCount++;
        }

        // Count skills from tags
        if (post.tags) {
          post.tags.forEach(tag => {
            const normalized = tag.toLowerCase();
            skillCounts[normalized] = (skillCounts[normalized] || 0) + 1;
          });
        }
      }
    }

    // Get streak data
    const streakData = await kv.get(`streak:${username}`) || { current: 0, longest: 0 };

    // Get gig history
    const gigIds = await kv.smembers(`vibe:gigs:by:${username}`) || [];
    let gigsCompleted = 0;
    let gigRatingSum = 0;
    let gigRatingCount = 0;

    for (const gigId of gigIds) {
      const gigData = await kv.hget('vibe:gigs', gigId);
      if (gigData) {
        const gig = typeof gigData === 'string' ? JSON.parse(gigData) : gigData;
        if (gig.status === 'completed') {
          gigsCompleted++;
          if (gig.rating) {
            gigRatingSum += gig.rating;
            gigRatingCount++;
          }
        }
      }
    }

    // Calculate skills with proficiency (1-5 based on usage count)
    const skills = Object.entries(skillCounts)
      .filter(([name]) => {
        const allSkills = Object.values(SKILL_CATEGORIES).flat();
        return allSkills.includes(name);
      })
      .map(([name, count]) => ({
        name,
        proficiency: Math.min(5, Math.ceil(count / 2)),
        hoursUsed: count * 2 // Estimate 2 hours per usage
      }))
      .sort((a, b) => b.proficiency - a.proficiency)
      .slice(0, 10);

    // Calculate karma
    const karma = (shippedCount * 100) + (posts.length * 10) + (gigsCompleted * 500) + (streakData.longest * 5);

    // Determine badges
    const activityStats = {
      ships: shippedCount,
      longestStreak: streakData.longest || 0,
      completedGigs: gigsCompleted
    };

    const badges = BADGE_DEFINITIONS
      .filter(badge => badge.check(userData, activityStats))
      .map(({ id, name, rarity }) => ({ id, name, rarity }));

    // Recent projects (from shipped posts)
    const recentProjects = posts
      .filter(p => p.category === 'shipped')
      .slice(0, 5)
      .map(p => ({
        name: p.content?.substring(0, 50) || 'Untitled Project',
        languages: p.tags || [],
        createdAt: p.timestamp
      }));

    // Build profile response matching terminal's expected shape
    const profile = {
      username,
      displayName: userData.display_name || username,
      avatarUrl: userData.avatar_url || null,
      bio: userData.bio || null,
      stats: {
        totalSessions: posts.length,
        totalHours: posts.length * 2, // Estimate
        projectsShipped: shippedCount,
        karma
      },
      skills,
      badges,
      recentProjects,
      availableForHire: userData.available_for_hire !== false,
      hourlyRate: userData.hourly_rate || null,
      completedGigs: gigsCompleted,
      gigRating: gigRatingCount > 0 ? Math.round(gigRatingSum / gigRatingCount * 10) / 10 : null
    };

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300');

    return res.status(200).json({
      success: true,
      ...profile
    });

  } catch (e) {
    console.error('[profiles] Error:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get profile',
      message: e.message
    });
  }
}
