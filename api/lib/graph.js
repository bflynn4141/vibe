/**
 * Social Graph Library
 *
 * Implements the "LinkedIn Principle": edges emerge from natural behavior.
 * No explicit friend requests - connections form automatically from:
 * - Messages sent/received
 * - Reactions to posts
 * - Comments on ships
 * - Following users
 *
 * Weight Algorithm:
 * - Each interaction type has a base weight
 * - Weights decay over time (95% weekly)
 * - Skill overlap adds bonus weight
 * - Capped at 100 to prevent runaway values
 */

import { sql } from './db.js';

// ============================================================
// Edge Weights Configuration
// ============================================================

export const EDGE_WEIGHTS = {
  message: 2.0,      // Direct communication = strong signal
  reaction: 0.5,     // Light engagement
  comment: 1.5,      // Public discussion
  collab: 3.0,       // Working together (future: shared projects)
  follow: 0.3,       // One-way interest
  board_post: 0.2    // Posted about same topics
};

export const SKILL_OVERLAP_BONUS = 0.2;  // Per shared skill
export const DECAY_FACTOR = 0.95;        // Weekly decay
export const MAX_WEIGHT = 100;           // Cap to prevent runaway values

// ============================================================
// Interaction Logging
// ============================================================

/**
 * Log an interaction and update graph edges
 *
 * @param {object} interaction - The interaction to log
 * @param {string} interaction.from - Source handle
 * @param {string} interaction.to - Target handle
 * @param {string} interaction.action - Interaction type (message, reaction, etc.)
 * @param {object} interaction.metadata - Additional data
 */
export async function logInteraction(interaction) {
  const { from, to, action, metadata = {} } = interaction;

  if (!from || !to || !action) {
    console.error('[graph] Invalid interaction:', interaction);
    return null;
  }

  // Don't log self-interactions
  if (from === to) {
    return null;
  }

  try {
    // 1. Log the raw interaction
    const [logged] = await sql`
      INSERT INTO interaction_log (from_handle, to_handle, action, metadata)
      VALUES (${from}, ${to}, ${action}, ${JSON.stringify(metadata)})
      RETURNING id, created_at
    `;

    // 2. Update edge weight using the DB function
    const baseWeight = EDGE_WEIGHTS[action] || 0.5;
    await sql`SELECT update_edge_weight(${from}, ${to}, ${action}, ${baseWeight})`;

    // 3. Update user context (connection count)
    await updateUserConnectionCount(from);

    return logged;
  } catch (e) {
    console.error('[graph] Failed to log interaction:', e.message);
    return null;
  }
}

/**
 * Update a user's connection count in user_context
 */
async function updateUserConnectionCount(handle) {
  try {
    await sql`
      INSERT INTO user_context (handle, total_connections, updated_at)
      VALUES (
        ${handle},
        (SELECT COUNT(DISTINCT to_handle) FROM graph_edges WHERE from_handle = ${handle}),
        NOW()
      )
      ON CONFLICT (handle) DO UPDATE SET
        total_connections = (SELECT COUNT(DISTINCT to_handle) FROM graph_edges WHERE from_handle = ${handle}),
        updated_at = NOW()
    `;
  } catch (e) {
    console.error('[graph] Failed to update connection count:', e.message);
  }
}

// ============================================================
// Graph Queries
// ============================================================

/**
 * Get a user's connections (weighted)
 *
 * @param {string} handle - User handle
 * @param {object} options - Query options
 * @param {number} options.limit - Max results (default 50)
 * @param {string} options.edgeType - Filter by edge type
 */
export async function getConnections(handle, options = {}) {
  const { limit = 50, edgeType = null } = options;

  try {
    if (edgeType) {
      return await sql`
        SELECT
          to_handle,
          edge_type,
          weight,
          interaction_count,
          last_interaction_at
        FROM graph_edges
        WHERE from_handle = ${handle}
          AND edge_type = ${edgeType}
        ORDER BY weight DESC
        LIMIT ${limit}
      `;
    }

    // Aggregate across edge types
    return await sql`
      SELECT
        to_handle,
        ARRAY_AGG(edge_type) as edge_types,
        SUM(weight) as total_weight,
        SUM(interaction_count) as total_interactions,
        MAX(last_interaction_at) as last_interaction_at
      FROM graph_edges
      WHERE from_handle = ${handle}
      GROUP BY to_handle
      ORDER BY total_weight DESC
      LIMIT ${limit}
    `;
  } catch (e) {
    console.error('[graph] Failed to get connections:', e.message);
    return [];
  }
}

/**
 * Get bidirectional connections (mutual)
 *
 * @param {string} handle - User handle
 * @param {number} limit - Max results
 */
export async function getMutualConnections(handle, limit = 50) {
  try {
    return await sql`
      SELECT
        e1.to_handle,
        e1.weight + e2.weight as mutual_weight,
        e1.weight as outgoing_weight,
        e2.weight as incoming_weight
      FROM graph_edges e1
      JOIN graph_edges e2 ON e1.to_handle = e2.from_handle AND e2.to_handle = e1.from_handle
      WHERE e1.from_handle = ${handle}
      ORDER BY mutual_weight DESC
      LIMIT ${limit}
    `;
  } catch (e) {
    console.error('[graph] Failed to get mutual connections:', e.message);
    return [];
  }
}

/**
 * Discover users by skill
 *
 * @param {string} skill - Skill to search for
 * @param {string} excludeHandle - Handle to exclude from results
 * @param {number} limit - Max results
 */
export async function discoverBySkill(skill, excludeHandle = null, limit = 20) {
  try {
    return await sql`
      SELECT
        handle,
        skills,
        vibe_score,
        total_connections
      FROM user_context
      WHERE ${skill} = ANY(skills)
        AND (${excludeHandle}::TEXT IS NULL OR handle != ${excludeHandle})
      ORDER BY vibe_score DESC
      LIMIT ${limit}
    `;
  } catch (e) {
    console.error('[graph] Failed to discover by skill:', e.message);
    return [];
  }
}

/**
 * Get connection recommendations (friend-of-friend)
 *
 * @param {string} handle - User handle
 * @param {number} limit - Max recommendations
 */
export async function getRecommendations(handle, limit = 10) {
  try {
    return await sql`
      SELECT
        e2.to_handle as suggested_handle,
        COUNT(*) as mutual_count,
        SUM(e1.weight + e2.weight) as score
      FROM graph_edges e1
      JOIN graph_edges e2 ON e1.to_handle = e2.from_handle
      WHERE e1.from_handle = ${handle}
        AND e2.to_handle != ${handle}
        AND e2.to_handle NOT IN (
          SELECT to_handle FROM graph_edges WHERE from_handle = ${handle}
        )
      GROUP BY e2.to_handle
      ORDER BY score DESC
      LIMIT ${limit}
    `;
  } catch (e) {
    console.error('[graph] Failed to get recommendations:', e.message);
    return [];
  }
}

/**
 * Get 2-hop network (connections of connections)
 *
 * @param {string} handle - User handle
 * @param {number} limit - Max results per hop
 */
export async function getTwoHopNetwork(handle, limit = 20) {
  try {
    // First degree connections
    const firstDegree = await getConnections(handle, { limit });

    // Second degree (excluding first degree and self)
    const firstDegreeHandles = firstDegree.map(c => c.to_handle);

    const secondDegree = await sql`
      SELECT DISTINCT
        e.to_handle,
        e.from_handle as via_handle,
        e.weight
      FROM graph_edges e
      WHERE e.from_handle = ANY(${firstDegreeHandles})
        AND e.to_handle != ${handle}
        AND e.to_handle != ALL(${firstDegreeHandles})
      ORDER BY e.weight DESC
      LIMIT ${limit}
    `;

    return {
      firstDegree,
      secondDegree
    };
  } catch (e) {
    console.error('[graph] Failed to get 2-hop network:', e.message);
    return { firstDegree: [], secondDegree: [] };
  }
}

// ============================================================
// User Context Management
// ============================================================

/**
 * Update user context with skills and scores
 *
 * @param {string} handle - User handle
 * @param {object} context - Context data to update
 */
export async function updateUserContext(handle, context) {
  const { skills, dna, vibeScore } = context;

  try {
    await sql`
      INSERT INTO user_context (handle, skills, dna, vibe_score, updated_at)
      VALUES (
        ${handle},
        ${skills || []},
        ${JSON.stringify(dna || {})},
        ${vibeScore || 0},
        NOW()
      )
      ON CONFLICT (handle) DO UPDATE SET
        skills = COALESCE(${skills}, user_context.skills),
        dna = COALESCE(${JSON.stringify(dna)}, user_context.dna),
        vibe_score = COALESCE(${vibeScore}, user_context.vibe_score),
        updated_at = NOW()
    `;
    return true;
  } catch (e) {
    console.error('[graph] Failed to update user context:', e.message);
    return false;
  }
}

/**
 * Get user context
 *
 * @param {string} handle - User handle
 */
export async function getUserContext(handle) {
  try {
    const [context] = await sql`
      SELECT * FROM user_context WHERE handle = ${handle}
    `;
    return context || null;
  } catch (e) {
    console.error('[graph] Failed to get user context:', e.message);
    return null;
  }
}

// ============================================================
// Graph Statistics
// ============================================================

/**
 * Get graph statistics
 */
export async function getGraphStats() {
  try {
    const [stats] = await sql`
      SELECT
        (SELECT COUNT(*) FROM graph_edges) as total_edges,
        (SELECT COUNT(*) FROM interaction_log) as total_interactions,
        (SELECT COUNT(DISTINCT handle) FROM user_context) as tracked_users,
        (SELECT AVG(total_connections) FROM user_context) as avg_connections
    `;
    return stats;
  } catch (e) {
    console.error('[graph] Failed to get stats:', e.message);
    return {
      total_edges: 0,
      total_interactions: 0,
      tracked_users: 0,
      avg_connections: 0
    };
  }
}

// ============================================================
// Weight Computation Helpers
// ============================================================

/**
 * Compute edge weight with skill overlap bonus
 *
 * @param {object} interaction - The interaction
 * @param {string[]} fromSkills - Source user's skills
 * @param {string[]} toSkills - Target user's skills
 */
export function computeWeight(interaction, fromSkills = [], toSkills = []) {
  const { action, age = 0 } = interaction;

  // Base weight for action type
  const baseWeight = EDGE_WEIGHTS[action] || 0.5;

  // Apply time decay (age in weeks)
  const decayed = baseWeight * Math.pow(DECAY_FACTOR, age);

  // Calculate skill overlap bonus
  const sharedSkills = fromSkills.filter(s => toSkills.includes(s));
  const skillBonus = sharedSkills.length * SKILL_OVERLAP_BONUS;

  // Return capped weight
  return Math.min(decayed + skillBonus, MAX_WEIGHT);
}

export default {
  EDGE_WEIGHTS,
  logInteraction,
  getConnections,
  getMutualConnections,
  discoverBySkill,
  getRecommendations,
  getTwoHopNetwork,
  updateUserContext,
  getUserContext,
  getGraphStats,
  computeWeight
};
