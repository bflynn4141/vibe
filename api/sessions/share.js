/**
 * /api/sessions/share
 *
 * Upload a session for sharing and replay.
 * Part of Phase 1: Single Player → Multiplayer Evolution
 *
 * POST /api/sessions/share - Upload session for sharing
 * {
 *   handle: "seth",
 *   sessionId: "local-uuid",
 *   title: "Implementing AIRC signing",
 *   description: "Built invisible crypto for vibe",
 *   visibility: "public" | "unlisted" | "private",
 *   enrichment: { techStack, problemType, outcome, tokenCount, cost, duration },
 *   chunks: [{ seq, type, data, timestamp }],
 *   summary: "AI-generated summary"
 * }
 *
 * Returns:
 * {
 *   success: true,
 *   shareId: "ses_abc123",
 *   shareUrl: "https://slashvibe.dev/session/ses_abc123",
 *   replayUrl: "https://slashvibe.dev/replay/ses_abc123"
 * }
 */

import { sql, isConfigured } from '../lib/db.js';
import { setSecurityHeaders } from '../lib/security.js';
import { checkRateLimit, rateLimitResponse } from '../lib/ratelimit.js';
import { sanitizeHandle, sanitizeContent } from '../lib/sanitize.js';
import { nanoid } from 'nanoid';

const BASE_URL = process.env.VIBE_BASE_URL || 'https://slashvibe.dev';
const MAX_CHUNKS = 10000;  // ~5MB max assuming 500 bytes avg per chunk
const MAX_CHUNK_SIZE = 50000;  // 50KB per chunk base64
const VALID_VISIBILITIES = ['public', 'unlisted', 'private'];
const VALID_CHUNK_TYPES = ['output', 'input', 'marker', 'thinking'];

/**
 * Generate a session share ID
 */
function generateShareId() {
  return `ses_${nanoid(12)}`;
}

/**
 * Validate enrichment object shape
 */
function validateEnrichment(enrichment) {
  if (!enrichment || typeof enrichment !== 'object') {
    return { valid: false, error: 'enrichment must be an object' };
  }

  // Optional fields with reasonable defaults
  const validated = {
    techStack: Array.isArray(enrichment.techStack) ? enrichment.techStack.slice(0, 20) : [],
    problemType: typeof enrichment.problemType === 'string' ? enrichment.problemType : 'unknown',
    outcome: typeof enrichment.outcome === 'string' ? enrichment.outcome : 'unknown',
    tokenCount: typeof enrichment.tokenCount === 'number' ? enrichment.tokenCount : 0,
    cost: typeof enrichment.cost === 'number' ? enrichment.cost : 0,
    duration: typeof enrichment.duration === 'number' ? enrichment.duration : 0
  };

  return { valid: true, enrichment: validated };
}

/**
 * Validate chunk array
 */
function validateChunks(chunks) {
  if (!Array.isArray(chunks)) {
    return { valid: false, error: 'chunks must be an array' };
  }

  if (chunks.length > MAX_CHUNKS) {
    return { valid: false, error: `Too many chunks (max ${MAX_CHUNKS})` };
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (typeof chunk.seq !== 'number') {
      return { valid: false, error: `Chunk ${i}: missing seq number` };
    }

    if (!VALID_CHUNK_TYPES.includes(chunk.type)) {
      return { valid: false, error: `Chunk ${i}: invalid type "${chunk.type}"` };
    }

    if (typeof chunk.data !== 'string') {
      return { valid: false, error: `Chunk ${i}: data must be string` };
    }

    if (chunk.data.length > MAX_CHUNK_SIZE) {
      return { valid: false, error: `Chunk ${i}: data too large (max ${MAX_CHUNK_SIZE})` };
    }

    if (typeof chunk.timestamp !== 'number' && typeof chunk.timestamp !== 'string') {
      return { valid: false, error: `Chunk ${i}: missing timestamp` };
    }
  }

  return { valid: true };
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check database configuration
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured'
    });
  }

  const { handle, sessionId, title, description, visibility, enrichment, chunks, summary } = req.body;

  // Validate required fields
  if (!handle || !title || !enrichment || !chunks) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: handle, title, enrichment, chunks'
    });
  }

  // Sanitize handle
  const handleResult = sanitizeHandle(handle);
  if (!handleResult.valid) {
    return res.status(400).json({
      success: false,
      error: `handle: ${handleResult.error}`
    });
  }
  const normalizedHandle = handleResult.sanitized;

  // Rate limit: 10 shares per hour per user
  const rateCheck = await checkRateLimit(`sessions:share:${normalizedHandle}`, {
    max: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!rateCheck.success) {
    return rateLimitResponse(res);
  }

  // Validate visibility
  const validVisibility = VALID_VISIBILITIES.includes(visibility) ? visibility : 'public';

  // Validate enrichment
  const enrichmentResult = validateEnrichment(enrichment);
  if (!enrichmentResult.valid) {
    return res.status(400).json({
      success: false,
      error: enrichmentResult.error
    });
  }

  // Validate chunks
  const chunksResult = validateChunks(chunks);
  if (!chunksResult.valid) {
    return res.status(400).json({
      success: false,
      error: chunksResult.error
    });
  }

  // Sanitize title and description
  const titleResult = sanitizeContent(title, 200);
  if (!titleResult.valid) {
    return res.status(400).json({
      success: false,
      error: `title: ${titleResult.error}`
    });
  }

  const sanitizedDescription = description
    ? sanitizeContent(description, 2000).sanitized
    : null;

  const sanitizedSummary = summary
    ? sanitizeContent(summary, 5000).sanitized
    : null;

  // Generate share ID
  const shareId = generateShareId();
  const now = new Date().toISOString();

  try {
    // Insert session
    await sql`
      INSERT INTO shared_sessions (
        id, author_handle, title, description, visibility,
        enrichment, summary, chunk_count, duration_seconds, created_at
      ) VALUES (
        ${shareId},
        ${normalizedHandle},
        ${titleResult.sanitized},
        ${sanitizedDescription},
        ${validVisibility},
        ${JSON.stringify(enrichmentResult.enrichment)},
        ${sanitizedSummary},
        ${chunks.length},
        ${enrichmentResult.enrichment.duration || null},
        ${now}
      )
    `;

    // Insert chunks in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      // Build values for batch insert
      const values = batch.map(chunk => ({
        session_id: shareId,
        seq: chunk.seq,
        chunk_type: chunk.type,
        data: chunk.data,
        timestamp_ms: typeof chunk.timestamp === 'number'
          ? chunk.timestamp
          : new Date(chunk.timestamp).getTime(),
        metadata: chunk.metadata ? JSON.stringify(chunk.metadata) : null
      }));

      // Insert batch
      for (const v of values) {
        await sql`
          INSERT INTO session_chunks (session_id, seq, chunk_type, data, timestamp_ms, metadata)
          VALUES (${v.session_id}, ${v.seq}, ${v.chunk_type}, ${v.data}, ${v.timestamp_ms}, ${v.metadata})
        `;
      }
    }

    console.log(`[sessions/share] Session ${shareId} shared by @${normalizedHandle} (${chunks.length} chunks)`);

    return res.status(200).json({
      success: true,
      shareId,
      shareUrl: `${BASE_URL}/session/${shareId}`,
      replayUrl: `${BASE_URL}/replay/${shareId}`,
      chunkCount: chunks.length,
      visibility: validVisibility
    });

  } catch (error) {
    console.error('[sessions/share] Error:', error);

    // Clean up partial insert
    try {
      await sql`DELETE FROM shared_sessions WHERE id = ${shareId}`;
    } catch (cleanupError) {
      console.error('[sessions/share] Cleanup error:', cleanupError);
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to save session'
    });
  }
}
