/**
 * /api/patterns/leaderboard
 *
 * GET /api/patterns/leaderboard
 * GET /api/patterns/leaderboard?metric=success_rate
 * GET /api/patterns/leaderboard?metric=sessions
 * GET /api/patterns/leaderboard?metric=streak
 * GET /api/patterns/leaderboard?skill=typescript
 *
 * Pattern-based leaderboards showing top developers by various metrics.
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

  const { metric = 'sessions', skill, limit = 25, minSessions = 5 } = req.query;

  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured'
    });
  }

  try {
    let results;
    const minSessionsInt = parseInt(minSessions);
    const limitInt = parseInt(limit);
    const normalizedSkill = skill ? skill.toLowerCase() : null;

    switch (metric) {
      case 'success_rate':
        // Top users by success rate (min sessions required)
        if (normalizedSkill) {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
              ROUND((COUNT(*) FILTER (WHERE inferred_outcome = 'success')::numeric / COUNT(*)) * 100) as success_rate,
              SUM(cost_usd) as total_cost,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            WHERE tech_stack @> ${JSON.stringify([normalizedSkill])}::jsonb
            GROUP BY user_handle
            HAVING COUNT(*) >= ${minSessionsInt}
            ORDER BY success_rate DESC, total_sessions DESC
            LIMIT ${limitInt}
          `;
        } else {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
              ROUND((COUNT(*) FILTER (WHERE inferred_outcome = 'success')::numeric / COUNT(*)) * 100) as success_rate,
              SUM(cost_usd) as total_cost,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            GROUP BY user_handle
            HAVING COUNT(*) >= ${minSessionsInt}
            ORDER BY success_rate DESC, total_sessions DESC
            LIMIT ${limitInt}
          `;
        }
        break;

      case 'efficiency':
        // Top users by cost efficiency (lowest cost per successful session)
        if (normalizedSkill) {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
              SUM(cost_usd) as total_cost,
              CASE
                WHEN COUNT(*) FILTER (WHERE inferred_outcome = 'success') > 0
                THEN ROUND((SUM(cost_usd) / COUNT(*) FILTER (WHERE inferred_outcome = 'success'))::numeric, 2)
                ELSE NULL
              END as cost_per_success,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            WHERE tech_stack @> ${JSON.stringify([normalizedSkill])}::jsonb
            GROUP BY user_handle
            HAVING COUNT(*) FILTER (WHERE inferred_outcome = 'success') >= ${minSessionsInt}
            ORDER BY cost_per_success ASC NULLS LAST, success_count DESC
            LIMIT ${limitInt}
          `;
        } else {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
              SUM(cost_usd) as total_cost,
              CASE
                WHEN COUNT(*) FILTER (WHERE inferred_outcome = 'success') > 0
                THEN ROUND((SUM(cost_usd) / COUNT(*) FILTER (WHERE inferred_outcome = 'success'))::numeric, 2)
                ELSE NULL
              END as cost_per_success,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            GROUP BY user_handle
            HAVING COUNT(*) FILTER (WHERE inferred_outcome = 'success') >= ${minSessionsInt}
            ORDER BY cost_per_success ASC NULLS LAST, success_count DESC
            LIMIT ${limitInt}
          `;
        }
        break;

      case 'volume':
        // Top users by total tokens processed
        if (normalizedSkill) {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              SUM(tokens_in + tokens_out) as total_tokens,
              SUM(cost_usd) as total_cost,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            WHERE tech_stack @> ${JSON.stringify([normalizedSkill])}::jsonb
            GROUP BY user_handle
            HAVING COUNT(*) >= ${minSessionsInt}
            ORDER BY total_tokens DESC
            LIMIT ${limitInt}
          `;
        } else {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              SUM(tokens_in + tokens_out) as total_tokens,
              SUM(cost_usd) as total_cost,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            GROUP BY user_handle
            HAVING COUNT(*) >= ${minSessionsInt}
            ORDER BY total_tokens DESC
            LIMIT ${limitInt}
          `;
        }
        break;

      case 'recent':
        // Most active in the last 7 days
        if (normalizedSkill) {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
              MAX(enriched_at) as last_session,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            WHERE enriched_at > NOW() - INTERVAL '7 days'
              AND tech_stack @> ${JSON.stringify([normalizedSkill])}::jsonb
            GROUP BY user_handle
            ORDER BY total_sessions DESC, last_session DESC
            LIMIT ${limitInt}
          `;
        } else {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
              MAX(enriched_at) as last_session,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            WHERE enriched_at > NOW() - INTERVAL '7 days'
            GROUP BY user_handle
            ORDER BY total_sessions DESC, last_session DESC
            LIMIT ${limitInt}
          `;
        }
        break;

      case 'sessions':
      default:
        // Top users by total sessions
        if (normalizedSkill) {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
              ROUND((COUNT(*) FILTER (WHERE inferred_outcome = 'success')::numeric / COUNT(*)) * 100) as success_rate,
              SUM(cost_usd) as total_cost,
              SUM(tokens_in + tokens_out) as total_tokens,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            WHERE tech_stack @> ${JSON.stringify([normalizedSkill])}::jsonb
            GROUP BY user_handle
            HAVING COUNT(*) >= ${minSessionsInt}
            ORDER BY total_sessions DESC
            LIMIT ${limitInt}
          `;
        } else {
          results = await sql`
            SELECT
              user_handle,
              COUNT(*) as total_sessions,
              COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
              ROUND((COUNT(*) FILTER (WHERE inferred_outcome = 'success')::numeric / COUNT(*)) * 100) as success_rate,
              SUM(cost_usd) as total_cost,
              SUM(tokens_in + tokens_out) as total_tokens,
              array_agg(DISTINCT tech_elem) FILTER (WHERE tech_elem IS NOT NULL) as tech_stack
            FROM session_enrichments
            LEFT JOIN LATERAL jsonb_array_elements_text(tech_stack) as tech_elem ON true
            GROUP BY user_handle
            HAVING COUNT(*) >= ${minSessionsInt}
            ORDER BY total_sessions DESC
            LIMIT ${limitInt}
          `;
        }
        break;
    }

    // Format results
    const leaderboard = results.map((r, index) => ({
      rank: index + 1,
      handle: r.user_handle,
      sessions: r.total_sessions,
      successCount: r.success_count || 0,
      successRate: r.success_rate ? parseInt(r.success_rate) : null,
      totalCost: r.total_cost ? Math.round(r.total_cost * 100) / 100 : null,
      totalTokens: r.total_tokens || null,
      costPerSuccess: r.cost_per_success ? parseFloat(r.cost_per_success) : null,
      lastSession: r.last_session || null,
      techStack: (r.tech_stack || []).filter(Boolean).slice(0, 5)
    }));

    // Get global stats
    const globalStats = await sql`
      SELECT
        COUNT(DISTINCT user_handle) as total_users,
        COUNT(*) as total_sessions,
        SUM(cost_usd) as total_cost,
        ROUND(AVG(CASE WHEN inferred_outcome = 'success' THEN 1 ELSE 0 END) * 100) as avg_success_rate
      FROM session_enrichments
    `;

    return res.status(200).json({
      success: true,
      metric,
      skill: skill || null,
      leaderboard,
      stats: {
        totalUsers: globalStats[0]?.total_users || 0,
        totalSessions: globalStats[0]?.total_sessions || 0,
        totalCost: globalStats[0]?.total_cost ? Math.round(globalStats[0].total_cost * 100) / 100 : 0,
        avgSuccessRate: globalStats[0]?.avg_success_rate ? parseInt(globalStats[0].avg_success_rate) : 0
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[patterns/leaderboard] Error:', error?.message || error);

    // Return error details for debugging
    return res.status(500).json({
      success: false,
      error: 'Failed to generate leaderboard',
      debug: error?.message || String(error)
    });
  }
}

