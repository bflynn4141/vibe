/**
 * SYNC NOTE: This file is duplicated from vibecodings repo
 * Location: ~/Projects/vibecodings/api/presence.js
 * vibe-public is now canonical - updates should happen here first
 *
 * Presence API - Who's vibing right now
 *
 * Uses Vercel KV (Redis) for persistence across cold starts
 * Falls back to in-memory if KV not configured
 *
 * POST /api/presence - Update your presence (heartbeat)
 * GET /api/presence - See who's active
 */

import { checkRateLimit, rateLimitResponse } from './lib/ratelimit.js';
import { sanitizeHandle, sanitizeContent } from './lib/sanitize.js';
import { setSecurityHeaders } from './lib/security.js';

// Check if KV is configured via environment variables
const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

// Presence TTL in seconds (5 minutes - auto-expires inactive users)
const PRESENCE_TTL = 300;

// System accounts to filter from "active" lists (bots, bridges, test accounts)
const SYSTEM_ACCOUNTS = new Set([
  'vibe', 'system', 'solienne', 'scout', 'echo', 'test', 'admin',
  'health-check', 'testuser', 'testuser123', 'curltest'
]);

// In-memory fallback with seed data
let memoryPresence = {
  sethgoldstein: {
    username: "sethgoldstein",
    x: "sethgoldstein",
    workingOn: "Terminal-native messaging for Claude Code",
    project: "vibecodings",
    location: "SF",
    lastSeen: new Date().toISOString(),
    dna: { top: "platform" }
  },
  wanderingstan: {
    username: "wanderingstan",
    x: "wanderingstan",
    workingOn: "Vibe Check analytics",
    project: "vibe-check",
    location: null,
    lastSeen: new Date(Date.now() - 24 * 3600000).toISOString(),
    dna: { top: "tools" }
  },
  genekogan: {
    username: "genekogan",
    x: "genekogan",
    workingOn: "Abraham autonomous artist",
    project: "abraham",
    location: null,
    lastSeen: new Date(Date.now() - 24 * 3600000).toISOString(),
    dna: { top: "agents" }
  },
  xsteenbrugge: {
    username: "xsteenbrugge",
    x: "xsteenbrugge",
    workingOn: "Spirit Protocol",
    project: "spirit",
    location: null,
    lastSeen: new Date(Date.now() - 24 * 3600000).toISOString(),
    dna: { top: "infrastructure" }
  }
};

// KV wrapper functions with fallback
async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    return null;
  }
}

async function getPresence(username) {
  const kv = await getKV();
  if (kv) {
    return await kv.get(`presence:${username}`);
  }
  return memoryPresence[username] || null;
}

async function setPresence(username, data, options = {}) {
  const kv = await getKV();
  if (kv) {
    await kv.set(`presence:${username}`, data, options);
  }
  memoryPresence[username] = data;
}

async function getAllPresence() {
  const kv = await getKV();
  if (kv) {
    const keys = await kv.keys('presence:*');
    if (keys.length === 0) return [];
    const data = await kv.mget(...keys);
    return data.filter(p => p !== null);
  }
  return Object.values(memoryPresence);
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function getStatus(lastSeen) {
  const seconds = (Date.now() - new Date(lastSeen).getTime()) / 1000;
  if (seconds < 1800) return 'active';  // 30 min
  if (seconds < 7200) return 'away';    // 2 hours
  return 'offline';
}

/**
 * Compute builderMode from session signals
 * @param {object} presence - User presence data
 * @returns {string} - "deep-focus" | "focused" | "exploring" | "shipping" | "idle"
 */
function getBuilderMode(presence) {
  if (!presence.lastSeen) return 'idle';

  const status = getStatus(presence.lastSeen);
  if (status === 'offline') return 'idle';
  if (status === 'away') return 'idle';

  // Check for shipping keywords in workingOn
  const workingOn = (presence.workingOn || '').toLowerCase();
  const shippingKeywords = ['deploy', 'ship', 'push', 'release', 'launch', 'publish'];
  if (shippingKeywords.some(kw => workingOn.includes(kw))) {
    return 'shipping';
  }

  // Calculate session duration if we have firstSeen
  if (presence.firstSeen) {
    const durationMs = new Date(presence.lastSeen) - new Date(presence.firstSeen);
    const durationHours = durationMs / (1000 * 60 * 60);

    if (durationHours >= 2) return 'deep-focus';
    if (durationHours >= 0.5) return 'focused';
  }

  return 'exploring';
}

export default async function handler(req, res) {
  // Security headers
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST - Update presence (heartbeat)
  if (req.method === 'POST') {
    const { username, workingOn, project, location, isAgent, agentType, operator, model, client } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: username"
      });
    }

    // Sanitize handle
    const handleResult = sanitizeHandle(username);
    if (!handleResult.valid) {
      return res.status(400).json({
        success: false,
        error: handleResult.error
      });
    }
    const user = handleResult.sanitized;

    // Rate limit: 60 heartbeats per minute per user (generous for active sessions)
    const rateCheck = await checkRateLimit(`presence:heartbeat:${user}`, {
      max: 60,
      windowMs: 60 * 1000
    });

    if (!rateCheck.success) {
      return rateLimitResponse(res);
    }

    // Get existing data to preserve fields
    const existing = await getPresence(user) || {};

    // Sanitize user-provided content to prevent XSS
    const sanitizedWorkingOn = workingOn
      ? sanitizeContent(workingOn, 200).sanitized || 'Building something'
      : existing.workingOn || 'Building something';
    const sanitizedProject = project
      ? sanitizeContent(project, 100).sanitized
      : existing.project || null;
    const sanitizedLocation = location
      ? sanitizeContent(location, 50).sanitized
      : existing.location || null;

    const now = new Date().toISOString();
    const presenceData = {
      username: user,
      x: existing.x || user,
      workingOn: sanitizedWorkingOn,
      project: sanitizedProject,
      location: sanitizedLocation,
      firstSeen: existing.firstSeen || now,  // Track session start
      lastSeen: now,
      dna: existing.dna || { top: 'platform' },
      // Agent identification (🤖 badge for thinking agents)
      isAgent: isAgent || existing.isAgent || false,
      agentType: agentType || existing.agentType || null,  // autonomous | assistant | bot
      operator: operator || existing.operator || null,      // human who runs the agent
      model: model || existing.model || null,               // claude-opus-4-5, etc.
      // Client metadata (VIBE Terminal, Claude Code, API)
      client: client || existing.client || null
    };

    // Compute builderMode from session signals
    presenceData.builderMode = getBuilderMode(presenceData);

    // Set with TTL for KV, or just update memory
    await setPresence(user, presenceData, { ex: PRESENCE_TTL });

    return res.status(200).json({
      success: true,
      presence: presenceData,
      message: "Presence updated",
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  // GET - Who's online
  if (req.method === 'GET') {
    const { user } = req.query;
    const forUser = user?.toLowerCase().replace('@', '');

    const allPresence = await getAllPresence();

    // Check for active broadcasts to add LIVE badges
    let broadcasts = {};
    try {
      const kv = await getKV();
      if (kv) {
        broadcasts = await kv.get('vibe:broadcasts') || {};
      }
    } catch (e) {
      // Non-critical, continue without broadcast info
    }

    // Build broadcast lookup by handle
    const broadcastByHandle = {};
    for (const [roomId, broadcast] of Object.entries(broadcasts)) {
      if (broadcast.handle) {
        broadcastByHandle[broadcast.handle] = {
          roomId,
          startedAt: broadcast.startedAt
        };
      }
    }

    // Build presence list with computed status and builderMode
    const list = allPresence
      .map(p => {
        const broadcast = broadcastByHandle[p.username];
        const isLive = !!broadcast;

        return {
          ...p,
          status: getStatus(p.lastSeen),
          builderMode: isLive ? 'streaming' : getBuilderMode(p),
          ago: timeAgo(p.lastSeen),
          matchPercent: null,
          // LIVE badge takes precedence over agent badge
          isLive,
          roomId: broadcast?.roomId || null,
          watchUrl: isLive ? `https://slashvibe.dev/watch/${broadcast.roomId}` : null,
          // Badge: LIVE > Agent > null
          badge: isLive ? '🔴' : (p.isAgent ? '🤖' : null),
          displayName: isLive
            ? `${p.username} 🔴 LIVE`
            : (p.isAgent ? `${p.username} 🤖` : p.username)
        };
      })
      .sort((a, b) => {
        // Sort LIVE users first, then by lastSeen
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        return new Date(b.lastSeen) - new Date(a.lastSeen);
      });

    // Filter out system accounts (bots, bridges, test users)
    const humanList = list.filter(p => !SYSTEM_ACCOUNTS.has(p.username));
    const systemList = list.filter(p => SYSTEM_ACCOUNTS.has(p.username));

    // Separate by status (humans only in main lists)
    const active = humanList.filter(p => p.status === 'active');
    const away = humanList.filter(p => p.status === 'away');
    const offline = humanList.filter(p => p.status === 'offline');

    return res.status(200).json({
      success: true,
      active,
      away,
      offline,
      // System accounts shown separately (for debugging)
      systemAccounts: systemList.filter(p => p.status === 'active'),
      yourMatches: [],
      counts: {
        active: active.length,
        away: away.length,
        total: humanList.length,
        systemOnline: systemList.filter(p => p.status === 'active').length,
        live: humanList.filter(p => p.isLive).length
      },
      storage: KV_CONFIGURED ? 'kv' : 'memory'
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
