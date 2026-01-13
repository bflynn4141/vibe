/**
 * AIRC v0.2 - Key Rotation Endpoint
 *
 * POST /api/identity/{handle}/rotate
 *
 * Allows users to rotate their signing key using a recovery key proof.
 *
 * Flow:
 * 1. Verify rotation proof signature (signed by recovery key)
 * 2. Check nonce hasn't been used (replay prevention)
 * 3. Check rate limit (1/hour)
 * 4. Verify old_key matches current signing key
 * 5. Update signing key atomically
 * 6. Invalidate existing sessions
 * 7. Log to audit log
 */

import { verifyRotationProof, validateTimestamp, parseAIRCKey } from '../../lib/crypto.js';
import { checkAIRCRateLimit, setAIRCRateLimitHeaders, aircRateLimitResponse, getClientIP } from '../../lib/ratelimit.js';
import { sql } from '../../lib/db.js';

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { handle } = req.query;
  const clientIP = getClientIP(req);

  // Validate handle
  if (!handle || typeof handle !== 'string') {
    return res.status(400).json({ error: 'invalid_handle' });
  }

  // Parse request body
  let proof;
  try {
    proof = req.body.proof || req.body;

    if (!proof || typeof proof !== 'object') {
      return res.status(400).json({ error: 'invalid_request_body', message: 'Missing proof object' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'invalid_json' });
  }

  try {
    // 1. Validate proof structure
    const requiredFields = ['operation', 'handle', 'timestamp', 'nonce', 'old_key', 'new_key', 'signature'];
    for (const field of requiredFields) {
      if (!proof[field]) {
        return res.status(400).json({
          error: 'missing_field',
          field,
          message: `Missing required field: ${field}`
        });
      }
    }

    // Verify operation type
    if (proof.operation !== 'rotate') {
      return res.status(400).json({
        error: 'invalid_operation',
        message: `Expected operation 'rotate', got '${proof.operation}'`
      });
    }

    // Verify handle matches URL parameter
    if (proof.handle !== handle) {
      return res.status(400).json({
        error: 'handle_mismatch',
        message: `Proof handle '${proof.handle}' does not match URL parameter '${handle}'`
      });
    }

    // 2. Validate timestamp (within 5-minute window)
    const timestampCheck = validateTimestamp(proof.timestamp, 300);
    if (!timestampCheck.valid) {
      return res.status(400).json({
        error: timestampCheck.error,
        message: timestampCheck.message || 'Timestamp validation failed',
        skew_seconds: timestampCheck.skew
      });
    }

    // 3. Fetch user record
    // Note: Schema uses 'username' and 'public_key' (AIRC spec calls them 'handle'/'signing_key')
    const userResult = await sql`
      SELECT username, public_key, recovery_key, key_rotated_at, status
      FROM users
      WHERE username = ${handle}
    `;

    if (userResult.length === 0) {
      return res.status(404).json({
        error: 'identity_not_found',
        message: `No identity found for handle: ${handle}`
      });
    }

    const user = userResult[0];

    // 4. Verify identity status is active
    if (user.status === 'revoked') {
      return res.status(403).json({
        error: 'identity_revoked',
        message: 'Cannot rotate key for revoked identity'
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'identity_suspended',
        message: 'Cannot rotate key for suspended identity'
      });
    }

    // 5. Check if recovery key exists
    if (!user.recovery_key) {
      return res.status(400).json({
        error: 'no_recovery_key',
        message: 'No recovery key registered for this identity. Recovery key is required for rotation.'
      });
    }

    // 6. Parse keys from AIRC format (ed25519:base64...)
    const recoveryKeyParsed = parseAIRCKey(user.recovery_key);
    const oldKeyParsed = parseAIRCKey(proof.old_key);
    const newKeyParsed = parseAIRCKey(proof.new_key);
    const currentKeyParsed = parseAIRCKey(user.public_key); // Schema uses 'public_key'

    if (!recoveryKeyParsed || !oldKeyParsed || !newKeyParsed || !currentKeyParsed) {
      return res.status(500).json({ error: 'key_format_error' });
    }

    // 7. Verify rotation proof signature (signed by recovery key)
    const proofValid = verifyRotationProof(proof, recoveryKeyParsed.keyData);
    if (!proofValid) {
      // Log failed attempt
      await sql`
        INSERT INTO audit_log (id, event_type, handle, success, details, ip_hash)
        VALUES (
          'audit_' || gen_random_uuid()::text,
          'key_rotation',
          ${handle},
          false,
          ${JSON.stringify({
            error: 'invalid_signature',
            nonce: proof.nonce,
            timestamp: proof.timestamp
          })},
          ${clientIP}
        )
      `;

      return res.status(401).json({
        error: 'invalid_proof',
        message: 'Rotation proof signature verification failed'
      });
    }

    // 8. Check rate limit (1 rotation per hour per handle)
    const rateCheck = await checkAIRCRateLimit('rotation', handle, clientIP);
    setAIRCRateLimitHeaders(res, 'rotation', handle, rateCheck);

    if (rateCheck.limited) {
      // Log rate-limited attempt
      await sql`
        INSERT INTO audit_log (id, event_type, handle, success, details, ip_hash)
        VALUES (
          'audit_' || gen_random_uuid()::text,
          'rate_limited',
          ${handle},
          false,
          ${JSON.stringify({
            operation: 'rotation',
            remaining: rateCheck.remaining,
            reset_at: rateCheck.resetAt
          })},
          ${clientIP}
        )
      `;

      return aircRateLimitResponse(res, 'rotation', Math.ceil((rateCheck.resetAt - Date.now()) / 1000));
    }

    // 9. Check nonce hasn't been used (replay prevention)
    try {
      await sql`
        INSERT INTO nonce_tracker (nonce, handle, operation, expires_at, ip_address)
        VALUES (
          ${proof.nonce},
          ${handle},
          'rotation',
          NOW() + INTERVAL '1 hour',
          ${clientIP}
        )
      `;
    } catch (e) {
      // Nonce already exists (replay attack or duplicate request)
      if (e.code === '23505') { // Unique violation
        // Log replay attempt
        await sql`
          INSERT INTO audit_log (id, event_type, handle, success, details, ip_hash)
          VALUES (
            'audit_' || gen_random_uuid()::text,
            'key_rotation',
            ${handle},
            false,
            ${JSON.stringify({
              error: 'replay_attack',
              nonce: proof.nonce,
              timestamp: proof.timestamp
            })},
            ${clientIP}
          )
        `;

        return res.status(401).json({
          error: 'replay_attack',
          message: 'Nonce has already been used'
        });
      }

      // Other database error
      throw e;
    }

    // 10. Verify old_key matches current signing key
    if (oldKeyParsed.keyData !== currentKeyParsed.keyData) {
      return res.status(400).json({
        error: 'key_mismatch',
        message: 'old_key in proof does not match current signing key'
      });
    }

    // 11. Update signing key atomically (with optimistic locking)
    const updateResult = await sql`
      UPDATE users
      SET public_key = ${proof.new_key},
          key_rotated_at = NOW(),
          updated_at = NOW()
      WHERE username = ${handle}
      AND public_key = ${proof.old_key}
      RETURNING username, public_key, key_rotated_at
    `;

    if (updateResult.length === 0) {
      // Concurrent modification detected
      return res.status(409).json({
        error: 'concurrent_modification',
        message: 'Signing key was modified during rotation. Please retry.'
      });
    }

    const updated = updateResult[0];

    // 12. Invalidate existing sessions (future: clear KV sessions)
    // TODO: Clear Vercel KV sessions for this handle
    // await kv.del(`session:${handle}:*`);

    // 13. Log successful rotation to audit log
    await sql`
      INSERT INTO audit_log (id, event_type, handle, success, details, ip_hash)
      VALUES (
        'audit_' || gen_random_uuid()::text,
        'key_rotation',
        ${handle},
        true,
        ${JSON.stringify({
          old_key: proof.old_key,
          new_key: proof.new_key,
          nonce: proof.nonce,
          timestamp: proof.timestamp,
          rotated_at: updated.key_rotated_at
        })},
        ${clientIP}
      )
    `;

    // 14. Return success response
    return res.status(200).json({
      success: true,
      handle: handle,
      new_key: updated.public_key,
      rotated_at: updated.key_rotated_at,
      message: 'Signing key rotated successfully'
    });

  } catch (error) {
    console.error('[Rotation] Error:', error);

    // Log error to audit log
    try {
      await sql`
        INSERT INTO audit_log (id, event_type, handle, success, details, ip_hash)
        VALUES (
          'audit_' || gen_random_uuid()::text,
          'key_rotation',
          ${handle},
          false,
          ${JSON.stringify({
            error: 'internal_error',
            message: error.message
          })},
          ${clientIP}
        )
      `;
    } catch (auditError) {
      console.error('[Rotation] Failed to log error to audit:', auditError);
    }

    return res.status(500).json({
      error: 'internal_error',
      message: 'An error occurred during key rotation'
    });
  }
}
