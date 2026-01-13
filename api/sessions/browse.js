/**
 * /api/sessions/browse
 *
 * Discover shared sessions by skill, author, or problem type.
 * Part of Phase 1: Single Player → Multiplayer Evolution
 *
 * GET /api/sessions/browse
 * Optional filters:
 *   ?skill=rust (filter by tech stack)
 *   ?author=seth (filter by author)
 *   ?problemType=feature (filter by problem type)
 *   ?limit=20 (default 20, max 100)
 *   ?offset=0 (for pagination)
 *   ?sort=recent|popular|views (default recent)
 *
 * Returns:
 * {
 *   sessions: [
 *     {
 *       id: "ses_abc123",
 *       author: "seth",
 *       title: "...",
 *       description: "...",
 *       enrichment: {...},
 *       summary: "...",
 *       duration: 3600,
 *       views: 42,
 *       forks: 3,
 *       createdAt: "..."
 *     }
 *   ],
 *   total: 150,
 *   hasMore: true
 * }
 */

import { sql, isConfigured } from '../lib/db.js';
import { setSecurityHeaders } from '../lib/security.js';
import { sanitizeHandle } from '../lib/sanitize.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VALID_SORTS = ['recent', 'popular', 'views'];

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

  const { skill, author, problemType, limit, offset, sort } = req.query;

  // Parse pagination
  const queryLimit = Math.min(
    Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );
  const queryOffset = Math.max(parseInt(offset, 10) || 0, 0);

  // Validate sort
  const querySort = VALID_SORTS.includes(sort) ? sort : 'recent';

  // Validate author if provided
  let normalizedAuthor = null;
  if (author) {
    const authorResult = sanitizeHandle(author);
    if (!authorResult.valid) {
      return res.status(400).json({
        success: false,
        error: `author: ${authorResult.error}`
      });
    }
    normalizedAuthor = authorResult.sanitized;
  }

  try {
    // Build dynamic query based on filters
    // Using the helper function from migration or raw SQL

    let sessions;
    let countResult;

    // Base conditions: public visibility only
    const baseConditions = [];
    const params = [];

    // Build WHERE clause dynamically
    let whereClause = "visibility = 'public'";

    if (normalizedAuthor) {
      whereClause += ` AND author_handle = '${normalizedAuthor}'`;
    }

    if (skill) {
      // Search in techStack array within enrichment JSONB
      whereClause += ` AND enrichment->'techStack' ? '${skill}'`;
    }

    if (problemType) {
      whereClause += ` AND enrichment->>'problemType' = '${problemType}'`;
    }

    // Determine ORDER BY
    let orderClause;
    switch (querySort) {
      case 'popular':
        orderClause = 'forks DESC, views DESC, created_at DESC';
        break;
      case 'views':
        orderClause = 'views DESC, created_at DESC';
        break;
      case 'recent':
      default:
        orderClause = 'created_at DESC';
    }

    // Execute query using parameterized approach
    if (normalizedAuthor && skill && problemType) {
      sessions = await sql`
        SELECT id, author_handle, title, description, enrichment, summary,
               duration_seconds, views, forks, created_at
        FROM shared_sessions
        WHERE visibility = 'public'
          AND author_handle = ${normalizedAuthor}
          AND enrichment->'techStack' ? ${skill}
          AND enrichment->>'problemType' = ${problemType}
        ORDER BY ${querySort === 'popular' ? sql`forks DESC, views DESC, created_at DESC` :
                  querySort === 'views' ? sql`views DESC, created_at DESC` :
                  sql`created_at DESC`}
        LIMIT ${queryLimit + 1}
        OFFSET ${queryOffset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as total FROM shared_sessions
        WHERE visibility = 'public'
          AND author_handle = ${normalizedAuthor}
          AND enrichment->'techStack' ? ${skill}
          AND enrichment->>'problemType' = ${problemType}
      `;
    } else if (normalizedAuthor && skill) {
      sessions = await sql`
        SELECT id, author_handle, title, description, enrichment, summary,
               duration_seconds, views, forks, created_at
        FROM shared_sessions
        WHERE visibility = 'public'
          AND author_handle = ${normalizedAuthor}
          AND enrichment->'techStack' ? ${skill}
        ORDER BY ${querySort === 'popular' ? sql`forks DESC, views DESC, created_at DESC` :
                  querySort === 'views' ? sql`views DESC, created_at DESC` :
                  sql`created_at DESC`}
        LIMIT ${queryLimit + 1}
        OFFSET ${queryOffset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as total FROM shared_sessions
        WHERE visibility = 'public'
          AND author_handle = ${normalizedAuthor}
          AND enrichment->'techStack' ? ${skill}
      `;
    } else if (normalizedAuthor && problemType) {
      sessions = await sql`
        SELECT id, author_handle, title, description, enrichment, summary,
               duration_seconds, views, forks, created_at
        FROM shared_sessions
        WHERE visibility = 'public'
          AND author_handle = ${normalizedAuthor}
          AND enrichment->>'problemType' = ${problemType}
        ORDER BY ${querySort === 'popular' ? sql`forks DESC, views DESC, created_at DESC` :
                  querySort === 'views' ? sql`views DESC, created_at DESC` :
                  sql`created_at DESC`}
        LIMIT ${queryLimit + 1}
        OFFSET ${queryOffset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as total FROM shared_sessions
        WHERE visibility = 'public'
          AND author_handle = ${normalizedAuthor}
          AND enrichment->>'problemType' = ${problemType}
      `;
    } else if (skill && problemType) {
      sessions = await sql`
        SELECT id, author_handle, title, description, enrichment, summary,
               duration_seconds, views, forks, created_at
        FROM shared_sessions
        WHERE visibility = 'public'
          AND enrichment->'techStack' ? ${skill}
          AND enrichment->>'problemType' = ${problemType}
        ORDER BY ${querySort === 'popular' ? sql`forks DESC, views DESC, created_at DESC` :
                  querySort === 'views' ? sql`views DESC, created_at DESC` :
                  sql`created_at DESC`}
        LIMIT ${queryLimit + 1}
        OFFSET ${queryOffset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as total FROM shared_sessions
        WHERE visibility = 'public'
          AND enrichment->'techStack' ? ${skill}
          AND enrichment->>'problemType' = ${problemType}
      `;
    } else if (normalizedAuthor) {
      sessions = await sql`
        SELECT id, author_handle, title, description, enrichment, summary,
               duration_seconds, views, forks, created_at
        FROM shared_sessions
        WHERE visibility = 'public'
          AND author_handle = ${normalizedAuthor}
        ORDER BY ${querySort === 'popular' ? sql`forks DESC, views DESC, created_at DESC` :
                  querySort === 'views' ? sql`views DESC, created_at DESC` :
                  sql`created_at DESC`}
        LIMIT ${queryLimit + 1}
        OFFSET ${queryOffset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as total FROM shared_sessions
        WHERE visibility = 'public'
          AND author_handle = ${normalizedAuthor}
      `;
    } else if (skill) {
      sessions = await sql`
        SELECT id, author_handle, title, description, enrichment, summary,
               duration_seconds, views, forks, created_at
        FROM shared_sessions
        WHERE visibility = 'public'
          AND enrichment->'techStack' ? ${skill}
        ORDER BY ${querySort === 'popular' ? sql`forks DESC, views DESC, created_at DESC` :
                  querySort === 'views' ? sql`views DESC, created_at DESC` :
                  sql`created_at DESC`}
        LIMIT ${queryLimit + 1}
        OFFSET ${queryOffset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as total FROM shared_sessions
        WHERE visibility = 'public'
          AND enrichment->'techStack' ? ${skill}
      `;
    } else if (problemType) {
      sessions = await sql`
        SELECT id, author_handle, title, description, enrichment, summary,
               duration_seconds, views, forks, created_at
        FROM shared_sessions
        WHERE visibility = 'public'
          AND enrichment->>'problemType' = ${problemType}
        ORDER BY ${querySort === 'popular' ? sql`forks DESC, views DESC, created_at DESC` :
                  querySort === 'views' ? sql`views DESC, created_at DESC` :
                  sql`created_at DESC`}
        LIMIT ${queryLimit + 1}
        OFFSET ${queryOffset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as total FROM shared_sessions
        WHERE visibility = 'public'
          AND enrichment->>'problemType' = ${problemType}
      `;
    } else {
      // No filters
      sessions = await sql`
        SELECT id, author_handle, title, description, enrichment, summary,
               duration_seconds, views, forks, created_at
        FROM shared_sessions
        WHERE visibility = 'public'
        ORDER BY ${querySort === 'popular' ? sql`forks DESC, views DESC, created_at DESC` :
                  querySort === 'views' ? sql`views DESC, created_at DESC` :
                  sql`created_at DESC`}
        LIMIT ${queryLimit + 1}
        OFFSET ${queryOffset}
      `;
      countResult = await sql`
        SELECT COUNT(*) as total FROM shared_sessions
        WHERE visibility = 'public'
      `;
    }

    // Check if there are more results
    const hasMore = sessions.length > queryLimit;
    const returnedSessions = hasMore ? sessions.slice(0, queryLimit) : sessions;
    const total = parseInt(countResult[0]?.total || 0, 10);

    console.log(`[sessions/browse] Found ${returnedSessions.length} sessions (${total} total)`);

    return res.status(200).json({
      success: true,
      sessions: returnedSessions.map(s => ({
        id: s.id,
        author: s.author_handle,
        title: s.title,
        description: s.description,
        enrichment: s.enrichment,
        summary: s.summary,
        duration: s.duration_seconds,
        views: s.views,
        forks: s.forks,
        createdAt: s.created_at
      })),
      total,
      hasMore,
      filters: {
        skill: skill || null,
        author: normalizedAuthor,
        problemType: problemType || null,
        sort: querySort
      }
    });

  } catch (error) {
    console.error('[sessions/browse] Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to browse sessions'
    });
  }
}
