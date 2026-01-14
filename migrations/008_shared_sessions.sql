-- Migration 008: Shared Sessions
-- Enables session sharing and replay for multiplayer vibe coding
-- "Sessions are shared spaces, not private documents" - Campfire Principle

-- ============================================================
-- 1. Shared Sessions Table
-- ============================================================

CREATE TABLE IF NOT EXISTS shared_sessions (
  id TEXT PRIMARY KEY,  -- ses_<nanoid>
  author_handle TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',  -- 'public' | 'unlisted' | 'private'

  -- Enrichment data from session
  enrichment JSONB NOT NULL DEFAULT '{}',
  -- Expected shape: {techStack: [], problemType: string, outcome: string, tokenCount: int, cost: float, duration: int}

  -- AI-generated summary
  summary TEXT,

  -- Metrics
  chunk_count INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  views INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_viewed_at TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_shared_sessions_author ON shared_sessions(author_handle);
CREATE INDEX IF NOT EXISTS idx_shared_sessions_visibility ON shared_sessions(visibility) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_shared_sessions_created ON shared_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_sessions_views ON shared_sessions(views DESC) WHERE visibility = 'public';

-- GIN index for searching enrichment (tech stack, problem type)
CREATE INDEX IF NOT EXISTS idx_shared_sessions_enrichment ON shared_sessions USING GIN (enrichment);

COMMENT ON TABLE shared_sessions IS 'Shared coding sessions for replay and discovery';
COMMENT ON COLUMN shared_sessions.visibility IS 'public: discoverable, unlisted: link-only, private: author-only';

-- ============================================================
-- 2. Session Chunks Table
-- ============================================================

CREATE TABLE IF NOT EXISTS session_chunks (
  session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  chunk_type TEXT NOT NULL,  -- 'output' | 'input' | 'marker' | 'thinking'
  data TEXT NOT NULL,  -- base64 encoded, gzipped for large chunks
  timestamp_ms BIGINT NOT NULL,  -- milliseconds since session start

  -- Optional metadata for markers
  metadata JSONB,

  PRIMARY KEY (session_id, seq)
);

-- Index for efficient chunk retrieval
CREATE INDEX IF NOT EXISTS idx_session_chunks_session ON session_chunks(session_id, seq);

COMMENT ON TABLE session_chunks IS 'Terminal output/input chunks for session replay';
COMMENT ON COLUMN session_chunks.chunk_type IS 'output: terminal output, input: user input, marker: event markers, thinking: AI thinking blocks';
COMMENT ON COLUMN session_chunks.data IS 'Base64 encoded data, may be gzipped for chunks > 1KB';

-- ============================================================
-- 3. Session Handoffs Table (for Phase 2)
-- ============================================================

CREATE TABLE IF NOT EXISTS session_handoffs (
  id TEXT PRIMARY KEY,  -- hoff_<nanoid>
  from_handle TEXT NOT NULL,
  to_handle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'declined' | 'expired'

  -- Context being handed off
  session_context JSONB NOT NULL,
  -- Expected shape: {summary, cwd, techStack, pendingTasks, conversationMd, keyFiles}

  -- Optional message from sender
  message TEXT,

  -- Linked shared session (optional - if sender shared the full session)
  shared_session_id TEXT REFERENCES shared_sessions(id),

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  accepted_at TIMESTAMP,

  -- Note: Unique constraint for pending handoffs handled by partial index below
);

-- Prevent duplicate pending handoffs (but allow multiple accepted/declined over time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_handoff
ON session_handoffs (from_handle, to_handle)
WHERE status = 'pending';

-- Indexes for handoff queries
CREATE INDEX IF NOT EXISTS idx_handoffs_to ON session_handoffs(to_handle, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_handoffs_from ON session_handoffs(from_handle);
CREATE INDEX IF NOT EXISTS idx_handoffs_expires ON session_handoffs(expires_at) WHERE status = 'pending';

COMMENT ON TABLE session_handoffs IS 'Session context handoffs between users';

-- ============================================================
-- 4. Helper Functions
-- ============================================================

-- Function: Increment session views
CREATE OR REPLACE FUNCTION increment_session_views(p_session_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE shared_sessions
  SET views = views + 1,
      last_viewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Increment session forks
CREATE OR REPLACE FUNCTION increment_session_forks(p_session_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE shared_sessions
  SET forks = forks + 1,
      updated_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Expire old handoffs (call periodically)
CREATE OR REPLACE FUNCTION expire_old_handoffs()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE session_handoffs
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get session with author info for browse
CREATE OR REPLACE FUNCTION get_browseable_sessions(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_skill TEXT DEFAULT NULL,
  p_author TEXT DEFAULT NULL,
  p_problem_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  author_handle TEXT,
  title TEXT,
  description TEXT,
  enrichment JSONB,
  summary TEXT,
  duration_seconds INTEGER,
  views INTEGER,
  forks INTEGER,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.author_handle,
    s.title,
    s.description,
    s.enrichment,
    s.summary,
    s.duration_seconds,
    s.views,
    s.forks,
    s.created_at
  FROM shared_sessions s
  WHERE s.visibility = 'public'
    AND (p_skill IS NULL OR s.enrichment->'techStack' ? p_skill)
    AND (p_author IS NULL OR s.author_handle = p_author)
    AND (p_problem_type IS NULL OR s.enrichment->>'problemType' = p_problem_type)
  ORDER BY s.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_browseable_sessions IS 'Get public sessions with optional filters';

-- ============================================================
-- 5. Cleanup Policy (for unlisted sessions)
-- ============================================================

-- Note: Run this periodically via cron or scheduled function
-- DELETE FROM shared_sessions
-- WHERE visibility = 'unlisted'
--   AND last_viewed_at < NOW() - INTERVAL '30 days';
