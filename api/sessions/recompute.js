/**
 * /api/sessions/recompute
 *
 * Recompute user_session_stats from session_enrichments.
 * Use this to fix stats after edits/backfills or to rebuild from scratch.
 *
 * Modes:
 * - Single user: POST { userHandle: "seth" }
 * - All users: POST { all: true } (admin only, requires secret)
 */

import { sql, isConfigured } from '../lib/db.js';

// Admin secret for full recompute
const ADMIN_SECRET = process.env.VIBE_ADMIN_SECRET || process.env.VIBE_SYSTEM_SECRET;

/**
 * Normalize a user handle to lowercase without @ prefix
 */
function normalizeHandle(handle) {
  if (!handle) return '';
  return handle.toLowerCase().replace(/^@/, '').trim();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isConfigured()) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const { userHandle: rawUserHandle, all, adminSecret } = req.body || {};

    // Full recompute requires admin secret
    if (all) {
      if (!ADMIN_SECRET || adminSecret !== ADMIN_SECRET) {
        return res.status(401).json({ error: 'Admin secret required for full recompute' });
      }

      const result = await recomputeAllStats();
      return res.status(200).json({
        success: true,
        message: `Recomputed stats for ${result.usersUpdated} users`,
        ...result
      });
    }

    // Single user recompute
    if (!rawUserHandle) {
      return res.status(400).json({ error: 'Missing userHandle' });
    }

    const userHandle = normalizeHandle(rawUserHandle);
    const result = await recomputeUserStats(userHandle);

    return res.status(200).json({
      success: true,
      userHandle,
      ...result
    });

  } catch (error) {
    console.error('[sessions/recompute] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Recompute stats for a single user
 */
async function recomputeUserStats(userHandle) {
  // Aggregate all sessions for this user
  const stats = await sql`
    SELECT
      COUNT(*) as total_sessions,
      COALESCE(SUM(tokens_in), 0) as total_tokens_in,
      COALESCE(SUM(tokens_out), 0) as total_tokens_out,
      COALESCE(SUM(cost_usd), 0) as total_cost_usd,
      COUNT(*) FILTER (WHERE problem_type = 'bugfix') as bugfix_count,
      COUNT(*) FILTER (WHERE problem_type = 'feature') as feature_count,
      COUNT(*) FILTER (WHERE problem_type = 'refactor') as refactor_count,
      COUNT(*) FILTER (WHERE problem_type = 'explore') as explore_count,
      COUNT(*) FILTER (WHERE inferred_outcome = 'success') as success_count,
      COUNT(*) FILTER (WHERE inferred_outcome = 'partial') as partial_count,
      COUNT(*) FILTER (WHERE inferred_outcome = 'failed') as failed_count,
      MIN(session_ended_at) as first_session_at,
      MAX(session_ended_at) as last_session_at
    FROM session_enrichments
    WHERE user_handle = ${userHandle}
  `;

  if (stats.length === 0 || stats[0].total_sessions === '0') {
    // No sessions - delete stats if they exist
    await sql`DELETE FROM user_session_stats WHERE user_handle = ${userHandle}`;
    return { sessionsFound: 0, action: 'deleted' };
  }

  const s = stats[0];

  // Get top tech (aggregate tech_stack arrays)
  const techAgg = await sql`
    SELECT tech, COUNT(*) as count
    FROM session_enrichments, jsonb_array_elements_text(tech_stack) as tech
    WHERE user_handle = ${userHandle}
    GROUP BY tech
    ORDER BY count DESC
    LIMIT 10
  `;
  const topTech = techAgg.map(t => t.tech);

  // Upsert stats
  await sql`
    INSERT INTO user_session_stats (
      user_handle,
      total_sessions,
      total_tokens_in,
      total_tokens_out,
      total_cost_usd,
      bugfix_count,
      feature_count,
      refactor_count,
      explore_count,
      success_count,
      partial_count,
      failed_count,
      top_tech,
      first_session_at,
      last_session_at,
      updated_at
    ) VALUES (
      ${userHandle},
      ${s.total_sessions},
      ${s.total_tokens_in},
      ${s.total_tokens_out},
      ${s.total_cost_usd},
      ${s.bugfix_count},
      ${s.feature_count},
      ${s.refactor_count},
      ${s.explore_count},
      ${s.success_count},
      ${s.partial_count},
      ${s.failed_count},
      ${JSON.stringify(topTech)}::jsonb,
      ${s.first_session_at},
      ${s.last_session_at},
      NOW()
    )
    ON CONFLICT (user_handle) DO UPDATE SET
      total_sessions = EXCLUDED.total_sessions,
      total_tokens_in = EXCLUDED.total_tokens_in,
      total_tokens_out = EXCLUDED.total_tokens_out,
      total_cost_usd = EXCLUDED.total_cost_usd,
      bugfix_count = EXCLUDED.bugfix_count,
      feature_count = EXCLUDED.feature_count,
      refactor_count = EXCLUDED.refactor_count,
      explore_count = EXCLUDED.explore_count,
      success_count = EXCLUDED.success_count,
      partial_count = EXCLUDED.partial_count,
      failed_count = EXCLUDED.failed_count,
      top_tech = EXCLUDED.top_tech,
      first_session_at = EXCLUDED.first_session_at,
      last_session_at = EXCLUDED.last_session_at,
      updated_at = NOW()
  `;

  return {
    sessionsFound: parseInt(s.total_sessions),
    action: 'updated',
    stats: {
      totalSessions: parseInt(s.total_sessions),
      totalTokens: parseInt(s.total_tokens_in) + parseInt(s.total_tokens_out),
      successRate: parseInt(s.total_sessions) > 0
        ? (parseInt(s.success_count) / parseInt(s.total_sessions) * 100).toFixed(1) + '%'
        : 'N/A'
    }
  };
}

/**
 * Recompute stats for ALL users (admin operation)
 */
async function recomputeAllStats() {
  // Get all distinct user handles
  const users = await sql`
    SELECT DISTINCT user_handle FROM session_enrichments
  `;

  let usersUpdated = 0;
  let usersDeleted = 0;
  const errors = [];

  for (const row of users) {
    try {
      const result = await recomputeUserStats(row.user_handle);
      if (result.action === 'updated') usersUpdated++;
      else if (result.action === 'deleted') usersDeleted++;
    } catch (e) {
      errors.push({ user: row.user_handle, error: e.message });
    }
  }

  // Clean up orphaned stats (users with no sessions)
  const orphaned = await sql`
    DELETE FROM user_session_stats
    WHERE user_handle NOT IN (SELECT DISTINCT user_handle FROM session_enrichments)
    RETURNING user_handle
  `;
  usersDeleted += orphaned.length;

  return {
    usersUpdated,
    usersDeleted,
    errors: errors.length > 0 ? errors : undefined
  };
}
