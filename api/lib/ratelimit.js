/**
 * Rate limiting utilities for vibe-platform APIs
 *
 * Uses Vercel KV (Redis) for distributed rate limiting with in-memory fallback
 */

import crypto from 'crypto';

// Check if KV is configured
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// In-memory fallback for rate limiting (per process, resets on deploy)
const memoryStore = new Map();

// KV wrapper
async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    console.error('[ratelimit] KV load error:', e.message);
    return null;
  }
}

/**
 * Get client IP address from request
 */
export function getClientIP(req) {
  // Try various headers that Vercel uses
  return (
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Hash IP address for privacy
 */
export function hashIP(ip) {
  return crypto
    .createHash('sha256')
    .update(ip + (process.env.VIBE_SYSTEM_SECRET || 'salt'))
    .digest('hex')
    .substring(0, 16);
}

/**
 * Check rate limit for a given key
 *
 * @param {string} key - Rate limit key (e.g., "api:user:alice")
 * @param {object} options - Rate limit options
 * @param {number} options.max - Max requests allowed
 * @param {number} options.windowMs - Time window in milliseconds
 * @returns {Promise<{success: boolean, remaining: number, reset: number}>}
 */
export async function checkRateLimit(key, { max = 100, windowMs = 60000 }) {
  const now = Date.now();
  const kv = await getKV();

  if (kv) {
    try {
      // Use Redis for distributed rate limiting
      const kvKey = `ratelimit:${key}`;

      // Get current count
      const current = await kv.get(kvKey);
      const count = current ? parseInt(current) : 0;

      if (count >= max) {
        // Rate limited
        const ttl = await kv.ttl(kvKey);
        return {
          success: false,
          remaining: 0,
          reset: now + (ttl * 1000)
        };
      }

      // Increment count
      if (count === 0) {
        // First request - set with expiration
        await kv.set(kvKey, 1, { px: windowMs });
      } else {
        // Increment existing
        await kv.incr(kvKey);
      }

      return {
        success: true,
        remaining: max - count - 1,
        reset: now + windowMs
      };

    } catch (e) {
      console.error('[ratelimit] KV error:', e.message);
      // Fall through to memory-based rate limiting
    }
  }

  // Memory-based rate limiting (fallback)
  const entry = memoryStore.get(key);

  if (!entry) {
    // First request
    memoryStore.set(key, {
      count: 1,
      reset: now + windowMs
    });

    return {
      success: true,
      remaining: max - 1,
      reset: now + windowMs
    };
  }

  // Check if window expired
  if (now > entry.reset) {
    // Reset window
    memoryStore.set(key, {
      count: 1,
      reset: now + windowMs
    });

    return {
      success: true,
      remaining: max - 1,
      reset: now + windowMs
    };
  }

  // Within window
  if (entry.count >= max) {
    // Rate limited
    return {
      success: false,
      remaining: 0,
      reset: entry.reset
    };
  }

  // Increment count
  entry.count++;
  memoryStore.set(key, entry);

  return {
    success: true,
    remaining: max - entry.count,
    reset: entry.reset
  };
}

/**
 * Set rate limit headers on response
 */
export function setRateLimitHeaders(res, rateLimit) {
  res.setHeader('X-RateLimit-Limit', rateLimit.limit || 100);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining || 0);
  res.setHeader('X-RateLimit-Reset', rateLimit.reset || Date.now());
}

/**
 * Send rate limit exceeded response
 */
export function rateLimitResponse(res) {
  return res.status(429).json({
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.'
  });
}

/**
 * Clean up expired entries from memory store (call periodically)
 */
export function cleanupMemoryStore() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (now > entry.reset) {
      memoryStore.delete(key);
    }
  }
}

// Clean up memory store every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupMemoryStore, 5 * 60 * 1000);
}
