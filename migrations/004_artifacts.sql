-- Migration: Add artifacts table for just-in-time social objects
-- Created: 2026-01-09
-- Purpose: Migrate from KV-only to Postgres primary storage with KV cache

CREATE TABLE IF NOT EXISTS artifacts (
  id VARCHAR(50) PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  template VARCHAR(50) NOT NULL CHECK (template IN ('guide', 'learning', 'workspace')),

  -- Content stored as JSONB (structured blocks)
  content JSONB NOT NULL,

  -- Social metadata
  created_by VARCHAR(50) NOT NULL,
  created_for VARCHAR(50),
  thread_id VARCHAR(100),

  -- Privacy controls
  visibility VARCHAR(20) NOT NULL DEFAULT 'unlisted' CHECK (visibility IN ('unlisted', 'network', 'public')),
  audience TEXT[] DEFAULT '{}',  -- Array of handles who can access

  -- Provenance tracking
  provenance JSONB NOT NULL,

  -- Lifecycle
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,

  -- Evolution
  revision INTEGER DEFAULT 1,
  forked_from VARCHAR(50) REFERENCES artifacts(id) ON DELETE SET NULL,

  -- Analytics (future)
  view_count INTEGER DEFAULT 0,
  fork_count INTEGER DEFAULT 0
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_artifacts_created_by ON artifacts(created_by);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_for ON artifacts(created_for);
CREATE INDEX IF NOT EXISTS idx_artifacts_slug ON artifacts(slug);
CREATE INDEX IF NOT EXISTS idx_artifacts_visibility ON artifacts(visibility);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_template ON artifacts(template);

-- Full-text search on title and content
CREATE INDEX IF NOT EXISTS idx_artifacts_search ON artifacts
  USING gin(to_tsvector('english', title || ' ' || (content->>'blocks')::text));

-- Composite index for "artifacts for me" queries
CREATE INDEX IF NOT EXISTS idx_artifacts_for_user ON artifacts(created_for, created_at DESC);

-- Composite index for "my artifacts" queries
CREATE INDEX IF NOT EXISTS idx_artifacts_by_user ON artifacts(created_by, created_at DESC);

-- GIN index for audience array lookups (handles in audience)
CREATE INDEX IF NOT EXISTS idx_artifacts_audience ON artifacts USING gin(audience);

-- Comments table (future - not used yet)
CREATE TABLE IF NOT EXISTS artifact_comments (
  id SERIAL PRIMARY KEY,
  artifact_id VARCHAR(50) NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  author VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_artifact ON artifact_comments(artifact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_author ON artifact_comments(author);

-- Forks tracking (denormalized for performance)
CREATE TABLE IF NOT EXISTS artifact_forks (
  original_id VARCHAR(50) NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  fork_id VARCHAR(50) NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (original_id, fork_id)
);

CREATE INDEX IF NOT EXISTS idx_forks_original ON artifact_forks(original_id, created_at DESC);

-- Migration tracking
CREATE TABLE IF NOT EXISTS artifact_migrations (
  id SERIAL PRIMARY KEY,
  artifact_id VARCHAR(50) NOT NULL,
  source VARCHAR(20) NOT NULL, -- 'kv' or 'manual'
  migrated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_time ON artifact_migrations(migrated_at);
