/**
 * Database Helper for AIRC v0.2
 *
 * Provides a tagged template literal interface for Neon Postgres.
 * Used by identity endpoints (rotation, revocation).
 *
 * Usage:
 *   import { sql } from './lib/db.js';
 *   const result = await sql`SELECT * FROM users WHERE username = ${handle}`;
 *
 * @module api/lib/db
 */

import { neon } from '@neondatabase/serverless';

// ============================================================
// Connection
// ============================================================

let sqlInstance = null;

/**
 * Get or create the SQL tagged template function
 *
 * @returns {Function} - Neon tagged template function
 */
function getSQL() {
  if (!sqlInstance) {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('Database not configured: POSTGRES_URL or DATABASE_URL required');
    }

    sqlInstance = neon(connectionString);
  }

  return sqlInstance;
}

/**
 * Tagged template literal for SQL queries
 *
 * Automatically parameterizes interpolated values to prevent SQL injection.
 *
 * @example
 * const users = await sql`SELECT * FROM users WHERE username = ${username}`;
 * const count = await sql`SELECT COUNT(*) FROM audit_log WHERE handle = ${handle}`;
 */
export const sql = new Proxy(function () {}, {
  apply(target, thisArg, args) {
    const sqlFn = getSQL();
    return sqlFn(...args);
  },

  get(target, prop) {
    // Support sql.unsafe() and other Neon methods
    const sqlFn = getSQL();
    return sqlFn[prop];
  }
});

// ============================================================
// Health Check
// ============================================================

/**
 * Check database connectivity
 *
 * @returns {Promise<{ healthy: boolean, latencyMs?: number, error?: string }>}
 */
export async function healthCheck() {
  const start = Date.now();

  try {
    const sqlFn = getSQL();
    await sqlFn`SELECT 1`;
    return {
      healthy: true,
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      latencyMs: Date.now() - start
    };
  }
}

/**
 * Check if database is configured
 *
 * @returns {boolean}
 */
export function isConfigured() {
  return !!(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

// ============================================================
// Transaction Helper
// ============================================================

/**
 * Execute queries in a transaction
 *
 * Note: Neon serverless doesn't support traditional transactions,
 * but this helper provides a consistent interface for future
 * migration to connection pooling.
 *
 * @param {Function} fn - Function receiving sql instance
 * @returns {Promise<any>} - Result of fn
 */
export async function transaction(fn) {
  // Neon serverless executes each query independently
  // For true transactions, use Neon's HTTP transaction API
  // or migrate to a persistent connection pool
  const sqlFn = getSQL();
  return fn(sqlFn);
}

// ============================================================
// Query Helpers
// ============================================================

/**
 * Get a single row or null
 *
 * @param {TemplateStringsArray} strings
 * @param {...any} values
 * @returns {Promise<object|null>}
 */
export async function queryOne(strings, ...values) {
  const sqlFn = getSQL();
  const result = await sqlFn(strings, ...values);
  return result.length > 0 ? result[0] : null;
}

/**
 * Check if a row exists
 *
 * @param {TemplateStringsArray} strings
 * @param {...any} values
 * @returns {Promise<boolean>}
 */
export async function exists(strings, ...values) {
  const sqlFn = getSQL();
  const result = await sqlFn(strings, ...values);
  return result.length > 0;
}

// ============================================================
// Error Codes
// ============================================================

// PostgreSQL error codes we handle explicitly
export const PG_ERRORS = {
  UNIQUE_VIOLATION: '23505',     // Duplicate key (nonce replay, etc.)
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  SERIALIZATION_FAILURE: '40001' // Concurrent modification
};

/**
 * Check if error is a unique constraint violation
 *
 * @param {Error} error
 * @returns {boolean}
 */
export function isUniqueViolation(error) {
  return error?.code === PG_ERRORS.UNIQUE_VIOLATION;
}

/**
 * Check if error is a serialization failure (retry candidate)
 *
 * @param {Error} error
 * @returns {boolean}
 */
export function isSerializationFailure(error) {
  return error?.code === PG_ERRORS.SERIALIZATION_FAILURE;
}

// ============================================================
// Exports
// ============================================================

export default {
  sql,
  healthCheck,
  isConfigured,
  transaction,
  queryOne,
  exists,
  PG_ERRORS,
  isUniqueViolation,
  isSerializationFailure
};
