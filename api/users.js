/**
 * SYNC NOTE: This file is duplicated from vibecodings repo
 * Location: ~/Projects/vibecodings/api/users.js
 * vibe-public is now canonical - updates should happen here first
 *
 * Users API - Registration with "building" one-liner
 *
 * POST /api/users - Register or update a user
 * GET /api/users?user=X - Get user profile
 *
 * IMPORTANT: This now integrates with the handle claiming system (vibe:handles)
 * to properly track genesis users and enforce handle rules.
 */

import {
  normalizeHandle,
  validateHandle,
  checkReserved,
  claimHandle,
  getHandleRecord,
  getHandleStats
} from './lib/handles.js';
import { sql } from './lib/db.js';

// Check if KV is configured
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// In-memory fallback with seed data
let memoryUsers = {
  seth: {
    username: 'seth',
    building: 'MCP server for social',
    createdAt: new Date().toISOString(),
    invitedBy: null
  },
  stan: {
    username: 'stan',
    building: 'file watcher analytics',
    createdAt: new Date().toISOString(),
    invitedBy: 'seth'
  },
  gene: {
    username: 'gene',
    building: 'autonomous artist agents',
    createdAt: new Date().toISOString(),
    invitedBy: 'seth'
  }
};

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

async function getUser(username) {
  const kv = await getKV();
  if (kv) {
    return await kv.hgetall(`user:${username}`);
  }
  return memoryUsers[username] || null;
}

async function setUser(username, data) {
  const kv = await getKV();
  if (kv) {
    await kv.hset(`user:${username}`, data);
  }
  memoryUsers[username] = { ...memoryUsers[username], ...data };
}

async function getAllUsers() {
  const kv = await getKV();
  if (kv) {
    const keys = await kv.keys('user:*');
    if (keys.length === 0) return [];
    const users = [];
    for (const key of keys) {
      const user = await kv.hgetall(key);
      if (user) users.push(user);
    }
    return users;
  }
  return Object.values(memoryUsers);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - Register or update user
  if (req.method === 'POST') {
    const { username, building, invitedBy, inviteCode, publicKey, recoveryKey } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: username'
      });
    }

    const kv = await getKV();
    const user = normalizeHandle(username);

    // Validate handle format
    const validation = validateHandle(user);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    // Check if reserved
    const reserved = checkReserved(user);
    if (reserved.reserved) {
      return res.status(400).json({
        success: false,
        error: `Handle is reserved (${reserved.reason})`
      });
    }

    const existing = await getUser(user);
    const now = new Date().toISOString();

    // If KV is available, also claim in vibe:handles for proper genesis tracking
    let handleRecord = null;
    let genesisNumber = null;
    let isNewHandle = false;

    if (kv) {
      // Check if handle is already claimed in the handles system
      handleRecord = await getHandleRecord(kv, user);

      if (!handleRecord) {
        // Claim handle in the proper handles system
        const claimResult = await claimHandle(kv, user, {
          one_liner: building || 'something cool',
          publicKey: publicKey || null
        });

        if (claimResult.success) {
          handleRecord = claimResult.record;
          genesisNumber = claimResult.genesis_number;
          isNewHandle = true;
        }
        // If claim fails (shouldn't happen after validation), continue with legacy storage
      }
    }

    // Also maintain legacy user:{handle} storage for backward compatibility
    const userData = {
      username: user,
      building: building || existing?.building || 'something cool',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      invitedBy: invitedBy || existing?.invitedBy || null,
      inviteCode: inviteCode || existing?.inviteCode || null,
      publicKey: publicKey || existing?.publicKey || null,
      recoveryKey: recoveryKey || existing?.recoveryKey || null
    };

    await setUser(user, userData);

    // AIRC v0.2: If recoveryKey is provided, also sync to Postgres for identity operations
    // This enables key rotation and revocation for this user
    // Note: Schema uses 'username'/'public_key' (AIRC spec calls them 'handle'/'signing_key')
    let postgresSync = null;
    if (recoveryKey && publicKey) {
      try {
        // Upsert to Postgres users table for AIRC identity operations
        const result = await sql`
          INSERT INTO users (username, public_key, recovery_key, status, created_at, updated_at)
          VALUES (${user}, ${publicKey}, ${recoveryKey}, 'active', NOW(), NOW())
          ON CONFLICT (username) DO UPDATE SET
            public_key = EXCLUDED.public_key,
            recovery_key = EXCLUDED.recovery_key,
            updated_at = NOW()
          RETURNING username, public_key, recovery_key, status, created_at
        `;
        postgresSync = { success: true, identity: result[0] };
      } catch (e) {
        console.error('[users] Postgres sync error:', e.message);
        postgresSync = { success: false, error: e.message };
        // Don't fail registration - KV storage succeeded
      }
    }

    // Get current handle stats
    let handleStats = null;
    if (kv) {
      handleStats = await getHandleStats(kv);
    }

    return res.status(200).json({
      success: true,
      user: userData,
      isNew: !existing,
      isNewHandle,
      genesisNumber,
      handleStats,
      storage: KV_CONFIGURED ? 'kv' : 'memory',
      identity: postgresSync  // AIRC v0.2 identity sync status (null if no recoveryKey)
    });
  }

  // GET - Get user or list all
  if (req.method === 'GET') {
    const { user, username, all } = req.query;
    const name = (user || username || '').toLowerCase().replace('@', '');

    // Get all users
    if (all === 'true') {
      const users = await getAllUsers();
      return res.status(200).json({
        success: true,
        users,
        count: users.length,
        storage: KV_CONFIGURED ? 'kv' : 'memory'
      });
    }

    // Get specific user
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: user'
      });
    }

    const userData = await getUser(name);

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: `User @${name} not found`
      });
    }

    return res.status(200).json({
      success: true,
      user: userData,
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
