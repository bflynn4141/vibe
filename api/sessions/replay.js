/**
 * /api/sessions/replay
 *
 * Retrieve a shared session for replay.
 * Part of Phase 1: Single Player → Multiplayer Evolution
 *
 * GET /api/sessions/replay?id=ses_abc123
 * Optional: ?since=seq (incremental loading)
 * Optional: ?limit=100 (chunk batch size, default 500)
 *
 * Returns:
 * {
 *   session: {
 *     id: "ses_abc123",
 *     author: "seth",
 *     title: "...",
 *     description: "...",
 *     duration: 3600,
 *     createdAt: "...",
 *     enrichment: {...},
 *     summary: "...",
 *     views: 42,
 *     forks: 3
 *   },
 *   chunks: [...],
 *   totalChunks: 1234,
 *   hasMore: false
 * }
 */

import { sql, isConfigured } from '../lib/db.js';
import { setSecurityHeaders } from '../lib/security.js';

const DEFAULT_CHUNK_LIMIT = 500;
const MAX_CHUNK_LIMIT = 1000;

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check database configuration
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Database not configured'
    });
  }

  const { id, since, limit } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: id'
    });
  }

  // Validate session ID format
  if (!id.startsWith('ses_')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID format'
    });
  }

  // Parse pagination params
  const sinceSeq = since ? parseInt(since, 10) : -1;
  const chunkLimit = Math.min(
    Math.max(parseInt(limit, 10) || DEFAULT_CHUNK_LIMIT, 1),
    MAX_CHUNK_LIMIT
  );

  try {
    // Fetch session metadata
    const sessions = await sql`
      SELECT
        id,
        author_handle,
        title,
        description,
        visibility,
        enrichment,
        summary,
        chunk_count,
        duration_seconds,
        views,
        forks,
        created_at,
        updated_at
      FROM shared_sessions
      WHERE id = ${id}
    `;

    if (sessions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const session = sessions[0];

    // Check visibility (private sessions require auth - for now just block)
    if (session.visibility === 'private') {
      return res.status(403).json({
        success: false,
        error: 'This session is private'
      });
    }

    // Fetch chunks (paginated)
    const chunks = await sql`
      SELECT seq, chunk_type, data, timestamp_ms, metadata
      FROM session_chunks
      WHERE session_id = ${id}
        AND seq > ${sinceSeq}
      ORDER BY seq ASC
      LIMIT ${chunkLimit + 1}
    `;

    // Check if there are more chunks
    const hasMore = chunks.length > chunkLimit;
    const returnedChunks = hasMore ? chunks.slice(0, chunkLimit) : chunks;

    // Increment view count (fire and forget)
    sql`SELECT increment_session_views(${id})`.catch(err => {
      console.error('[sessions/replay] Failed to increment views:', err.message);
    });

    console.log(`[sessions/replay] Session ${id} viewed (chunks ${sinceSeq + 1}-${sinceSeq + returnedChunks.length})`);

    return res.status(200).json({
      success: true,
      session: {
        id: session.id,
        author: session.author_handle,
        title: session.title,
        description: session.description,
        visibility: session.visibility,
        enrichment: session.enrichment,
        summary: session.summary,
        duration: session.duration_seconds,
        totalChunks: session.chunk_count,
        views: session.views,
        forks: session.forks,
        createdAt: session.created_at,
        updatedAt: session.updated_at
      },
      chunks: returnedChunks.map(c => ({
        seq: c.seq,
        type: c.chunk_type,
        data: c.data,
        timestamp: c.timestamp_ms,
        metadata: c.metadata
      })),
      hasMore,
      nextSince: hasMore ? returnedChunks[returnedChunks.length - 1].seq : null
    });

  } catch (error) {
    console.error('[sessions/replay] Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to load session'
    });
  }
}
