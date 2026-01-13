/**
 * AIRC Public Key Registration
 *
 * POST /api/users/key - Register or update a user's public key
 *
 * Body:
 * {
 *   handle: "@seth",
 *   publicKey: "ed25519:base64...",
 *   proof: "timestamp|signature"
 * }
 *
 * The proof format uses pipe (|) as separator since colons appear in RFC3339 timestamps.
 * The signed message is "{normalized_handle}:{timestamp}" (handle is lowercased, @ stripped).
 * The proof is: "{timestamp}|{base64_signature}"
 *
 * This endpoint is the server side of "invisible signing" - clients call it
 * once on first use to register their auto-generated public key.
 */

import { setSecurityHeaders } from '../lib/security.js';
import { checkRateLimit, rateLimitResponse } from '../lib/ratelimit.js';
import { sanitizeHandle } from '../lib/sanitize.js';
import { parseAIRCKey, verify, validateTimestamp } from '../lib/crypto.js';

// Check if KV is configured
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

  const { handle, publicKey, proof } = req.body;

  // Validate required fields
  if (!handle || !publicKey || !proof) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: handle, publicKey, proof'
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

  // Rate limit: 10 key registrations per hour per handle
  const rateCheck = await checkRateLimit(`users:key:${normalizedHandle}`, {
    max: 10,
    windowMs: 60 * 60 * 1000
  });
  if (!rateCheck.success) {
    return rateLimitResponse(res);
  }

  // Parse public key
  const keyParsed = parseAIRCKey(publicKey);
  if (!keyParsed) {
    return res.status(400).json({
      success: false,
      error: 'Invalid public key format. Expected: ed25519:base64...'
    });
  }

  // Parse proof: "timestamp|signature" (pipe separator avoids RFC3339 colon conflict)
  const pipeIndex = proof.indexOf('|');
  if (pipeIndex === -1) {
    return res.status(400).json({
      success: false,
      error: 'Invalid proof format. Expected: timestamp|signature'
    });
  }

  const timestamp = proof.substring(0, pipeIndex);
  const signature = proof.substring(pipeIndex + 1);

  // Validate timestamp (5 minute window)
  const timestampCheck = validateTimestamp(timestamp, 300);
  if (!timestampCheck.valid) {
    return res.status(400).json({
      success: false,
      error: timestampCheck.message
    });
  }

  // Verify ownership proof: signature of "{handle}:{timestamp}"
  const messageToVerify = `${normalizedHandle}:${timestamp}`;
  const isValid = verify(messageToVerify, signature, keyParsed.raw);

  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid ownership proof. Signature verification failed.'
    });
  }

  // Proof is valid - register the public key
  const kv = await getKV();

  if (!kv) {
    return res.status(503).json({
      success: false,
      error: 'Key storage unavailable'
    });
  }

  // Get existing user data
  const existing = await kv.hgetall(`user:${normalizedHandle}`);

  if (!existing) {
    return res.status(404).json({
      success: false,
      error: `User @${normalizedHandle} not found. Register first with POST /api/users`
    });
  }

  // Check if key is being changed
  const isKeyChange = existing.publicKey && existing.publicKey !== publicKey;

  // Update user with new public key
  const now = new Date().toISOString();
  await kv.hset(`user:${normalizedHandle}`, {
    publicKey,
    publicKeyRegisteredAt: now,
    publicKeyUpdatedAt: now
  });

  // Log the registration event
  const logKey = `airc:keylog:${normalizedHandle}`;
  await kv.lpush(logKey, JSON.stringify({
    action: isKeyChange ? 'key_rotated' : 'key_registered',
    publicKey: publicKey.substring(0, 30) + '...', // Truncate for logging
    timestamp: now
  }));
  await kv.ltrim(logKey, 0, 99); // Keep last 100 key events

  console.log(`[users/key] ${isKeyChange ? 'Key rotated' : 'Key registered'} for @${normalizedHandle}`);

  return res.status(200).json({
    success: true,
    handle: normalizedHandle,
    publicKey,
    isKeyChange,
    registeredAt: now,
    message: isKeyChange
      ? 'Public key successfully rotated'
      : 'Public key successfully registered'
  });
}
