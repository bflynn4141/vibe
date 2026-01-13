/**
 * /api/sessions/sync
 *
 * Receives enriched session data from VIBE Terminal.
 * Stores in Postgres for the social AI context graph.
 *
 * This is the foundation for:
 * - "Sessions Like This" (semantic search)
 * - "Who Solved This?" (expertise matching)
 * - User session profiles
 * - Cross-session linking
 *
 * Security:
 * - Supports optional HMAC signature verification via X-Vibe-Signature header
 * - Timestamp validation to prevent replay attacks
 */

import { sql, isConfigured } from '../lib/db.js';
import { kv } from '@vercel/kv';
import crypto from 'crypto';
import { canonicalJSON, validateTimestamp } from '../lib/crypto.js';

// Sync secret - separate from session secret for isolation
const SYNC_SECRET = process.env.VIBE_SYNC_SECRET || process.env.VIBE_SYSTEM_SECRET;
const REQUIRE_SIGNATURE = process.env.VIBE_SYNC_REQUIRE_SIGNATURE === 'true';
const TIMESTAMP_WINDOW = 300; // 5 minutes

/**
 * Verify HMAC signature of the request
 * Signature is HMAC-SHA256(canonical_json(body) + timestamp)
 */
function verifySignature(body, signature, timestamp) {
  if (!SYNC_SECRET) {
    console.warn('[sessions/sync] No SYNC_SECRET configured, signature verification disabled');
    return { valid: true, warning: 'signature_verification_disabled' };
  }

  if (!signature) {
    if (REQUIRE_SIGNATURE) {
      return { valid: false, error: 'missing_signature' };
    }
    return { valid: true, warning: 'unsigned_request_accepted' };
  }

  // Validate timestamp first
  const tsResult = validateTimestamp(timestamp, TIMESTAMP_WINDOW);
  if (!tsResult.valid) {
    return { valid: false, error: tsResult.error, message: tsResult.message };
  }

  // Create expected signature
  const message = canonicalJSON(body) + ':' + timestamp;
  const hmac = crypto.createHmac('sha256', SYNC_SECRET);
  hmac.update(message);
  const expectedSig = hmac.digest('hex');

  // Timing-safe comparison
  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, error: 'invalid_signature' };
    }

    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, error: 'invalid_signature' };
    }
  } catch (e) {
    return { valid: false, error: 'invalid_signature_format' };
  }

  return { valid: true };
}

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vibe-Signature, X-Vibe-Timestamp');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify signature if present (or required)
    const signature = req.headers['x-vibe-signature'];
    const timestamp = req.headers['x-vibe-timestamp'];
    const sigResult = verifySignature(req.body, signature, timestamp);

    if (!sigResult.valid) {
      console.warn('[sessions/sync] Signature verification failed:', sigResult.error);
      return res.status(401).json({
        error: 'unauthorized',
        details: sigResult.error,
        message: sigResult.message || 'Invalid or missing signature'
      });
    }

    if (sigResult.warning) {
      console.log('[sessions/sync] Warning:', sigResult.warning);
    }

    const {
      sessionId,
      userHandle: rawUserHandle,
      techStack = [],
      projectName,
      problemType = 'unknown',
      model,
      modelFamily = 'unknown',
      tokensIn = 0,
      tokensOut = 0,
      costUsd = 0,
      toolCounts = {},
      inferredOutcome = 'unknown',
      phaseReached = 'unknown',
      filesTouched = [],
      summary,
      sessionStartedAt,
      sessionEndedAt,
      visibility = 'private'
    } = req.body || {};

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing required field: sessionId' });
    }
    if (!rawUserHandle) {
      return res.status(400).json({ error: 'Missing required field: userHandle' });
    }

    // Normalize user handle (lowercase, no @ prefix)
    const userHandle = normalizeHandle(rawUserHandle);

    // Validate problem type
    const validProblemTypes = ['bugfix', 'feature', 'refactor', 'explore', 'test', 'deploy', 'config', 'unknown'];
    const validOutcomes = ['success', 'partial', 'failed', 'unknown'];
    const validVisibility = ['private', 'discoverable', 'public'];

    const safeProblemType = validProblemTypes.includes(problemType) ? problemType : 'unknown';
    const safeOutcome = validOutcomes.includes(inferredOutcome) ? inferredOutcome : 'unknown';
    const safeVisibility = validVisibility.includes(visibility) ? visibility : 'private';

    // Check if Postgres is configured
    if (!isConfigured()) {
      // Fall back to KV storage
      console.log('[sessions/sync] Postgres not configured, using KV fallback');
      return await syncToKV(req, res, {
        sessionId,
        userHandle,
        techStack,
        projectName,
        problemType: safeProblemType,
        model,
        modelFamily,
        tokensIn,
        tokensOut,
        costUsd,
        toolCounts,
        inferredOutcome: safeOutcome,
        phaseReached,
        filesTouched,
        summary,
        sessionStartedAt,
        sessionEndedAt,
        visibility: safeVisibility
      });
    }

    // Check if this session already exists (for idempotent stats)
    const existing = await sql`
      SELECT session_id FROM session_enrichments WHERE session_id = ${sessionId}
    `;
    const isNewSession = existing.length === 0;

    // Insert or update session enrichment
    await sql`
      INSERT INTO session_enrichments (
        session_id,
        user_handle,
        tech_stack,
        project_name,
        problem_type,
        model,
        model_family,
        tokens_in,
        tokens_out,
        cost_usd,
        tool_counts,
        inferred_outcome,
        phase_reached,
        files_touched,
        summary,
        session_started_at,
        session_ended_at,
        visibility
      ) VALUES (
        ${sessionId},
        ${userHandle},
        ${JSON.stringify(techStack)}::jsonb,
        ${projectName},
        ${safeProblemType},
        ${model},
        ${modelFamily},
        ${tokensIn},
        ${tokensOut},
        ${costUsd},
        ${JSON.stringify(toolCounts)}::jsonb,
        ${safeOutcome},
        ${phaseReached},
        ${JSON.stringify(filesTouched)}::jsonb,
        ${summary},
        ${sessionStartedAt ? new Date(sessionStartedAt) : null},
        ${sessionEndedAt ? new Date(sessionEndedAt) : null},
        ${safeVisibility}
      )
      ON CONFLICT (session_id) DO UPDATE SET
        tech_stack = EXCLUDED.tech_stack,
        project_name = EXCLUDED.project_name,
        problem_type = EXCLUDED.problem_type,
        model = EXCLUDED.model,
        model_family = EXCLUDED.model_family,
        tokens_in = EXCLUDED.tokens_in,
        tokens_out = EXCLUDED.tokens_out,
        cost_usd = EXCLUDED.cost_usd,
        tool_counts = EXCLUDED.tool_counts,
        inferred_outcome = EXCLUDED.inferred_outcome,
        phase_reached = EXCLUDED.phase_reached,
        files_touched = EXCLUDED.files_touched,
        summary = EXCLUDED.summary,
        session_started_at = EXCLUDED.session_started_at,
        session_ended_at = EXCLUDED.session_ended_at,
        visibility = EXCLUDED.visibility,
        enriched_at = NOW()
    `;

    // Only update stats on NEW sessions (idempotent)
    if (isNewSession) {
      await updateUserStats(userHandle, {
        problemType: safeProblemType,
        outcome: safeOutcome,
        tokensIn,
        tokensOut,
        costUsd,
        techStack,
        sessionEndedAt
      });

      // Also update KV for quick access (profile pages, presence)
      await updateKVProfile(userHandle, techStack, toolCounts);
    }

    return res.status(200).json({
      success: true,
      sessionId,
      isNewSession,
      message: isNewSession ? 'Session synced to context graph' : 'Session updated (stats unchanged)'
    });

  } catch (error) {
    console.error('[sessions/sync] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Update user session stats (aggregated metrics)
 * Only called for NEW sessions to maintain idempotency
 */
async function updateUserStats(userHandle, data) {
  const { problemType, outcome, tokensIn, tokensOut, costUsd, techStack, sessionEndedAt } = data;

  // Get or create user stats
  const existing = await sql`
    SELECT * FROM user_session_stats WHERE user_handle = ${userHandle}
  `;

  if (existing.length === 0) {
    // Create new stats record
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
        last_session_at
      ) VALUES (
        ${userHandle},
        1,
        ${tokensIn},
        ${tokensOut},
        ${costUsd},
        ${problemType === 'bugfix' ? 1 : 0},
        ${problemType === 'feature' ? 1 : 0},
        ${problemType === 'refactor' ? 1 : 0},
        ${problemType === 'explore' ? 1 : 0},
        ${outcome === 'success' ? 1 : 0},
        ${outcome === 'partial' ? 1 : 0},
        ${outcome === 'failed' ? 1 : 0},
        ${JSON.stringify(techStack.slice(0, 10))}::jsonb,
        ${sessionEndedAt ? new Date(sessionEndedAt) : new Date()},
        ${sessionEndedAt ? new Date(sessionEndedAt) : new Date()}
      )
    `;
  } else {
    // Update existing stats (increment counts)
    await sql`
      UPDATE user_session_stats SET
        total_sessions = total_sessions + 1,
        total_tokens_in = total_tokens_in + ${tokensIn},
        total_tokens_out = total_tokens_out + ${tokensOut},
        total_cost_usd = total_cost_usd + ${costUsd},
        bugfix_count = bugfix_count + ${problemType === 'bugfix' ? 1 : 0},
        feature_count = feature_count + ${problemType === 'feature' ? 1 : 0},
        refactor_count = refactor_count + ${problemType === 'refactor' ? 1 : 0},
        explore_count = explore_count + ${problemType === 'explore' ? 1 : 0},
        success_count = success_count + ${outcome === 'success' ? 1 : 0},
        partial_count = partial_count + ${outcome === 'partial' ? 1 : 0},
        failed_count = failed_count + ${outcome === 'failed' ? 1 : 0},
        last_session_at = ${sessionEndedAt ? new Date(sessionEndedAt) : new Date()},
        updated_at = NOW()
      WHERE user_handle = ${userHandle}
    `;
  }
}

/**
 * Update KV profile for quick access
 * Only called for NEW sessions to maintain idempotency
 */
async function updateKVProfile(userHandle, techStack, toolCounts) {
  const profileKey = `gigabrain:profile:${userHandle}`;
  const profile = await kv.hgetall(profileKey) || {};

  // Increment tech counts
  for (const tech of techStack) {
    const key = `tech:${tech}`;
    profile[key] = (parseInt(profile[key]) || 0) + 1;
  }

  // Increment tool counts
  for (const [tool, count] of Object.entries(toolCounts)) {
    const key = `tool:${tool}`;
    profile[key] = (parseInt(profile[key]) || 0) + parseInt(count);
  }

  profile.totalSessions = (parseInt(profile.totalSessions) || 0) + 1;
  profile.lastSync = new Date().toISOString();

  await kv.hset(profileKey, profile);
}

/**
 * Fallback to KV storage when Postgres isn't configured
 */
async function syncToKV(req, res, data) {
  // Check if session already exists in KV (for idempotency)
  const existingKey = `sessions:enriched:id:${data.sessionId}`;
  const exists = await kv.exists(existingKey);
  const isNewSession = !exists;

  const record = {
    ...data,
    timestamp: new Date().toISOString()
  };

  // Always store/update the session record
  await kv.set(existingKey, JSON.stringify(record));

  if (isNewSession) {
    // Only update lists and profile on NEW sessions
    const userSessionsKey = `sessions:enriched:${data.userHandle}`;
    await kv.lpush(userSessionsKey, JSON.stringify(record));
    await kv.ltrim(userSessionsKey, 0, 99);

    await kv.lpush('sessions:enriched:recent', JSON.stringify(record));
    await kv.ltrim('sessions:enriched:recent', 0, 499);

    await updateKVProfile(data.userHandle, data.techStack, data.toolCounts);
  }

  return res.status(200).json({
    success: true,
    sessionId: data.sessionId,
    isNewSession,
    message: isNewSession ? 'Session synced (KV fallback)' : 'Session updated (KV, stats unchanged)'
  });
}
