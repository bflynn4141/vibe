/**
 * Individual Message Operations
 *
 * PATCH /api/messages/:id - Update message (mark as read)
 * GET /api/messages/:id - Get single message
 */

import crypto from 'crypto';

// KV wrapper (same as messages.js)
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

// Get single message
async function getMessage(id) {
  const kv = await getKV();
  if (kv) {
    return await kv.get(`msg:${id}`);
  }
  return null;
}

// Update message
async function updateMessage(id, updates) {
  const kv = await getKV();
  if (kv) {
    const message = await kv.get(`msg:${id}`);
    if (message) {
      const updated = { ...message, ...updates };
      await kv.set(`msg:${id}`, updated);
      return updated;
    }
  }
  return null;
}

// Auth helpers (inline to avoid import issues)
const AUTH_SECRET = process.env.VIBE_AUTH_SECRET || 'dev-secret-change-in-production';

function verifyToken(token, expectedHandle) {
  if (!token) return { valid: false, error: 'No token provided' };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, error: 'Invalid token format' };
  const [sessionId, providedSignature] = parts;
  const handle = expectedHandle.toLowerCase().replace('@', '');
  const payload = `${sessionId}:${handle}`;
  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))) {
      return { valid: false, error: 'Invalid signature' };
    }
  } catch (e) {
    return { valid: false, error: 'Invalid signature' };
  }
  return { valid: true, sessionId };
}

function extractToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

async function getSession(sessionId) {
  const kv = await getKV();
  if (kv) {
    return await kv.get(`session:${sessionId}`);
  }
  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, error: 'Missing message ID' });
  }

  // GET - Fetch single message
  if (req.method === 'GET') {
    const message = await getMessage(id);

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    return res.status(200).json({
      success: true,
      message
    });
  }

  // PATCH - Update message (mark as read)
  if (req.method === 'PATCH') {
    const { read } = req.body;

    // Get the message first
    const message = await getMessage(id);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Verify requester is the recipient
    const token = extractToken(req);
    let authenticatedHandle = null;

    if (token) {
      const parts = token.split('.');
      if (parts.length === 2) {
        const [tokenSessionId] = parts;
        const session = await getSession(tokenSessionId);
        if (session) {
          const result = verifyToken(token, session.handle);
          if (result.valid) {
            authenticatedHandle = session.handle;
          }
        }
      }
    }

    // Only recipient can mark as read
    if (authenticatedHandle !== message.to) {
      return res.status(403).json({
        success: false,
        error: `Only recipient (@${message.to}) can mark this message as read`
      });
    }

    // Update the message
    const updates = {};
    if (read === true) {
      updates.read = true;
      updates.readAt = new Date().toISOString();
    }

    const updated = await updateMessage(id, updates);

    return res.status(200).json({
      success: true,
      message: updated
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
