-- Migration: AIRC v0.2 Identity Portability
-- Created: 2026-01-10
-- Purpose: Add core identity portability features (key rotation, revocation, nonce tracking)
--
-- This migration adds Postgres tables for AIRC v0.2 while maintaining compatibility
-- with existing Vercel KV handle storage. Eventually handles will migrate to Postgres.

-- ============================================================
-- 1. Users Table (AIRC Identity Registry)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  -- Primary identity
  handle VARCHAR(50) PRIMARY KEY,

  -- Cryptographic keys
  signing_key TEXT NOT NULL,                    -- Ed25519 public key (current)
  recovery_key TEXT,                            -- Ed25519 recovery public key (optional for now)

  -- Registry info
  registry TEXT DEFAULT 'slashvibe.dev',       -- Origin registry

  -- Identity lifecycle
  status VARCHAR(20) DEFAULT 'active',          -- active | suspended | revoked
  key_rotated_at TIMESTAMP,                     -- Last key rotation timestamp
  revoked_at TIMESTAMP,                         -- Revocation timestamp (if status=revoked)

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add constraint for status enum
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'suspended', 'revoked'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_registry ON users(registry);
CREATE INDEX IF NOT EXISTS idx_users_signing_key ON users(signing_key);

-- Comments
COMMENT ON TABLE users IS 'AIRC identity registry - canonical source for signing keys and identity status';
COMMENT ON COLUMN users.handle IS 'Unique lowercase handle (3-20 chars, alphanumeric + underscore)';
COMMENT ON COLUMN users.signing_key IS 'Ed25519 public key for message signing (ed25519:base64...)';
COMMENT ON COLUMN users.recovery_key IS 'Ed25519 recovery key for rotation/revocation (optional during grace period)';
COMMENT ON COLUMN users.registry IS 'Origin registry domain (for future cross-registry routing)';
COMMENT ON COLUMN users.status IS 'Identity status - revoked users cannot send messages';

-- ============================================================
-- 2. Nonce Tracker (Replay Attack Prevention)
-- ============================================================

CREATE TABLE IF NOT EXISTS nonce_tracker (
  id SERIAL PRIMARY KEY,
  nonce VARCHAR(24) NOT NULL UNIQUE,            -- 24-char base64url nonce
  handle VARCHAR(50) NOT NULL,                  -- Which identity used this nonce
  operation VARCHAR(20) NOT NULL,               -- 'rotation' | 'revocation' | 'message'
  ip_address VARCHAR(45),                       -- Client IP for forensics
  used_at TIMESTAMP DEFAULT NOW(),              -- When nonce was first seen
  expires_at TIMESTAMP NOT NULL                 -- TTL for cleanup (typically 1 hour)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nonce_expires ON nonce_tracker(expires_at);
CREATE INDEX IF NOT EXISTS idx_nonce_handle ON nonce_tracker(handle);
CREATE INDEX IF NOT EXISTS idx_nonce_operation ON nonce_tracker(operation);

-- Comments
COMMENT ON TABLE nonce_tracker IS 'Prevents replay attacks by tracking used nonces (1-hour TTL)';
COMMENT ON COLUMN nonce_tracker.nonce IS 'Cryptographically random nonce (16 bytes, base64url encoded)';
COMMENT ON COLUMN nonce_tracker.operation IS 'Which operation used this nonce (for audit analysis)';
COMMENT ON COLUMN nonce_tracker.expires_at IS 'Nonces expire after 1 hour and can be cleaned up';

-- ============================================================
-- 3. Audit Log (Security Event Tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,              -- 'key_rotation', 'identity_revoked', 'rate_limited', etc.
  handle VARCHAR(50) NOT NULL,                  -- Actor (who performed the action)
  ip_address VARCHAR(45),                       -- Client IP
  success BOOLEAN NOT NULL,                     -- Did the operation succeed?
  details JSONB NOT NULL,                       -- Flexible event-specific details
  created_at TIMESTAMP DEFAULT NOW()            -- When event occurred
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_audit_handle ON audit_log(handle);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_success ON audit_log(success);

-- Composite index for common queries (failed events by user)
CREATE INDEX IF NOT EXISTS idx_audit_handle_failed ON audit_log(handle, created_at DESC)
  WHERE success = false;

-- Comments
COMMENT ON TABLE audit_log IS 'Immutable security event log (no UPDATE/DELETE)';
COMMENT ON COLUMN audit_log.event_type IS 'Type of security event (key_rotation, identity_revoked, rate_limited, auth_failed)';
COMMENT ON COLUMN audit_log.success IS 'False for failed attempts (possible attacks)';
COMMENT ON COLUMN audit_log.details IS 'Event-specific data (old_key, new_key, reason, etc.)';

-- ============================================================
-- 4. Admin Access Log (SOC2 Compliance)
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_access_log (
  id SERIAL PRIMARY KEY,
  admin_handle VARCHAR(50) NOT NULL,            -- Which admin performed the action
  action VARCHAR(100) NOT NULL,                 -- Action performed (view_audit_log, modify_user, etc.)
  target_handle VARCHAR(50),                    -- Optional: which user was affected
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_access_admin ON admin_access_log(admin_handle);
CREATE INDEX IF NOT EXISTS idx_admin_access_created ON admin_access_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_action ON admin_access_log(action);

-- Comments
COMMENT ON TABLE admin_access_log IS 'Logs all admin actions for SOC2 compliance and security audits';
COMMENT ON COLUMN admin_access_log.action IS 'Admin action performed (e.g., view_audit_log, suspend_user)';
COMMENT ON COLUMN admin_access_log.target_handle IS 'User affected by admin action (if applicable)';

-- ============================================================
-- 5. Handle Quarantine (90-Day Lock After Revocation)
-- ============================================================

CREATE TABLE IF NOT EXISTS handle_quarantine (
  handle VARCHAR(50) PRIMARY KEY,
  revoked_at TIMESTAMP NOT NULL,                -- When identity was revoked
  expires_at TIMESTAMP NOT NULL,                -- Quarantine ends (revoked_at + 90 days)
  previous_owner_key TEXT,                      -- Previous owner's signing key (for audit trail)
  reason TEXT                                   -- Revocation reason (key_compromise, voluntary, etc.)
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_quarantine_expires ON handle_quarantine(expires_at);

-- Comments
COMMENT ON TABLE handle_quarantine IS '90-day handle lock after revocation (prevents handle squatting)';
COMMENT ON COLUMN handle_quarantine.expires_at IS 'Handle can be re-registered after this timestamp';
COMMENT ON COLUMN handle_quarantine.previous_owner_key IS 'Audit trail - who previously owned this handle';

-- ============================================================
-- 6. Migration Utilities
-- ============================================================

-- Function: Clean expired nonces (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_nonces() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM nonce_tracker WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_nonces IS 'Removes nonces older than their TTL (call hourly via cron)';

-- Function: Clean expired quarantines (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_quarantines() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM handle_quarantine WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_quarantines IS 'Removes quarantines after 90 days (call daily via cron)';

-- ============================================================
-- 7. Migration Notes
-- ============================================================

-- IMPORTANT: This migration is ADDITIVE ONLY
-- - Does not modify existing KV handle storage
-- - Does not drop any existing tables
-- - Can be rolled back safely by removing new tables
--
-- Post-migration steps:
-- 1. Sync existing handles from KV to users table (separate script)
-- 2. Deploy rotation/revocation endpoints
-- 3. Configure cron jobs for cleanup functions
-- 4. Monitor audit_log for security events
--
-- Rollback procedure:
--   DROP TABLE IF EXISTS handle_quarantine;
--   DROP TABLE IF EXISTS admin_access_log;
--   DROP TABLE IF EXISTS audit_log;
--   DROP TABLE IF EXISTS nonce_tracker;
--   DROP TABLE IF EXISTS users;
--   DROP FUNCTION IF EXISTS cleanup_expired_nonces;
--   DROP FUNCTION IF EXISTS cleanup_expired_quarantines;
