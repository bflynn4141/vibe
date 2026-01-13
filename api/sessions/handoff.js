/**
 * /api/sessions/handoff
 *
 * Session context handoffs between users.
 * Part of Phase 2: Multiplayer Collaboration
 *
 * "The big unlock" - David (0xfff)
 *
 * POST /api/sessions/handoff (action: "request")
 * {
 *   from: "seth",
 *   to: "lucas",
 *   sessionContext: {
 *     summary: "Working on AIRC signing...",
 *     cwd: "/path/to/project",
 *     techStack: ["rust", "typescript"],
 *     pendingTasks: ["Fix token parsing"],
 *     keyFiles: [{ path: "src/main.rs", snippet: "..." }]
 *   },
 *   message: "Can you help with this?"
 * }
 *
 * POST /api/sessions/handoff (action: "accept" | "decline")
 * { handoffId: "hoff_abc123" }
 *
 * GET /api/sessions/handoff?user=lucas - List pending handoffs
 * GET /api/sessions/handoff?id=hoff_abc123 - Get specific handoff
 */

import { sql, isConfigured } from '../lib/db.js';
import { setSecurityHeaders } from '../lib/security.js';
import { checkRateLimit, rateLimitResponse } from '../lib/ratelimit.js';
import { sanitizeHandle } from '../lib/sanitize.js';
import { nanoid } from 'nanoid';

const MAX_CONTEXT_SIZE = 500000; // 500KB max for session context
const HANDOFF_EXPIRY_HOURS = 24;

/**
 * Generate a handoff ID
 */
function generateHandoffId() {
  return `hoff_${nanoid(12)}`;
}

/**
 * Validate session context shape
 */
function validateSessionContext(ctx) {
  if (!ctx || typeof ctx !== 'object') {
    return { valid: false, error: 'sessionContext must be an object' };
  }

  // Check size
  const ctxSize = JSON.stringify(ctx).length;
  if (ctxSize > MAX_CONTEXT_SIZE) {
    return { valid: false, error: `Context too large (${Math.round(ctxSize/1024)}KB, max ${MAX_CONTEXT_SIZE/1024}KB)` };
  }

  // Validate required fields with defaults
  const validated = {
    summary: typeof ctx.summary === 'string' ? ctx.summary.slice(0, 5000) : '',
    cwd: typeof ctx.cwd === 'string' ? ctx.cwd : '',
    techStack: Array.isArray(ctx.techStack) ? ctx.techStack.slice(0, 20) : [],
    pendingTasks: Array.isArray(ctx.pendingTasks) ? ctx.pendingTasks.slice(0, 50) : [],
    keyFiles: Array.isArray(ctx.keyFiles) ? ctx.keyFiles.slice(0, 20).map(f => ({
      path: typeof f.path === 'string' ? f.path : '',
      snippet: typeof f.snippet === 'string' ? f.snippet.slice(0, 10000) : ''
    })) : [],
    conversationMd: typeof ctx.conversationMd === 'string' ? ctx.conversationMd.slice(0, 50000) : ''
  };

  return { valid: true, context: validated };
}

/**
 * Handle POST - request, accept, decline
 */
async function handlePost(req, res) {
  const { action, from, to, sessionContext, message, handoffId, handle } = req.body;

  // Determine action
  const resolvedAction = action || (from && to ? 'request' : null);

  if (!resolvedAction) {
    return res.status(400).json({
      success: false,
      error: 'Missing action or from/to fields'
    });
  }

  switch (resolvedAction) {
    case 'request':
      return handleRequest(req, res, { from, to, sessionContext, message });
    case 'accept':
      return handleAccept(req, res, { handoffId, handle });
    case 'decline':
      return handleDecline(req, res, { handoffId, handle });
    default:
      return res.status(400).json({
        success: false,
        error: `Unknown action: ${resolvedAction}`
      });
  }
}

/**
 * Create a handoff request
 */
async function handleRequest(req, res, { from, to, sessionContext, message }) {
  // Validate from handle
  const fromResult = sanitizeHandle(from);
  if (!fromResult.valid) {
    return res.status(400).json({
      success: false,
      error: `from: ${fromResult.error}`
    });
  }
  const normalizedFrom = fromResult.sanitized;

  // Validate to handle
  const toResult = sanitizeHandle(to);
  if (!toResult.valid) {
    return res.status(400).json({
      success: false,
      error: `to: ${toResult.error}`
    });
  }
  const normalizedTo = toResult.sanitized;

  // Can't handoff to yourself
  if (normalizedFrom === normalizedTo) {
    return res.status(400).json({
      success: false,
      error: "Cannot handoff to yourself"
    });
  }

  // Rate limit: 10 handoffs per hour
  const rateCheck = await checkRateLimit(`handoff:request:${normalizedFrom}`, {
    max: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!rateCheck.success) {
    return rateLimitResponse(res);
  }

  // Validate session context
  const ctxResult = validateSessionContext(sessionContext);
  if (!ctxResult.valid) {
    return res.status(400).json({
      success: false,
      error: ctxResult.error
    });
  }

  // Check for existing pending handoff to same user
  const existing = await sql`
    SELECT id FROM session_handoffs
    WHERE from_handle = ${normalizedFrom}
      AND to_handle = ${normalizedTo}
      AND status = 'pending'
      AND expires_at > NOW()
  `;

  if (existing.length > 0) {
    return res.status(409).json({
      success: false,
      error: 'You already have a pending handoff to this user',
      existingHandoffId: existing[0].id
    });
  }

  // Create handoff
  const handoffId = generateHandoffId();
  const expiresAt = new Date(Date.now() + HANDOFF_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  const sanitizedMessage = message ? message.slice(0, 1000) : null;

  try {
    await sql`
      INSERT INTO session_handoffs (
        id, from_handle, to_handle, status, session_context, message, expires_at
      ) VALUES (
        ${handoffId},
        ${normalizedFrom},
        ${normalizedTo},
        'pending',
        ${JSON.stringify(ctxResult.context)},
        ${sanitizedMessage},
        ${expiresAt}
      )
    `;

    // Create notification for recipient
    try {
      await sql`
        INSERT INTO notifications (id, user_handle, type, title, body, data, created_at)
        VALUES (
          ${`notif_${nanoid(12)}`},
          ${normalizedTo},
          'handoff_request',
          ${`@${normalizedFrom} wants to hand off a session`},
          ${sanitizedMessage || ctxResult.context.summary?.slice(0, 200) || 'Session handoff request'},
          ${JSON.stringify({ handoffId, from: normalizedFrom })}::jsonb,
          NOW()
        )
      `;
    } catch (notifErr) {
      // Non-fatal if notifications table doesn't exist yet
      console.warn('[handoff] Failed to create notification:', notifErr.message);
    }

    console.log(`[handoff] Request created: ${handoffId} from @${normalizedFrom} to @${normalizedTo}`);

    return res.status(200).json({
      success: true,
      handoffId,
      status: 'pending',
      expiresAt,
      to: normalizedTo
    });

  } catch (error) {
    console.error('[handoff] Request error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create handoff request'
    });
  }
}

/**
 * Accept a handoff
 */
async function handleAccept(req, res, { handoffId, handle }) {
  if (!handoffId) {
    return res.status(400).json({
      success: false,
      error: 'Missing handoffId'
    });
  }

  // Validate handle
  const handleResult = sanitizeHandle(handle);
  if (!handleResult.valid) {
    return res.status(400).json({
      success: false,
      error: `handle: ${handleResult.error}`
    });
  }
  const normalizedHandle = handleResult.sanitized;

  try {
    // Get handoff
    const handoffs = await sql`
      SELECT id, from_handle, to_handle, status, session_context, message, expires_at
      FROM session_handoffs
      WHERE id = ${handoffId}
    `;

    if (handoffs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Handoff not found'
      });
    }

    const handoff = handoffs[0];

    // Check if user is the recipient
    if (handoff.to_handle !== normalizedHandle) {
      return res.status(403).json({
        success: false,
        error: 'You are not the recipient of this handoff'
      });
    }

    // Check status
    if (handoff.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: `Handoff already ${handoff.status}`
      });
    }

    // Check expiry
    if (new Date(handoff.expires_at) < new Date()) {
      await sql`UPDATE session_handoffs SET status = 'expired' WHERE id = ${handoffId}`;
      return res.status(410).json({
        success: false,
        error: 'Handoff has expired'
      });
    }

    // Accept the handoff
    await sql`
      UPDATE session_handoffs
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = ${handoffId}
    `;

    console.log(`[handoff] Accepted: ${handoffId} by @${normalizedHandle}`);

    return res.status(200).json({
      success: true,
      handoffId,
      status: 'accepted',
      from: handoff.from_handle,
      sessionContext: handoff.session_context,
      message: handoff.message
    });

  } catch (error) {
    console.error('[handoff] Accept error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to accept handoff'
    });
  }
}

/**
 * Decline a handoff
 */
async function handleDecline(req, res, { handoffId, handle }) {
  if (!handoffId) {
    return res.status(400).json({
      success: false,
      error: 'Missing handoffId'
    });
  }

  // Validate handle
  const handleResult = sanitizeHandle(handle);
  if (!handleResult.valid) {
    return res.status(400).json({
      success: false,
      error: `handle: ${handleResult.error}`
    });
  }
  const normalizedHandle = handleResult.sanitized;

  try {
    // Get handoff
    const handoffs = await sql`
      SELECT id, from_handle, to_handle, status
      FROM session_handoffs
      WHERE id = ${handoffId}
    `;

    if (handoffs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Handoff not found'
      });
    }

    const handoff = handoffs[0];

    // Check if user is the recipient
    if (handoff.to_handle !== normalizedHandle) {
      return res.status(403).json({
        success: false,
        error: 'You are not the recipient of this handoff'
      });
    }

    // Check status
    if (handoff.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: `Handoff already ${handoff.status}`
      });
    }

    // Decline the handoff
    await sql`
      UPDATE session_handoffs
      SET status = 'declined'
      WHERE id = ${handoffId}
    `;

    console.log(`[handoff] Declined: ${handoffId} by @${normalizedHandle}`);

    return res.status(200).json({
      success: true,
      handoffId,
      status: 'declined'
    });

  } catch (error) {
    console.error('[handoff] Decline error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to decline handoff'
    });
  }
}

/**
 * Handle GET - list pending or get specific
 */
async function handleGet(req, res) {
  const { user, id } = req.query;

  if (id) {
    return getHandoff(req, res, id);
  }

  if (user) {
    return listPendingHandoffs(req, res, user);
  }

  return res.status(400).json({
    success: false,
    error: 'Missing user or id parameter'
  });
}

/**
 * Get a specific handoff
 */
async function getHandoff(req, res, handoffId) {
  try {
    const handoffs = await sql`
      SELECT id, from_handle, to_handle, status, session_context, message,
             created_at, expires_at, accepted_at
      FROM session_handoffs
      WHERE id = ${handoffId}
    `;

    if (handoffs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Handoff not found'
      });
    }

    const h = handoffs[0];

    return res.status(200).json({
      success: true,
      handoff: {
        id: h.id,
        from: h.from_handle,
        to: h.to_handle,
        status: h.status,
        sessionContext: h.session_context,
        message: h.message,
        createdAt: h.created_at,
        expiresAt: h.expires_at,
        acceptedAt: h.accepted_at
      }
    });

  } catch (error) {
    console.error('[handoff] Get error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get handoff'
    });
  }
}

/**
 * List pending handoffs for a user
 */
async function listPendingHandoffs(req, res, user) {
  const handleResult = sanitizeHandle(user);
  if (!handleResult.valid) {
    return res.status(400).json({
      success: false,
      error: `user: ${handleResult.error}`
    });
  }
  const normalizedUser = handleResult.sanitized;

  try {
    // First, expire old handoffs
    await sql`
      UPDATE session_handoffs
      SET status = 'expired'
      WHERE status = 'pending' AND expires_at < NOW()
    `;

    // Get pending handoffs where user is recipient
    const incoming = await sql`
      SELECT id, from_handle, to_handle, status, session_context, message,
             created_at, expires_at
      FROM session_handoffs
      WHERE to_handle = ${normalizedUser}
        AND status = 'pending'
      ORDER BY created_at DESC
    `;

    // Get pending handoffs where user is sender
    const outgoing = await sql`
      SELECT id, from_handle, to_handle, status, message, created_at, expires_at
      FROM session_handoffs
      WHERE from_handle = ${normalizedUser}
        AND status = 'pending'
      ORDER BY created_at DESC
    `;

    return res.status(200).json({
      success: true,
      incoming: incoming.map(h => ({
        id: h.id,
        from: h.from_handle,
        message: h.message,
        summary: h.session_context?.summary?.slice(0, 200),
        techStack: h.session_context?.techStack || [],
        createdAt: h.created_at,
        expiresAt: h.expires_at
      })),
      outgoing: outgoing.map(h => ({
        id: h.id,
        to: h.to_handle,
        message: h.message,
        createdAt: h.created_at,
        expiresAt: h.expires_at
      })),
      counts: {
        incoming: incoming.length,
        outgoing: outgoing.length
      }
    });

  } catch (error) {
    console.error('[handoff] List error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list handoffs'
    });
  }
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured'
    });
  }

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
