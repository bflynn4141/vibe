/**
 * Security utilities for vibe-platform APIs
 *
 * Provides security headers and common security patterns.
 */

/**
 * Set security headers on response
 * Call this at the start of every handler
 *
 * @param {object} res - Response object
 * @param {object} options - Options
 * @param {boolean} options.allowCORS - Allow CORS from any origin (default: true for GET, false for mutations)
 * @param {string[]} options.allowedOrigins - Specific origins to allow (if not allowing all)
 */
export function setSecurityHeaders(res, options = {}) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Prevent XSS in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Content Security Policy for API responses
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  // Strict Transport Security (HTTPS only)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/**
 * Set CORS headers based on request origin and method
 *
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @param {object} options - CORS options
 * @param {string[]} options.allowedOrigins - Specific origins to allow (empty = allow all)
 * @param {boolean} options.allowCredentials - Allow credentials (default: false)
 */
export function setCORSHeaders(req, res, options = {}) {
  const { allowedOrigins = [], allowCredentials = false } = options;
  const origin = req.headers.origin;

  // Determine if origin is allowed
  let allowOrigin = '*';
  if (allowedOrigins.length > 0) {
    if (origin && allowedOrigins.includes(origin)) {
      allowOrigin = origin;
    } else {
      // Don't set CORS headers if origin not allowed
      return false;
    }
  }

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (allowCredentials && allowOrigin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  return true;
}

/**
 * Standard security middleware for API handlers
 * Sets both security headers and CORS
 *
 * @param {object} req - Request object
 * @param {object} res - Response object
 */
export function applySecurityMiddleware(req, res) {
  setSecurityHeaders(res);
  setCORSHeaders(req, res);
}

export default {
  setSecurityHeaders,
  setCORSHeaders,
  applySecurityMiddleware
};
