/**
 * Board Comments API
 *
 * POST /api/board/comment - Add comment to a board entry
 * Body: { entryId, handle, text }
 *
 * GET /api/board/comment?entryId=X - Get comments for an entry
 *
 * Notifies post author when someone comments on their ship.
 */

import { kv } from '@vercel/kv';
import { checkRateLimit, rateLimitResponse } from '../lib/ratelimit.js';
import { sanitizeContent, sanitizeHandle } from '../lib/sanitize.js';
import { setSecurityHeaders } from '../lib/security.js';
import { logEvent } from '../lib/events.js';
import { logInteraction } from '../lib/graph.js';

const MESSAGES_KEY = 'vibe:messages';

export default async function handler(req, res) {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Retrieve comments for an entry
  if (req.method === 'GET') {
    const { entryId } = req.query;

    if (!entryId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: entryId'
      });
    }

    try {
      const entry = await kv.get(`board:entry:${entryId}`);

      if (!entry) {
        return res.status(404).json({
          success: false,
          error: 'Entry not found'
        });
      }

      return res.status(200).json({
        success: true,
        entryId,
        comments: entry.comments || [],
        count: (entry.comments || []).length
      });
    } catch (e) {
      console.error('[board/comment] GET error:', e.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to get comments'
      });
    }
  }

  // POST - Add a comment
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { entryId, handle, text } = req.body;

  // Validate required fields
  if (!entryId || !handle || !text) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: entryId, handle, text'
    });
  }

  // Sanitize handle
  const handleResult = sanitizeHandle(handle);
  if (!handleResult.valid) {
    return res.status(400).json({
      success: false,
      error: handleResult.error
    });
  }
  const normalizedHandle = handleResult.sanitized;

  // Sanitize comment text (max 500 chars)
  const textResult = sanitizeContent(text, 500);
  if (!textResult.valid) {
    return res.status(400).json({
      success: false,
      error: 'Invalid comment text',
      details: textResult.errors
    });
  }
  const sanitizedText = textResult.sanitized;

  // Rate limit: 20 comments per hour per user
  const rateCheck = await checkRateLimit(`board:comment:${normalizedHandle}`, {
    max: 20,
    windowMs: 60 * 60 * 1000
  });

  if (!rateCheck.success) {
    return rateLimitResponse(res);
  }

  try {
    // Get the entry
    const entry = await kv.get(`board:entry:${entryId}`);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Entry not found'
      });
    }

    // Create comment
    const comment = {
      id: `cmt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`,
      handle: normalizedHandle,
      text: sanitizedText,
      createdAt: new Date().toISOString()
    };

    // Add to entry's comments
    entry.comments = entry.comments || [];
    entry.comments.push(comment);
    await kv.set(`board:entry:${entryId}`, entry);

    // Log analytics event
    await logEvent(kv, 'board_comment_created', normalizedHandle, {
      entryId,
      commentId: comment.id,
      postAuthor: entry.author
    });

    // Notify post author (if not commenting on own post)
    if (entry.author && entry.author !== normalizedHandle) {
      try {
        const messages = await kv.get(MESSAGES_KEY) || [];

        const preview = sanitizedText.length > 50
          ? sanitizedText.substring(0, 50) + '...'
          : sanitizedText;

        messages.push({
          id: `notif_${Date.now().toString(36)}`,
          from: 'vibe',
          to: entry.author,
          text: `\uD83D\uDCAC @${normalizedHandle} commented on your ship: "${preview}"`,
          createdAt: new Date().toISOString(),
          read: false,
          type: 'comment_notification',
          metadata: {
            entryId,
            commentId: comment.id
          }
        });

        // Keep last 10k messages
        if (messages.length > 10000) {
          messages.splice(0, messages.length - 10000);
        }

        await kv.set(MESSAGES_KEY, messages);
      } catch (notifErr) {
        console.error('[board/comment] Notification error:', notifErr.message);
        // Non-critical, continue
      }

      // Log to social graph (non-blocking)
      logInteraction({
        from: normalizedHandle,
        to: entry.author,
        action: 'comment',
        metadata: { entryId, commentId: comment.id }
      }).catch(e => console.error('[board/comment] Graph log error:', e.message));
    }

    return res.status(200).json({
      success: true,
      comment,
      totalComments: entry.comments.length,
      message: `Comment added to ${entry.author}'s post`
    });

  } catch (e) {
    console.error('[board/comment] POST error:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to add comment',
      message: e.message
    });
  }
}
