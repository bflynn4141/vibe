/**
 * SYNC NOTE: This file is duplicated from vibecodings repo
 * Location: ~/Projects/vibecodings/api/messages.js
 * vibe-public is now canonical - updates should happen here first
 *
 * Messages API - Terminal-native messaging for Claude Code users
 *
 * Uses Vercel KV (Redis) for persistence across cold starts
 * Falls back to in-memory if KV not configured
 *
 * POST /api/messages - Send a message
 * GET /api/messages?user=X - Get inbox for user X
 * GET /api/messages?user=X&with=Y - Get thread between X and Y
 *
 * AIRC v0.2.1: Message signing enforcement
 * - AIRC_STRICT_MODE=true: Force strict mode (reject unsigned) even during grace period
 * - AIRC_STRICT_MODE=false: Accept unsigned with deprecation warning
 * - Default: Strict mode OFF during grace period (until Feb 1, 2026), ON after
 * - Grace period header: X-AIRC-Strict-Mode: optional
 */

import { logEvent } from './lib/events.js';
import { checkRateLimit, rateLimitResponse } from './lib/ratelimit.js';
import { sanitizeMessage } from './lib/sanitize.js';
import { setSecurityHeaders } from './lib/security.js';
import { parseAIRCKey, verify, validateTimestamp, canonicalJSON } from './lib/crypto.js';
import { logInteraction } from './lib/graph.js';

// AIRC v0.2.1: Strict mode configuration
// - AIRC_STRICT_MODE=true forces strict mode even during grace period (for testing)
// - AIRC_STRICT_MODE=false forces permissive mode even after grace period
// - Default (unset): strict mode OFF during grace period, ON after
const GRACE_PERIOD_END = new Date('2026-02-01T00:00:00Z');
const IN_GRACE_PERIOD = Date.now() < GRACE_PERIOD_END.getTime();
const STRICT_MODE = process.env.AIRC_STRICT_MODE === 'true' ||
  (process.env.AIRC_STRICT_MODE !== 'false' && !IN_GRACE_PERIOD);

// Check if KV is configured via environment variables
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Key for all messages
const MESSAGES_KEY = 'vibe:messages';

// In-memory fallback
let memoryMessages = [];

// KV wrapper functions
async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

async function getMessages() {
  const kv = await getKV();
  if (kv) {
    const messages = await kv.get(MESSAGES_KEY);
    return messages || [];
  }
  return memoryMessages;
}

async function saveMessages(messages) {
  const kv = await getKV();
  if (kv) {
    await kv.set(MESSAGES_KEY, messages);
  }
  memoryMessages = messages;
}

function generateId() {
  return 'msg_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
}

/**
 * AIRC v0.2.1: Verify message signature
 *
 * Signed message format:
 * {
 *   from: "@sender",
 *   to: "@recipient",
 *   text: "message content",
 *   timestamp: "2026-01-13T12:00:00.000Z",
 *   nonce: "abc123...",  // 32 hex chars
 *   signature: "base64..."
 * }
 *
 * @param {object} message - Message with signature fields
 * @param {string} senderPublicKey - Sender's AIRC public key (ed25519:base64...)
 * @returns {{valid: boolean, error?: string, warning?: string}}
 */
async function verifyMessageSignature(message, senderPublicKey) {
  // Check required signature fields
  if (!message.signature) {
    if (STRICT_MODE) {
      return { valid: false, error: 'signature_required', message: 'Message signature is required' };
    }
    // Grace period: warn but accept
    return { valid: true, warning: 'Message is unsigned. Signing will be required after Feb 1, 2026.' };
  }

  if (!message.timestamp) {
    return { valid: false, error: 'timestamp_required', message: 'Timestamp is required for signed messages' };
  }

  if (!message.nonce) {
    return { valid: false, error: 'nonce_required', message: 'Nonce is required for signed messages' };
  }

  // Validate nonce format (32 hex characters)
  if (!/^[a-f0-9]{32}$/i.test(message.nonce)) {
    return { valid: false, error: 'invalid_nonce', message: 'Nonce must be 32 hex characters' };
  }

  // Validate timestamp (5-minute window)
  const timestampCheck = validateTimestamp(message.timestamp, 300);
  if (!timestampCheck.valid) {
    return { valid: false, error: timestampCheck.error, message: timestampCheck.message };
  }

  // Parse sender's public key
  const keyParsed = parseAIRCKey(senderPublicKey);
  if (!keyParsed) {
    return { valid: false, error: 'invalid_sender_key', message: 'Could not parse sender public key' };
  }

  // Reconstruct signed message (canonical JSON without signature)
  const { signature, ...messageWithoutSig } = message;
  const canonicalMessage = canonicalJSON(messageWithoutSig);

  // Verify signature
  const isValid = verify(canonicalMessage, signature, keyParsed.raw);
  if (!isValid) {
    return { valid: false, error: 'invalid_signature', message: 'Message signature verification failed' };
  }

  return { valid: true };
}

/**
 * Fetch sender's public key from KV
 */
async function getSenderPublicKey(kv, handle) {
  if (!kv) return null;
  const user = await kv.hgetall(`user:${handle}`);
  return user?.publicKey || null;
}

/**
 * AIRC v0.2.1: Check and store message nonce (replay prevention)
 *
 * @param {object} kv - Vercel KV instance
 * @param {string} nonce - Message nonce (32 hex chars)
 * @param {string} handle - Sender handle
 * @returns {{used: boolean, error?: string, kvUnavailable?: boolean}}
 */
async function checkAndStoreNonce(kv, nonce, handle) {
  if (!nonce) return { used: false };

  // Fail closed: if KV is unavailable, we cannot verify replay protection
  if (!kv) {
    return { used: false, kvUnavailable: true, error: 'Replay protection unavailable (KV not configured)' };
  }

  const nonceKey = `airc:nonce:msg:${nonce}`;

  try {
    // Try to set nonce with NX (only if not exists) and 10 min TTL
    // Returns OK if set, null if already exists
    const result = await kv.set(nonceKey, handle, { nx: true, ex: 600 });
    return { used: result === null };
  } catch (e) {
    // KV error - fail closed
    return { used: false, kvUnavailable: true, error: `Replay protection error: ${e.message}` };
  }
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default async function handler(req, res) {
  // Security headers
  setSecurityHeaders(res);
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - Send a message
  if (req.method === 'POST') {
    // Sanitize and validate input
    const validation = sanitizeMessage(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: validation.errors
      });
    }

    const { from, to, text } = validation.sanitized;

    // Rate limit: 100 messages per hour per sender
    const rateCheck = await checkRateLimit(`messages:send:${from}`, {
      max: 100,
      windowMs: 60 * 60 * 1000
    });

    if (!rateCheck.success) {
      return rateLimitResponse(res);
    }

    // AIRC v0.2.1: Verify message signature
    const kv = await getKV();
    let signatureWarning = null;
    let replayWarning = null;

    // Get sender's public key for signature verification (use sanitized handle for lookup)
    const senderPublicKey = await getSenderPublicKey(kv, from);

    // Build message object using RAW values from request body for signature verification
    // Clients sign their raw payload, not the sanitized version
    const rawMessage = {
      from: req.body.from,
      to: req.body.to,
      text: req.body.text,
      timestamp: req.body.timestamp,
      nonce: req.body.nonce
    };

    // Check if message is signed
    const isSigned = !!req.body.signature;

    // During grace period, ALWAYS warn about unsigned messages
    if (!isSigned && IN_GRACE_PERIOD && !STRICT_MODE) {
      signatureWarning = 'Message is unsigned. Signing will be required after Feb 1, 2026.';
    }

    // Reject unsigned messages in strict mode
    if (!isSigned && STRICT_MODE) {
      if (IN_GRACE_PERIOD) {
        res.setHeader('X-AIRC-Strict-Mode', 'enforced');
        res.setHeader('X-AIRC-Grace-Period-Ends', GRACE_PERIOD_END.toISOString());
      }
      return res.status(401).json({
        success: false,
        error: 'signature_required',
        message: 'Message signature is required',
        strict_mode: true,
        grace_period_ends: IN_GRACE_PERIOD ? GRACE_PERIOD_END.toISOString() : null
      });
    }

    // If signature provided, verify it
    if (isSigned) {
      // Need public key to verify signature
      if (!senderPublicKey) {
        return res.status(400).json({
          success: false,
          error: 'sender_key_not_found',
          message: `No public key registered for @${from}. Register with a public key to send signed messages.`
        });
      }

      const sigCheck = await verifyMessageSignature(
        { ...rawMessage, signature: req.body.signature },
        senderPublicKey
      );

      if (!sigCheck.valid) {
        if (IN_GRACE_PERIOD) {
          res.setHeader('X-AIRC-Strict-Mode', 'optional');
          res.setHeader('X-AIRC-Grace-Period-Ends', GRACE_PERIOD_END.toISOString());
        }

        return res.status(401).json({
          success: false,
          error: sigCheck.error,
          message: sigCheck.message,
          strict_mode: STRICT_MODE,
          grace_period_ends: IN_GRACE_PERIOD ? GRACE_PERIOD_END.toISOString() : null
        });
      }

      // AIRC v0.2.1: Check nonce hasn't been used (replay prevention)
      if (req.body.nonce) {
        const nonceCheck = await checkAndStoreNonce(kv, req.body.nonce, from);

        if (nonceCheck.used) {
          return res.status(401).json({
            success: false,
            error: 'replay_attack',
            message: 'Message nonce has already been used'
          });
        }

        // Warn if replay protection couldn't be verified
        if (nonceCheck.kvUnavailable) {
          replayWarning = nonceCheck.error;
        }
      }
    }

    // Set grace period headers if applicable
    if (IN_GRACE_PERIOD) {
      res.setHeader('X-AIRC-Strict-Mode', STRICT_MODE ? 'enforced' : 'optional');
      res.setHeader('X-AIRC-Grace-Period-Ends', GRACE_PERIOD_END.toISOString());
    }

    const message = {
      id: generateId(),
      from,
      to,
      text,
      createdAt: new Date().toISOString(),
      read: false,
      signed: !!req.body.signature
    };

    let messages = await getMessages();
    messages.push(message);

    // Keep only last 10000 messages to prevent unbounded growth
    if (messages.length > 10000) {
      messages = messages.slice(-10000);
    }

    await saveMessages(messages);

    // Log analytics event
    if (kv) {
      await logEvent(kv, 'message_sent', message.from, {
        to: message.to,
        signed: message.signed
      });
    }

    // Log to social graph (non-blocking)
    logInteraction({
      from: message.from,
      to: message.to,
      action: 'message',
      metadata: { signed: message.signed }
    }).catch(e => console.error('[messages] Graph log error:', e.message));

    // Build response
    const response = {
      success: true,
      message,
      display: `Message sent to @${message.to}`,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    };

    // Add deprecation warning during grace period for unsigned messages
    if (signatureWarning) {
      response.warning = signatureWarning;
      response.grace_period_ends = GRACE_PERIOD_END.toISOString();
    }

    // Add replay protection warning if KV was unavailable
    if (replayWarning) {
      response.replay_warning = replayWarning;
    }

    return res.status(200).json(response);
  }

  // DELETE - Remove messages (requires auth - user can only delete their own)
  if (req.method === 'DELETE') {
    const { user, messageId, clearAll } = req.body || req.query;

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: user'
      });
    }

    const username = user.toLowerCase().replace('@', '');

    // Verify ownership: user can only delete messages TO themselves
    // In future, add proper token auth here like invites.js
    // For now, rate limit aggressively to prevent abuse
    const rateCheck = await checkRateLimit(`messages:delete:${username}`, {
      max: 10,
      windowMs: 60 * 60 * 1000 // 10 deletes per hour
    });

    if (!rateCheck.success) {
      return rateLimitResponse(res);
    }

    let messages = await getMessages();
    const before = messages.length;

    if (clearAll === 'true') {
      // Clear all messages TO this user (their inbox)
      messages = messages.filter(m => m.to !== username);
    } else if (messageId) {
      // Delete specific message only if it's TO this user
      messages = messages.filter(m => !(m.id === messageId && m.to === username));
    }

    await saveMessages(messages);

    return res.status(200).json({
      success: true,
      deleted: before - messages.length,
      remaining: messages.length,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  // GET - Fetch messages
  if (req.method === 'GET') {
    const { user, with: withUser, markRead } = req.query;

    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: user"
      });
    }

    const username = user.toLowerCase().replace('@', '');
    let messages = await getMessages();

    // Get thread with specific user
    if (withUser) {
      const otherUser = withUser.toLowerCase().replace('@', '');
      const thread = messages
        .filter(m =>
          (m.from === username && m.to === otherUser) ||
          (m.from === otherUser && m.to === username)
        )
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map(m => ({
          ...m,
          timeAgo: timeAgo(m.createdAt),
          direction: m.from === username ? 'sent' : 'received'
        }));

      return res.status(200).json({
        success: true,
        thread,
        with: otherUser,
        count: thread.length,
        storage: KV_CONFIGURED ? 'kv' : 'memory'
      });
    }

    // Get inbox
    const inbox = messages
      .filter(m => m.to === username)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(m => ({
        ...m,
        timeAgo: timeAgo(m.createdAt)
      }));

    const unread = inbox.filter(m => !m.read).length;

    // Mark as read if requested
    if (markRead === 'true') {
      let updated = false;
      messages = messages.map(m => {
        if (m.to === username && !m.read) {
          updated = true;
          return { ...m, read: true };
        }
        return m;
      });
      if (updated) {
        await saveMessages(messages);
      }
    }

    // Group by sender
    const bySender = {};
    inbox.forEach(m => {
      if (!bySender[m.from]) {
        bySender[m.from] = [];
      }
      bySender[m.from].push(m);
    });

    return res.status(200).json({
      success: true,
      inbox,
      unread,
      bySender,
      total: inbox.length,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
