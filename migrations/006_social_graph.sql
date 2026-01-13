-- Migration: Social AI Context Graph
-- Created: 2026-01-13
-- Purpose: Build the social graph infrastructure for /vibe
--
-- This implements the "LinkedIn Principle": relationships emerge from
-- natural behavior, not explicit friend requests. Edges are created
-- automatically when users interact.

-- ============================================================
-- 1. Graph Edges Table
-- ============================================================
-- Weighted relationships between users

CREATE TABLE IF NOT EXISTS graph_edges (
  id SERIAL PRIMARY KEY,
  from_handle TEXT NOT NULL,
  to_handle TEXT NOT NULL,
  edge_type TEXT NOT NULL,          -- 'message', 'reaction', 'comment', 'collab', 'follow'
  weight REAL NOT NULL DEFAULT 1.0, -- Computed weight (higher = stronger connection)
  interaction_count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  first_interaction_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_interaction_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(from_handle, to_handle, edge_type)
);

-- Index for querying a user's connections
CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON graph_edges(from_handle);
CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges(to_handle);

-- Index for finding strongest connections
CREATE INDEX IF NOT EXISTS idx_graph_edges_weight ON graph_edges(from_handle, weight DESC);

-- Index for edge type queries
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON graph_edges(edge_type);

COMMENT ON TABLE graph_edges IS 'Social graph edges representing relationships between users';
COMMENT ON COLUMN graph_edges.weight IS 'Computed relationship strength (decays over time, boosted by skill overlap)';
COMMENT ON COLUMN graph_edges.interaction_count IS 'Total number of interactions of this type';

-- ============================================================
-- 2. User Context Cache Table
-- ============================================================
-- Aggregated user profile for fast graph queries

CREATE TABLE IF NOT EXISTS user_context (
  handle TEXT PRIMARY KEY,
  skills TEXT[] DEFAULT '{}',       -- Array of skills (e.g., ['rust', 'ml', 'typescript'])
  dna JSONB DEFAULT '{}',           -- Full DNA profile
  vibe_score REAL DEFAULT 0,        -- Reputation score
  total_connections INTEGER DEFAULT 0,
  total_interactions INTEGER DEFAULT 0,
  last_active_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for skill-based discovery
CREATE INDEX IF NOT EXISTS idx_user_context_skills ON user_context USING GIN(skills);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_user_context_vibe_score ON user_context(vibe_score DESC);

COMMENT ON TABLE user_context IS 'Cached user context for fast graph queries';
COMMENT ON COLUMN user_context.skills IS 'Extracted skills for discovery and matching';

-- ============================================================
-- 3. Interaction Log Table
-- ============================================================
-- Raw interaction events for weight computation

CREATE TABLE IF NOT EXISTS interaction_log (
  id SERIAL PRIMARY KEY,
  from_handle TEXT NOT NULL,
  to_handle TEXT NOT NULL,
  action TEXT NOT NULL,             -- 'message', 'reaction', 'comment', 'follow', 'board_post'
  metadata JSONB DEFAULT '{}',      -- Action-specific data (e.g., reaction type, signed status)
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for querying interactions between users
CREATE INDEX IF NOT EXISTS idx_interaction_log_handles ON interaction_log(from_handle, to_handle);

-- Index for recent interactions
CREATE INDEX IF NOT EXISTS idx_interaction_log_created ON interaction_log(created_at DESC);

-- Index for action type aggregation
CREATE INDEX IF NOT EXISTS idx_interaction_log_action ON interaction_log(action, created_at DESC);

COMMENT ON TABLE interaction_log IS 'Raw interaction events for edge weight computation';

-- ============================================================
-- 4. Graph Statistics Table
-- ============================================================
-- Platform-wide graph metrics

CREATE TABLE IF NOT EXISTS graph_stats (
  id SERIAL PRIMARY KEY,
  stat_date DATE NOT NULL UNIQUE,
  total_edges INTEGER NOT NULL DEFAULT 0,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  active_users INTEGER NOT NULL DEFAULT 0,
  avg_connections REAL NOT NULL DEFAULT 0,
  top_skills JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_stats_date ON graph_stats(stat_date DESC);

COMMENT ON TABLE graph_stats IS 'Daily aggregated graph metrics';

-- ============================================================
-- 5. Helper Functions
-- ============================================================

-- Function: Update edge weight (called after each interaction)
CREATE OR REPLACE FUNCTION update_edge_weight(
  p_from_handle TEXT,
  p_to_handle TEXT,
  p_edge_type TEXT,
  p_base_weight REAL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO graph_edges (from_handle, to_handle, edge_type, weight, interaction_count)
  VALUES (p_from_handle, p_to_handle, p_edge_type, p_base_weight, 1)
  ON CONFLICT (from_handle, to_handle, edge_type) DO UPDATE SET
    weight = graph_edges.weight + (p_base_weight * POWER(0.95, EXTRACT(EPOCH FROM (NOW() - graph_edges.last_interaction_at)) / 604800)),
    interaction_count = graph_edges.interaction_count + 1,
    last_interaction_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_edge_weight IS 'Upserts edge with time-decayed weight accumulation';

-- Function: Get user connections (with optional depth)
CREATE OR REPLACE FUNCTION get_user_connections(
  p_handle TEXT,
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  to_handle TEXT,
  edge_type TEXT,
  weight REAL,
  interaction_count INTEGER,
  last_interaction_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ge.to_handle,
    ge.edge_type,
    ge.weight,
    ge.interaction_count,
    ge.last_interaction_at
  FROM graph_edges ge
  WHERE ge.from_handle = p_handle
  ORDER BY ge.weight DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_connections IS 'Returns a user''s connections ordered by weight';

-- Function: Find mutual connections (friend-of-friend)
CREATE OR REPLACE FUNCTION find_mutual_connections(
  p_handle TEXT,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  suggested_handle TEXT,
  mutual_count BIGINT,
  total_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e2.to_handle AS suggested_handle,
    COUNT(*)::BIGINT AS mutual_count,
    SUM(e1.weight + e2.weight)::REAL AS total_score
  FROM graph_edges e1
  JOIN graph_edges e2 ON e1.to_handle = e2.from_handle
  WHERE e1.from_handle = p_handle
    AND e2.to_handle != p_handle
    AND e2.to_handle NOT IN (
      SELECT ge.to_handle FROM graph_edges ge WHERE ge.from_handle = p_handle
    )
  GROUP BY e2.to_handle
  ORDER BY total_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION find_mutual_connections IS 'Returns connection suggestions based on mutual connections';

-- Function: Discover users by skill
CREATE OR REPLACE FUNCTION discover_by_skill(
  p_skill TEXT,
  p_exclude_handle TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  handle TEXT,
  skills TEXT[],
  vibe_score REAL,
  total_connections INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    uc.handle,
    uc.skills,
    uc.vibe_score,
    uc.total_connections
  FROM user_context uc
  WHERE p_skill = ANY(uc.skills)
    AND (p_exclude_handle IS NULL OR uc.handle != p_exclude_handle)
  ORDER BY uc.vibe_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION discover_by_skill IS 'Finds users with a specific skill, ordered by vibe score';

-- ============================================================
-- 6. Cleanup Function
-- ============================================================

-- Function: Prune old interaction logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_interactions() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM interaction_log WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_interactions IS 'Removes interaction logs older than 30 days (call weekly)';

-- ============================================================
-- Done!
-- ============================================================
-- The social graph is ready. Edges will be created automatically
-- when users interact through messages, reactions, and comments.
--
-- Key queries:
-- - get_user_connections('seth')           -- Get a user's connections
-- - find_mutual_connections('seth')        -- Get friend-of-friend suggestions
-- - discover_by_skill('rust')              -- Find users with a skill
