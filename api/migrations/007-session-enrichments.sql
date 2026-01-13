-- Migration 007: Session Enrichments for AI Context Graph
--
-- This table stores enriched session metadata from VIBE Terminal,
-- enabling the social AI context graph - "LinkedIn for AI-assisted development"
--
-- Key features:
-- - Tech stack detection
-- - Problem type classification
-- - AI model/token tracking
-- - Outcome inference
-- - Files touched summary
--
-- Future: Add pgvector embedding column for semantic search

-- Session enrichments table
CREATE TABLE IF NOT EXISTS session_enrichments (
    session_id TEXT PRIMARY KEY,
    user_handle TEXT NOT NULL,

    -- Tech stack and project info
    tech_stack JSONB DEFAULT '[]'::jsonb,
    project_name TEXT,
    problem_type TEXT NOT NULL DEFAULT 'unknown',

    -- AI context
    model TEXT,
    model_family TEXT NOT NULL DEFAULT 'unknown',
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,

    -- Tool usage (JSONB for flexibility)
    tool_counts JSONB DEFAULT '{}'::jsonb,

    -- Outcome and phase
    inferred_outcome TEXT NOT NULL DEFAULT 'unknown',
    phase_reached TEXT NOT NULL DEFAULT 'unknown',

    -- Files touched (array)
    files_touched JSONB DEFAULT '[]'::jsonb,

    -- Summary (for display and future embedding)
    summary TEXT,

    -- Timestamps
    session_started_at TIMESTAMPTZ,
    session_ended_at TIMESTAMPTZ,
    enriched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Visibility control
    visibility TEXT NOT NULL DEFAULT 'private', -- private, discoverable, public

    -- Embedding for semantic search (future - requires pgvector extension)
    -- embedding vector(1536),

    CONSTRAINT valid_problem_type CHECK (problem_type IN ('bugfix', 'feature', 'refactor', 'explore', 'test', 'deploy', 'config', 'unknown')),
    CONSTRAINT valid_outcome CHECK (inferred_outcome IN ('success', 'partial', 'failed', 'unknown')),
    CONSTRAINT valid_visibility CHECK (visibility IN ('private', 'discoverable', 'public'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_enrichments_user ON session_enrichments(user_handle);
CREATE INDEX IF NOT EXISTS idx_enrichments_problem ON session_enrichments(problem_type);
CREATE INDEX IF NOT EXISTS idx_enrichments_outcome ON session_enrichments(inferred_outcome);
CREATE INDEX IF NOT EXISTS idx_enrichments_tech ON session_enrichments USING GIN(tech_stack);
CREATE INDEX IF NOT EXISTS idx_enrichments_enriched_at ON session_enrichments(enriched_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichments_visibility ON session_enrichments(visibility) WHERE visibility != 'private';

-- User session stats (aggregated view for profiles)
CREATE TABLE IF NOT EXISTS user_session_stats (
    user_handle TEXT PRIMARY KEY,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    total_tokens_in BIGINT NOT NULL DEFAULT 0,
    total_tokens_out BIGINT NOT NULL DEFAULT 0,
    total_cost_usd NUMERIC(10, 2) NOT NULL DEFAULT 0,

    -- Breakdown by problem type
    bugfix_count INTEGER NOT NULL DEFAULT 0,
    feature_count INTEGER NOT NULL DEFAULT 0,
    refactor_count INTEGER NOT NULL DEFAULT 0,
    explore_count INTEGER NOT NULL DEFAULT 0,

    -- Success rate
    success_count INTEGER NOT NULL DEFAULT 0,
    partial_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,

    -- Top tech (most used)
    top_tech JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    first_session_at TIMESTAMPTZ,
    last_session_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Problem clusters for "sessions like this" feature (future)
-- CREATE TABLE IF NOT EXISTS problem_clusters (
--     id TEXT PRIMARY KEY,
--     label TEXT NOT NULL,
--     description TEXT,
--     member_count INTEGER NOT NULL DEFAULT 0,
--     centroid vector(1536),
--     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
