/**
 * /api/patterns/discover
 *
 * GET /api/patterns/discover?skill=rust
 * GET /api/patterns/discover?problemType=bugfix
 * GET /api/patterns/discover?style=surgeon
 *
 * Discover users based on their coding patterns.
 * The foundation for "Who solved this?" and expertise matching.
 */

import { sql, isConfigured } from '../lib/db.js';

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

  const { skill, problemType, minSessions = 3, limit = 20 } = req.query;

  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured'
    });
  }

  try {
    let users;

    if (skill) {
      // Find users with expertise in a specific technology (tech_stack is JSONB)
      users = await sql`
        WITH user_stats AS (
          SELECT
            user_handle,
            COUNT(*) as total_sessions,
            COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
            SUM(cost_usd) as total_cost,
            array_agg(DISTINCT tech_elem) as all_tech
          FROM session_enrichments,
               LATERAL jsonb_array_elements_text(tech_stack) as tech_elem
          WHERE tech_stack @> ${JSON.stringify([skill.toLowerCase()])}::jsonb
          GROUP BY user_handle
          HAVING COUNT(*) >= ${parseInt(minSessions)}
        )
        SELECT
          user_handle,
          total_sessions,
          success_count,
          ROUND((success_count::numeric / total_sessions) * 100) as success_rate,
          total_cost,
          all_tech
        FROM user_stats
        ORDER BY total_sessions DESC, success_count DESC
        LIMIT ${parseInt(limit)}
      `;
    } else if (problemType) {
      // Find users who excel at a specific problem type
      const validTypes = ['bugfix', 'feature', 'refactor', 'explore', 'test', 'deploy', 'config'];
      if (!validTypes.includes(problemType.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: `Invalid problemType. Valid types: ${validTypes.join(', ')}`
        });
      }

      users = await sql`
        WITH user_stats AS (
          SELECT
            user_handle,
            COUNT(*) as total_sessions,
            COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
            array_agg(DISTINCT tech_elem) as all_tech
          FROM session_enrichments,
               LATERAL jsonb_array_elements_text(tech_stack) as tech_elem
          WHERE problem_type = ${problemType.toLowerCase()}
          GROUP BY user_handle
          HAVING COUNT(*) >= ${parseInt(minSessions)}
        )
        SELECT
          user_handle,
          total_sessions,
          success_count,
          ROUND((success_count::numeric / total_sessions) * 100) as success_rate,
          all_tech
        FROM user_stats
        ORDER BY success_count DESC, total_sessions DESC
        LIMIT ${parseInt(limit)}
      `;
    } else {
      // Return top users by session count
      users = await sql`
        WITH user_stats AS (
          SELECT
            user_handle,
            COUNT(*) as total_sessions,
            COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
            SUM(cost_usd) as total_cost,
            array_agg(DISTINCT tech_elem) as all_tech
          FROM session_enrichments,
               LATERAL jsonb_array_elements_text(tech_stack) as tech_elem
          GROUP BY user_handle
          HAVING COUNT(*) >= ${parseInt(minSessions)}
        )
        SELECT
          user_handle,
          total_sessions,
          success_count,
          ROUND((success_count::numeric / total_sessions) * 100) as success_rate,
          total_cost,
          all_tech
        FROM user_stats
        ORDER BY total_sessions DESC
        LIMIT ${parseInt(limit)}
      `;
    }

    // Format results
    const experts = users.map(u => ({
      handle: u.user_handle,
      sessions: u.total_sessions,
      successRate: parseInt(u.success_rate) || 0,
      techStack: (u.all_tech || []).slice(0, 6),
      totalCost: u.total_cost ? Math.round(u.total_cost * 100) / 100 : null
    }));

    return res.status(200).json({
      success: true,
      query: { skill, problemType, minSessions: parseInt(minSessions) },
      experts,
      count: experts.length
    });

  } catch (error) {
    console.error('[patterns/discover] Error:', error);

    // Check if it's a missing table error - return empty data gracefully
    if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
      return res.status(200).json({
        success: true,
        query: { skill, problemType, minSessions: parseInt(minSessions) },
        experts: [],
        count: 0,
        note: 'Session enrichments not yet available'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to discover patterns'
    });
  }
}
