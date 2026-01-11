-- Migration: AIRC v0.2 Identity Portability (Final)
-- Created: 2026-01-10
-- Purpose: Add missing columns and tables for AIRC v0.2
--
-- Existing schema already has: users (with recovery_key, etc), nonce_tracker, audit_log
-- This migration adds: success column to audit_log, handle_quarantine table

-- ============================================================
-- 1. Update Audit Log (Add Success Column)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'success'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN success BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- Add index for failed events
CREATE INDEX IF NOT EXISTS idx_audit_success_false ON audit_log(success, created_at DESC)
  WHERE success = false;

-- ============================================================
-- 2. Create Handle Quarantine Table
-- ============================================================

CREATE TABLE IF NOT EXISTS handle_quarantine (
  handle VARCHAR(50) PRIMARY KEY,
  revoked_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,                -- revoked_at + 90 days
  previous_owner_key TEXT,                      -- Previous owner's signing key (for audit trail)
  reason TEXT                                   -- Revocation reason (key_compromise, voluntary, etc.)
);

CREATE INDEX IF NOT EXISTS idx_quarantine_expires ON handle_quarantine(expires_at);

COMMENT ON TABLE handle_quarantine IS '90-day handle lock after revocation (prevents handle squatting)';
COMMENT ON COLUMN handle_quarantine.expires_at IS 'Handle can be re-registered after this timestamp';

-- ============================================================
-- 3. Cleanup Functions
-- ============================================================

-- Function: Clean expired quarantines (run daily via cron)
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
-- 4. Add Missing Indexes for AIRC v0.2 Performance
-- ============================================================

-- Users table indexes (for rotation/revocation queries)
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_registry ON users(registry);

-- Nonce tracker indexes (already exist, but ensure they're there)
CREATE INDEX IF NOT EXISTS idx_nonce_expires ON nonce_tracker(expires_at);
CREATE INDEX IF NOT EXISTS idx_nonce_handle ON nonce_tracker(handle);
CREATE INDEX IF NOT EXISTS idx_nonce_operation ON nonce_tracker(operation);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_handle ON audit_log(handle);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- ============================================================
-- 5. Validation
-- ============================================================

-- Ensure status values are constrained
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IS NULL OR status IN ('active', 'suspended', 'revoked'));

-- ============================================================
-- Done!
-- ============================================================
-- This completes the AIRC v0.2 schema.
--
-- Implementation notes:
-- - Use 'username' column (AIRC spec calls it 'handle')
-- - Use 'public_key' column (AIRC spec calls it 'signing_key')
-- - All other AIRC v0.2 columns already exist and match spec
