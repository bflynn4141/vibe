/**
 * /api/patterns/user
 *
 * GET /api/patterns/user?handle=seth
 *
 * Returns aggregated coding patterns for a user based on their sessions.
 * This is the "treasure trove" - extracting HOW people code with AI.
 *
 * Patterns extracted:
 * - Tech stack preferences (weighted by recency)
 * - Problem type distribution (bugfix, feature, refactor, explore)
 * - Success rate and trends
 * - Session cadence (avg duration, sessions per day)
 * - Tool usage patterns
 * - Prompting style inference
 */

import { sql, isConfigured } from '../lib/db.js';
import { sanitizeHandle } from '../lib/sanitize.js';

/**
 * Calculate prompting style from session data
 * - "spec-first": High tool usage, longer sessions, high success
 * - "iterative": Many short sessions, trial-and-error
 * - "explorer": More explore/refactor, varied outcomes
 * - "surgeon": Short, focused, high success bugfixes
 */
function inferPromptingStyle(stats) {
  const { avgDuration, successRate, problemTypes, avgToolsPerSession } = stats;

  // Surgeon: short focused sessions, high success, mainly bugfixes
  if (avgDuration < 1800 && successRate > 0.8 && (problemTypes.bugfix || 0) > 0.4) {
    return { style: 'surgeon', description: 'Focused, precise interventions' };
  }

  // Spec-first: longer sessions, high tool usage, high success
  if (avgDuration > 3600 && avgToolsPerSession > 50 && successRate > 0.7) {
    return { style: 'spec-first', description: 'Detailed specs, thorough execution' };
  }

  // Explorer: varied problem types, explore/refactor heavy
  if ((problemTypes.explore || 0) + (problemTypes.refactor || 0) > 0.5) {
    return { style: 'explorer', description: 'Discovery-driven, experimental' };
  }

  // Iterative: default for most
  return { style: 'iterative', description: 'Quick cycles, rapid refinement' };
}

/**
 * Calculate expertise level from patterns
 */
function calculateExpertiseLevel(totalSessions, successRate, avgCost) {
  let score = 0;

  // Volume contribution (max 30 points)
  score += Math.min(30, totalSessions * 2);

  // Success rate contribution (max 40 points)
  score += successRate * 40;

  // Efficiency contribution - lower cost per session = higher efficiency (max 30 points)
  const efficiencyScore = Math.max(0, 30 - (avgCost * 10));
  score += efficiencyScore;

  if (score >= 80) return { level: 'expert', score };
  if (score >= 60) return { level: 'advanced', score };
  if (score >= 40) return { level: 'intermediate', score };
  if (score >= 20) return { level: 'learning', score };
  return { level: 'beginner', score };
}

/**
 * Get top N items from a frequency map
 */
function getTopN(map, n = 5) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ name: key, count }));
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

  const { handle } = req.query;

  if (!handle) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: handle'
    });
  }

  const handleResult = sanitizeHandle(handle);
  if (!handleResult.valid) {
    return res.status(400).json({
      success: false,
      error: handleResult.error
    });
  }
  const normalizedHandle = handleResult.sanitized;

  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured'
    });
  }

  try {
    // Get all sessions for this user
    const sessions = await sql`
      SELECT
        session_id,
        tech_stack,
        problem_type,
        inferred_outcome,
        tokens_in,
        tokens_out,
        cost_usd,
        tool_counts,
        phase_reached,
        files_touched,
        session_started_at,
        session_ended_at,
        created_at
      FROM session_enrichments
      WHERE user_handle = ${normalizedHandle}
      ORDER BY created_at DESC
    `;

    if (sessions.length === 0) {
      return res.status(200).json({
        success: true,
        handle: normalizedHandle,
        patterns: null,
        message: 'No sessions found for this user'
      });
    }

    // Aggregate tech stacks (recent sessions weighted higher)
    const techStackCounts = {};
    const problemTypeCounts = {};
    let successCount = 0;
    let partialCount = 0;
    let totalDuration = 0;
    let totalCost = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    const toolUsage = {};
    const fileExtensions = {};
    let sessionsWithDuration = 0;

    sessions.forEach((session, index) => {
      // Weight for recency (newer sessions count more)
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
      else if (session.inferred_outcome === 'partial') partialCount++;

      // Duration
      if (session.session_started_at && session.session_ended_at) {
        const start = new Date(session.session_started_at);
        const end = new Date(session.session_ended_at);
        const duration = (end - start) / 1000; // seconds
        if (duration > 0 && duration < 86400) { // sanity check: less than 24h
          totalDuration += duration;
          sessionsWithDuration++;
        }
      }

      // Cost and tokens
      totalCost += session.cost_usd || 0;
      totalTokensIn += session.tokens_in || 0;
      totalTokensOut += session.tokens_out || 0;

      // Tool usage
      if (session.tool_counts && typeof session.tool_counts === 'object') {
        Object.entries(session.tool_counts).forEach(([tool, count]) => {
          toolUsage[tool] = (toolUsage[tool] || 0) + count;
        });
      }

      // File extensions from files touched
      if (session.files_touched && Array.isArray(session.files_touched)) {
        session.files_touched.forEach(file => {
          const ext = file.split('.').pop()?.toLowerCase();
          if (ext && ext.length <= 10) {
            fileExtensions[ext] = (fileExtensions[ext] || 0) + 1;
          }
        });
      }
    });

    // Calculate derived stats
    const totalSessions = sessions.length;
    const successRate = totalSessions > 0 ? successCount / totalSessions : 0;
    const avgDuration = sessionsWithDuration > 0 ? totalDuration / sessionsWithDuration : 0;
    const avgCost = totalSessions > 0 ? totalCost / totalSessions : 0;
    const totalTools = Object.values(toolUsage).reduce((a, b) => a + b, 0);
    const avgToolsPerSession = totalSessions > 0 ? totalTools / totalSessions : 0;

    // Problem type distribution (as percentages)
    const problemTypeDistribution = {};
    Object.entries(problemTypeCounts).forEach(([type, count]) => {
      problemTypeDistribution[type] = count / totalSessions;
    });

    // Calculate style and expertise
    const promptingStyle = inferPromptingStyle({
      avgDuration,
      successRate,
      problemTypes: problemTypeDistribution,
      avgToolsPerSession
    });

    const expertise = calculateExpertiseLevel(totalSessions, successRate, avgCost);

    // Calculate session cadence
    let sessionsPerWeek = 0;
    if (sessions.length >= 2) {
      const newest = new Date(sessions[0].created_at);
      const oldest = new Date(sessions[sessions.length - 1].created_at);
      const daysDiff = (newest - oldest) / (1000 * 60 * 60 * 24);
      if (daysDiff > 0) {
        sessionsPerWeek = (sessions.length / daysDiff) * 7;
      }
    }

    // Build patterns response
    const patterns = {
      // Core stats
      totalSessions,
      successRate: Math.round(successRate * 100),
      partialRate: Math.round((partialCount / totalSessions) * 100),

      // Tech preferences
      topTechStack: getTopN(techStackCounts, 8),
      topFileTypes: getTopN(fileExtensions, 6),

      // Work style
      problemTypeDistribution,
      primaryFocus: Object.entries(problemTypeCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',

      // Session metrics
      avgSessionDuration: Math.round(avgDuration / 60), // in minutes
      avgCostPerSession: Math.round(avgCost * 100) / 100,
      avgTokensPerSession: Math.round((totalTokensIn + totalTokensOut) / totalSessions),
      sessionsPerWeek: Math.round(sessionsPerWeek * 10) / 10,

      // Tool usage
      topTools: getTopN(toolUsage, 6),
      avgToolsPerSession: Math.round(avgToolsPerSession),

      // Derived insights
      promptingStyle,
      expertise,

      // Totals
      totalTokensUsed: totalTokensIn + totalTokensOut,
      totalCostUsd: Math.round(totalCost * 100) / 100,
      totalDurationHours: Math.round(totalDuration / 3600 * 10) / 10
    };

    // Generate profile summary text
    const summaryParts = [];
    if (patterns.topTechStack.length > 0) {
      summaryParts.push(`Works primarily with ${patterns.topTechStack.slice(0, 3).map(t => t.name).join(', ')}`);
    }
    summaryParts.push(`${patterns.successRate}% success rate across ${totalSessions} sessions`);
    summaryParts.push(`${promptingStyle.style} style: ${promptingStyle.description}`);

    return res.status(200).json({
      success: true,
      handle: normalizedHandle,
      patterns,
      summary: summaryParts.join('. ') + '.',
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[patterns/user] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate patterns'
    });
  }
}
