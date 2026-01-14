/**
 * User Profile API for vibe-terminal
 *
 * GET /api/profiles/:username - Get profile matching terminal's expected shape
 *
 * Enhanced with pattern data from session_enrichments:
 * - Prompting style (surgeon, spec-first, explorer, iterative)
 * - Tech stack preferences with recency weighting
 * - Expertise badges based on usage patterns
 * - Success rate and efficiency metrics
 *
 * Returns:
 * {
 *   username: string,
 *   displayName?: string,
 *   avatarUrl?: string,
 *   bio?: string,
 *   stats: { totalSessions, totalHours, projectsShipped, karma, successRate },
 *   skills: [{ name, proficiency, hoursUsed }],
 *   badges: [{ id, name, rarity }],
 *   recentProjects: [{ name, languages[], createdAt }],
 *   patterns: { style, expertise, techStack, problemFocus },
 *   availableForHire: boolean,
 *   hourlyRate?: number,
 *   completedGigs: number,
 *   gigRating?: number
 * }
 */

import { kv } from '@vercel/kv';
import { sql, isConfigured } from '../lib/db.js';

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

// Pattern-based badge definitions (from session_enrichments)
const PATTERN_BADGES = [
  { id: 'surgeon', name: 'Surgeon', rarity: 'epic', check: (p) => p?.promptingStyle?.style === 'surgeon' },
  { id: 'architect', name: 'Architect', rarity: 'epic', check: (p) => p?.promptingStyle?.style === 'spec-first' },
  { id: 'explorer', name: 'Explorer', rarity: 'rare', check: (p) => p?.promptingStyle?.style === 'explorer' },
  { id: 'expert', name: 'Expert', rarity: 'legendary', check: (p) => p?.expertise?.level === 'expert' },
  { id: 'advanced', name: 'Advanced', rarity: 'epic', check: (p) => p?.expertise?.level === 'advanced' },
  { id: 'efficient', name: 'Cost Efficient', rarity: 'rare', check: (p) => p?.avgCostPerSession < 0.50 && p?.totalSessions >= 10 },
  { id: 'high-success', name: 'High Success', rarity: 'rare', check: (p) => p?.successRate >= 80 && p?.totalSessions >= 10 },
  { id: 'polyglot', name: 'Polyglot', rarity: 'epic', check: (p) => p?.topTechStack?.length >= 5 },
  { id: 'rust-native', name: 'Rustacean', rarity: 'rare', check: (p) => p?.topTechStack?.some(t => t.name === 'rust') },
  { id: 'ts-native', name: 'TypeScript Pro', rarity: 'common', check: (p) => p?.topTechStack?.some(t => t.name === 'typescript') }
];

/**
 * Fetch coding patterns from session_enrichments database
 */
async function fetchPatternData(handle) {
  if (!isConfigured()) return null;

  try {
    const sessions = await sql`
      SELECT
        tech_stack,
        problem_type,
        inferred_outcome,
        tokens_in,
        tokens_out,
        cost_usd,
        tool_counts,
        session_started_at,
        session_ended_at,
        created_at
      FROM session_enrichments
      WHERE user_handle = ${handle}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    if (sessions.length === 0) return null;

    // Aggregate tech stacks (recent sessions weighted higher)
    const techStackCounts = {};
    const problemTypeCounts = {};
    let successCount = 0;
    let totalDuration = 0;
    let totalCost = 0;
    let sessionsWithDuration = 0;
    const toolUsage = {};

    sessions.forEach((session, index) => {
      const recencyWeight = 1 + (sessions.length - index) / sessions.length;

      // Tech stack
      if (session.tech_stack && Array.isArray(session.tech_stack)) {
        session.tech_stack.forEach(tech => {
          techStackCounts[tech] = (techStackCounts[tech] || 0) + recencyWeight;
        });
      }

      // Problem types
      if (session.problem_type) {
        problemTypeCounts[session.problem_type] = (problemTypeCounts[session.problem_type] || 0) + 1;
      }

      // Outcomes
      if (session.inferred_outcome === 'success') successCount++;

      // Duration
      if (session.session_started_at && session.session_ended_at) {
        const start = new Date(session.session_started_at);
        const end = new Date(session.session_ended_at);
        const duration = (end - start) / 1000;
        if (duration > 0 && duration < 86400) {
          totalDuration += duration;
          sessionsWithDuration++;
        }
      }

      // Cost
      totalCost += session.cost_usd || 0;

      // Tool usage
      if (session.tool_counts && typeof session.tool_counts === 'object') {
        Object.entries(session.tool_counts).forEach(([tool, count]) => {
          toolUsage[tool] = (toolUsage[tool] || 0) + count;
        });
      }
    });

    const totalSessions = sessions.length;
    const successRate = totalSessions > 0 ? Math.round((successCount / totalSessions) * 100) : 0;
    const avgDuration = sessionsWithDuration > 0 ? totalDuration / sessionsWithDuration : 0;
    const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0;
    const totalTools = Object.values(toolUsage).reduce((a, b) => a + b, 0);
    const avgToolsPerSession = totalSessions > 0 ? totalTools / totalSessions : 0;

    // Problem type distribution
    const problemTypeDistribution = {};
    Object.entries(problemTypeCounts).forEach(([type, count]) => {
      problemTypeDistribution[type] = count / totalSessions;
    });

    // Infer prompting style
    let promptingStyle;
    if (avgDuration < 1800 && successRate > 80 && (problemTypeDistribution.bugfix || 0) > 0.4) {
      promptingStyle = { style: 'surgeon', description: 'Focused, precise interventions' };
    } else if (avgDuration > 3600 && avgToolsPerSession > 50 && successRate > 70) {
      promptingStyle = { style: 'spec-first', description: 'Detailed specs, thorough execution' };
    } else if ((problemTypeDistribution.explore || 0) + (problemTypeDistribution.refactor || 0) > 0.5) {
      promptingStyle = { style: 'explorer', description: 'Discovery-driven, experimental' };
    } else {
      promptingStyle = { style: 'iterative', description: 'Quick cycles, rapid refinement' };
    }

    // Calculate expertise level
    let expertiseScore = 0;
    expertiseScore += Math.min(30, totalSessions * 2);
    expertiseScore += (successRate / 100) * 40;
    expertiseScore += Math.max(0, 30 - (avgCost * 10));

    let expertise;
    if (expertiseScore >= 80) expertise = { level: 'expert', score: expertiseScore };
    else if (expertiseScore >= 60) expertise = { level: 'advanced', score: expertiseScore };
    else if (expertiseScore >= 40) expertise = { level: 'intermediate', score: expertiseScore };
    else if (expertiseScore >= 20) expertise = { level: 'learning', score: expertiseScore };
    else expertise = { level: 'beginner', score: expertiseScore };

    // Top tech stack
    const topTechStack = Object.entries(techStackCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count: Math.round(count) }));

    // Primary problem focus
    const primaryFocus = Object.entries(problemTypeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    return {
      totalSessions,
      successRate,
      avgCostPerSession: Math.round(avgCost * 100) / 100,
      avgSessionDuration: Math.round(avgDuration / 60),
      promptingStyle,
      expertise,
      topTechStack,
      primaryFocus,
      problemTypeDistribution,
      totalCostUsd: Math.round(totalCost * 100) / 100
    };
  } catch (error) {
    console.error('[profiles] Pattern fetch error:', error.message);
    return null;
  }
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
    // Get user's handle record
    const handleRecord = await kv.hget('vibe:handles', username);
    if (!handleRecord) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = typeof handleRecord === 'string' ? JSON.parse(handleRecord) : handleRecord;

    // Fetch pattern data from session_enrichments (parallel with other queries)
    const patternDataPromise = fetchPatternData(username);

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

    // Await pattern data
    const patternData = await patternDataPromise;

    // Calculate karma (enhanced with pattern data)
    let karma = (shippedCount * 100) + (posts.length * 10) + (gigsCompleted * 500) + (streakData.longest * 5);
    if (patternData) {
      karma += patternData.totalSessions * 5;
      karma += Math.round(patternData.successRate * 2);
      if (patternData.expertise?.level === 'expert') karma += 500;
      else if (patternData.expertise?.level === 'advanced') karma += 250;
    }

    // Determine badges
    const activityStats = {
      ships: shippedCount,
      longestStreak: streakData.longest || 0,
      completedGigs: gigsCompleted
    };

    // Activity-based badges
    const activityBadges = BADGE_DEFINITIONS
      .filter(badge => badge.check(userData, activityStats))
      .map(({ id, name, rarity }) => ({ id, name, rarity }));

    // Pattern-based badges
    const patternBadges = patternData
      ? PATTERN_BADGES
          .filter(badge => badge.check(patternData))
          .map(({ id, name, rarity }) => ({ id, name, rarity }))
      : [];

    // Combine and dedupe badges
    const badges = [...activityBadges, ...patternBadges];

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
        totalSessions: patternData?.totalSessions || posts.length,
        totalHours: patternData?.avgSessionDuration
          ? Math.round((patternData.totalSessions * patternData.avgSessionDuration) / 60)
          : posts.length * 2,
        projectsShipped: shippedCount,
        karma,
        successRate: patternData?.successRate || null,
        totalCost: patternData?.totalCostUsd || null
      },
      skills,
      badges,
      recentProjects,
      // Pattern-derived insights (the treasure trove)
      patterns: patternData ? {
        style: patternData.promptingStyle,
        expertise: patternData.expertise,
        techStack: patternData.topTechStack,
        problemFocus: patternData.primaryFocus,
        avgSessionMinutes: patternData.avgSessionDuration,
        avgCostPerSession: patternData.avgCostPerSession
      } : null,
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
