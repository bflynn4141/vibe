/**
 * AIRC v0.2 Cryptographic Utilities
 *
 * Ed25519 signing and verification for identity operations.
 * Uses Node.js crypto module (no custom crypto).
 *
 * Key format: "ed25519:base64encodedkey"
 * Signature format: Base64 encoded Ed25519 signature
 *
 * @module api/lib/crypto
 */

import crypto from 'crypto';

// ============================================================
// Constants
// ============================================================

const KEY_PREFIX = 'ed25519:';
const TIMESTAMP_WINDOW_DEFAULT = 300; // 5 minutes
const TIMESTAMP_SKEW_WARNING = 60;    // Warn if >60s skew

// ============================================================
// Key Parsing
// ============================================================

/**
 * Parse an AIRC-format key string into components
 *
 * @param {string} keyString - Key in format "ed25519:base64data"
 * @returns {{ algorithm: string, keyData: string, raw: Buffer } | null}
 */
export function parseAIRCKey(keyString) {
  if (!keyString || typeof keyString !== 'string') {
    return null;
  }

  if (!keyString.startsWith(KEY_PREFIX)) {
    return null;
  }

  const keyData = keyString.slice(KEY_PREFIX.length);

  try {
    const raw = Buffer.from(keyData, 'base64');

    // Ed25519 public keys are 32 bytes
    if (raw.length !== 32) {
      return null;
    }

    return {
      algorithm: 'ed25519',
      keyData,
      raw
    };
  } catch (e) {
    return null;
  }
}

/**
 * Format a raw key buffer as AIRC key string
 *
 * @param {Buffer} keyBuffer - Raw 32-byte key
 * @returns {string} - Key in format "ed25519:base64data"
 */
export function formatAIRCKey(keyBuffer) {
  return KEY_PREFIX + keyBuffer.toString('base64');
}

// ============================================================
// Key Generation
// ============================================================

/**
 * Generate a new Ed25519 key pair
 *
 * @returns {{ publicKey: string, privateKey: Buffer, publicKeyRaw: Buffer }}
 */
export function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });

  // Extract raw 32-byte public key from DER (last 32 bytes)
  const publicKeyRaw = publicKey.slice(-32);

  return {
    publicKey: formatAIRCKey(publicKeyRaw),
    privateKey,
    publicKeyRaw
  };
}

/**
 * Generate a cryptographically secure nonce
 *
 * @param {number} bytes - Number of bytes (default 16)
 * @returns {string} - Hex-encoded nonce
 */
export function generateNonce(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

// ============================================================
// Timestamp Validation
// ============================================================

/**
 * Validate a timestamp is within acceptable window
 *
 * @param {string|number} timestamp - ISO string or Unix timestamp (ms)
 * @param {number} windowSeconds - Acceptable window in seconds (default 300)
 * @returns {{ valid: boolean, error?: string, message?: string, skew?: number }}
 */
export function validateTimestamp(timestamp, windowSeconds = TIMESTAMP_WINDOW_DEFAULT) {
  let ts;

  // Parse timestamp
  if (typeof timestamp === 'string') {
    ts = new Date(timestamp).getTime();
  } else if (typeof timestamp === 'number') {
    // Handle both seconds and milliseconds
    ts = timestamp > 1e12 ? timestamp : timestamp * 1000;
  } else {
    return { valid: false, error: 'invalid_timestamp', message: 'Timestamp must be string or number' };
  }

  if (isNaN(ts)) {
    return { valid: false, error: 'invalid_timestamp', message: 'Could not parse timestamp' };
  }

  const now = Date.now();
  const skewMs = Math.abs(now - ts);
  const skewSeconds = Math.floor(skewMs / 1000);
  const windowMs = windowSeconds * 1000;

  // Check if outside window
  if (skewMs > windowMs) {
    const direction = ts > now ? 'future' : 'past';
    return {
      valid: false,
      error: 'timestamp_expired',
      message: `Timestamp is ${skewSeconds}s in the ${direction} (max ${windowSeconds}s)`,
      skew: skewSeconds
    };
  }

  // Valid but with warning if significant skew
  if (skewSeconds > TIMESTAMP_SKEW_WARNING) {
    return {
      valid: true,
      warning: `Clock skew detected: ${skewSeconds}s`,
      skew: skewSeconds
    };
  }

  return { valid: true, skew: skewSeconds };
}

// ============================================================
// Canonical JSON
// ============================================================

/**
 * Serialize object to canonical JSON (RFC 8785 JCS)
 * - Keys sorted alphabetically
 * - No whitespace
 * - Unicode normalized
 *
 * @param {object} obj - Object to serialize
 * @returns {string} - Canonical JSON string
 */
export function canonicalJSON(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Sort keys alphabetically
      return Object.keys(value)
        .sort()
        .reduce((sorted, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
    }
    return value;
  });
}

// ============================================================
// Signing
// ============================================================

/**
 * Sign data with Ed25519 private key
 *
 * @param {string|Buffer} data - Data to sign
 * @param {Buffer} privateKeyDer - Private key in DER format
 * @returns {string} - Base64 encoded signature
 */
export function sign(data, privateKeyDer) {
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });

  const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
  const signature = crypto.sign(null, dataBuffer, privateKey);

  return signature.toString('base64');
}

/**
 * Verify Ed25519 signature
 *
 * @param {string|Buffer} data - Data that was signed
 * @param {string} signature - Base64 encoded signature
 * @param {Buffer} publicKeyRaw - Raw 32-byte public key
 * @returns {boolean} - True if valid
 */
export function verify(data, signature, publicKeyRaw) {
  try {
    // Construct public key from raw bytes
    // Ed25519 public key DER prefix
    const derPrefix = Buffer.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00
    ]);
    const publicKeyDer = Buffer.concat([derPrefix, publicKeyRaw]);

    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki'
    });

    const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
    const signatureBuffer = Buffer.from(signature, 'base64');

    return crypto.verify(null, dataBuffer, publicKey, signatureBuffer);
  } catch (e) {
    console.error('[crypto] Verification error:', e.message);
    return false;
  }
}

// ============================================================
// Rotation Proof
// ============================================================

/**
 * Create a rotation proof object (unsigned)
 *
 * @param {string} handle - User handle
 * @param {string} oldKey - Current signing key (AIRC format)
 * @param {string} newKey - New signing key (AIRC format)
 * @returns {object} - Proof object ready for signing
 */
export function createRotationProof(handle, oldKey, newKey) {
  return {
    operation: 'rotate',
    handle,
    timestamp: new Date().toISOString(),
    nonce: generateNonce(),
    old_key: oldKey,
    new_key: newKey
  };
}

/**
 * Sign a rotation proof with recovery key
 *
 * @param {object} proof - Rotation proof object
 * @param {Buffer} recoveryPrivateKey - Recovery key (DER format)
 * @returns {object} - Proof with signature added
 */
export function signRotationProof(proof, recoveryPrivateKey) {
  // Create canonical message to sign (exclude signature field)
  const { signature: _, ...proofWithoutSig } = proof;
  const message = canonicalJSON(proofWithoutSig);

  const sig = sign(message, recoveryPrivateKey);

  return {
    ...proof,
    signature: sig
  };
}

/**
 * Verify a rotation proof signature
 *
 * @param {object} proof - Signed rotation proof
 * @param {Buffer} recoveryPublicKeyRaw - Recovery public key (raw 32 bytes)
 * @returns {boolean} - True if signature is valid
 */
export function verifyRotationProof(proof, recoveryPublicKeyRaw) {
  if (!proof || !proof.signature) {
    return false;
  }

  // Reconstruct message that was signed (canonical JSON without signature)
  const { signature, ...proofWithoutSig } = proof;
  const message = canonicalJSON(proofWithoutSig);

  return verify(message, signature, recoveryPublicKeyRaw);
}

// ============================================================
// Revocation Proof
// ============================================================

/**
 * Create a revocation proof object (unsigned)
 *
 * @param {string} handle - User handle
 * @param {string} reason - Revocation reason
 * @returns {object} - Proof object ready for signing
 */
export function createRevocationProof(handle, reason = 'voluntary') {
  return {
    operation: 'revoke',
    handle,
    timestamp: new Date().toISOString(),
    nonce: generateNonce(),
    reason
  };
}

/**
 * Sign a revocation proof with recovery key
 *
 * @param {object} proof - Revocation proof object
 * @param {Buffer} recoveryPrivateKey - Recovery key (DER format)
 * @returns {object} - Proof with signature added
 */
export function signRevocationProof(proof, recoveryPrivateKey) {
  const { signature: _, ...proofWithoutSig } = proof;
  const message = canonicalJSON(proofWithoutSig);

  const sig = sign(message, recoveryPrivateKey);

  return {
    ...proof,
    signature: sig
  };
}

/**
 * Verify a revocation proof signature
 *
 * @param {object} proof - Signed revocation proof
 * @param {Buffer} recoveryPublicKeyRaw - Recovery public key (raw 32 bytes)
 * @returns {boolean} - True if signature is valid
 */
export function verifyRevocationProof(proof, recoveryPublicKeyRaw) {
  if (!proof || !proof.signature) {
    return false;
  }

  const { signature, ...proofWithoutSig } = proof;
  const message = canonicalJSON(proofWithoutSig);

  return verify(message, signature, recoveryPublicKeyRaw);
}

// ============================================================
// Session Tokens
// ============================================================

const SESSION_SECRET = process.env.VIBE_SESSION_SECRET || process.env.VIBE_SYSTEM_SECRET;
if (!SESSION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('[crypto] FATAL: VIBE_SESSION_SECRET or VIBE_SYSTEM_SECRET must be set in production');
}
// Fail-safe for missing secret (dev only) - still prevents silent failures
const EFFECTIVE_SESSION_SECRET = SESSION_SECRET || (() => {
  console.warn('[crypto] WARNING: Using insecure dev secret - DO NOT USE IN PRODUCTION');
  return 'INSECURE_DEV_ONLY_' + Date.now();
})();
const SESSION_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Generate a session token for a handle
 *
 * @param {string} handle - User handle
 * @param {string} signingKey - Current signing key
 * @returns {{ token: string, expiresAt: number }}
 */
export function generateSessionToken(handle, signingKey) {
  const expiresAt = Date.now() + SESSION_TTL;
  const payload = `${handle}:${signingKey}:${expiresAt}`;

  const hmac = crypto.createHmac('sha256', EFFECTIVE_SESSION_SECRET);
  hmac.update(payload);
  const signature = hmac.digest('base64url');

  const token = Buffer.from(payload).toString('base64url') + '.' + signature;

  return { token, expiresAt };
}

/**
 * Verify and decode a session token
 *
 * @param {string} token - Session token
 * @param {string} expectedHandle - Expected handle
 * @param {string} expectedKey - Expected current signing key
 * @returns {{ valid: boolean, error?: string, handle?: string, expiresAt?: number }}
 */
export function verifySessionToken(token, expectedHandle, expectedKey) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'missing_token' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'invalid_token_format' };
  }

  const [payloadB64, signature] = parts;

  let payload;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString();
  } catch (e) {
    return { valid: false, error: 'invalid_token_encoding' };
  }

  // Verify HMAC
  const hmac = crypto.createHmac('sha256', EFFECTIVE_SESSION_SECRET);
  hmac.update(payload);
  const expectedSig = hmac.digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return { valid: false, error: 'invalid_signature' };
  }

  // Parse payload
  const [handle, signingKey, expiresAtStr] = payload.split(':');
  const expiresAt = parseInt(expiresAtStr, 10);

  // Check expiration
  if (Date.now() > expiresAt) {
    return { valid: false, error: 'token_expired' };
  }

  // Check handle matches
  if (handle !== expectedHandle) {
    return { valid: false, error: 'handle_mismatch' };
  }

  // Check signing key matches (session invalidated on rotation)
  if (signingKey !== expectedKey) {
    return { valid: false, error: 'key_rotated' };
  }

  return { valid: true, handle, expiresAt };
}

// ============================================================
// Exports Summary
// ============================================================

export default {
  // Key operations
  parseAIRCKey,
  formatAIRCKey,
  generateKeyPair,
  generateNonce,

  // Timestamp
  validateTimestamp,

  // JSON
  canonicalJSON,

  // Signing
  sign,
  verify,

  // Rotation
  createRotationProof,
  signRotationProof,
  verifyRotationProof,

  // Revocation
  createRevocationProof,
  signRevocationProof,
  verifyRevocationProof,

  // Sessions
  generateSessionToken,
  verifySessionToken
};
