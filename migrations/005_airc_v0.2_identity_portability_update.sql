-- Migration: AIRC v0.2 Identity Portability (Update existing schema)
-- Created: 2026-01-10
-- Purpose: Update existing tables for AIRC v0.2 compatibility
--
-- Note: The database already has users, nonce_tracker, audit_log tables
-- This migration adds missing columns and indexes for AIRC v0.2

-- ============================================================
-- 1. Update Users Table
-- ============================================================

-- Add alias column to map 'handle' to existing 'username'
-- (AIRC spec uses 'handle', existing DB uses 'username')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'handle'
  ) THEN
    -- Add handle as alias to username (for AIRC v0.2 compatibility)
    EXECUTE 'ALTER TABLE users ADD COLUMN handle VARCHAR(50) GENERATED ALWAYS AS (username) STORED';
  END IF;
END $$;

-- Add signing_key alias to existing public_key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'signing_key'
  ) THEN
    EXECUTE 'ALTER TABLE users ADD COLUMN signing_key TEXT GENERATED ALWAYS AS (public_key) STORED';
  END IF;
END $$;

-- Ensure AIRC v0.2 columns exist (most already added)
DO $$
BEGIN
  -- Add recovery_key if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'recovery_key'
  ) THEN
    ALTER TABLE users ADD COLUMN recovery_key TEXT;
  END IF;

  -- Add registry if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'registry'
  ) THEN
    ALTER TABLE users ADD COLUMN registry TEXT DEFAULT 'slashvibe.dev';
  END IF;

  -- Add key_rotated_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'key_rotated_at'
  ) THEN
    ALTER TABLE users ADD COLUMN key_rotated_at TIMESTAMP;
  END IF;

  -- Add revoked_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'revoked_at'
  ) THEN
    ALTER TABLE users ADD COLUMN revoked_at TIMESTAMP;
  END IF;

  -- Add status if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'status'
  ) THEN
    ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;
END $$;

-- Update status constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IS NULL OR status IN ('active', 'suspended', 'revoked'));

-- Add indexes for AIRC v0.2 queries
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_registry ON users(registry);
CREATE INDEX IF NOT EXISTS idx_users_public_key ON users(public_key);

-- ============================================================
-- 2. Update Nonce Tracker Table
-- ============================================================

-- Nonce tracker already exists, just ensure indexes
CREATE INDEX IF NOT EXISTS idx_nonce_expires ON nonce_tracker(expires_at);
CREATE INDEX IF NOT EXISTS idx_nonce_handle ON nonce_tracker(handle);
CREATE INDEX IF NOT EXISTS idx_nonce_operation ON nonce_tracker(operation);

-- ============================================================
-- 3. Update Audit Log Table
-- ============================================================

-- Audit log already exists, add missing indexes
CREATE INDEX IF NOT EXISTS idx_audit_handle ON audit_log(handle);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_success ON audit_log(success) WHERE success = false;

-- ============================================================
-- 4. Handle Quarantine Table
-- ============================================================

CREATE TABLE IF NOT EXISTS handle_quarantine (
  handle VARCHAR(50) PRIMARY KEY,
  revoked_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  previous_owner_key TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_quarantine_expires ON handle_quarantine(expires_at);

-- ============================================================
-- 5. Cleanup Functions
-- ============================================================

-- Drop and recreate functions to ensure latest version
DROP FUNCTION IF EXISTS cleanup_expired_nonces();
CREATE OR REPLACE FUNCTION cleanup_expired_nonces() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM nonce_tracker WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS cleanup_expired_quarantines();
CREATE OR REPLACE FUNCTION cleanup_expired_quarantines() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM handle_quarantine WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. Comments
-- ============================================================

COMMENT ON TABLE users IS 'User accounts with AIRC v0.2 identity portability support';
COMMENT ON COLUMN users.username IS 'Unique handle (AIRC calls this handle)';
COMMENT ON COLUMN users.public_key IS 'Ed25519 public signing key (AIRC calls this signing_key)';
COMMENT ON COLUMN users.recovery_key IS 'Ed25519 recovery key for rotation/revocation';
COMMENT ON COLUMN users.registry IS 'Origin registry domain (for cross-registry routing)';
COMMENT ON COLUMN users.status IS 'Identity status - revoked users cannot send messages';

COMMENT ON TABLE nonce_tracker IS 'Prevents replay attacks by tracking used nonces';
COMMENT ON TABLE audit_log IS 'Immutable security event log';
COMMENT ON TABLE handle_quarantine IS '90-day handle lock after revocation';
