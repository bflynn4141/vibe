/**
 * /api/gigabrain/ingest
 *
 * Receives session intelligence from the session-end hook.
 * Stores session summaries for learning/pattern detection.
 */

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      user,
      project,
      summary,
      tech = [],
      tools = [],
      files = [],
      messages = 0,
      sessionId,
      auto = false
    } = req.body || {};

    // Validate required fields
    if (!user) {
      return res.status(400).json({ error: 'Missing required field: user' });
    }

    // Create session record
    const record = {
      id: sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      user,
      project: project || 'unknown',
      summary: summary || '',
      tech: Array.isArray(tech) ? tech.filter(Boolean) : [],
      tools: Array.isArray(tools) ? tools.filter(Boolean) : [],
      files: Array.isArray(files) ? files.filter(Boolean) : [],
      messages: parseInt(messages) || 0,
      auto,
      timestamp: new Date().toISOString()
    };

    // Store in KV
    // 1. Add to user's session list (max 100 sessions)
    const userSessionsKey = `gigabrain:sessions:${user}`;
    await kv.lpush(userSessionsKey, JSON.stringify(record));
    await kv.ltrim(userSessionsKey, 0, 99);

    // 2. Add to global recent sessions (max 500)
    await kv.lpush('gigabrain:recent', JSON.stringify(record));
    await kv.ltrim('gigabrain:recent', 0, 499);

    // 3. Update user's tech/tools profile
    const profileKey = `gigabrain:profile:${user}`;
    const profile = await kv.hgetall(profileKey) || {};

    // Increment tech counts
    for (const t of record.tech) {
      const key = `tech:${t}`;
      profile[key] = (parseInt(profile[key]) || 0) + 1;
    }

    // Increment tool counts
    for (const tool of record.tools) {
      const key = `tool:${tool}`;
      profile[key] = (parseInt(profile[key]) || 0) + 1;
    }

    profile.totalSessions = (parseInt(profile.totalSessions) || 0) + 1;
    profile.lastSession = record.timestamp;

    await kv.hset(profileKey, profile);

    // 4. Update daily activity (for streaks)
    const today = new Date().toISOString().split('T')[0];
    const activityKey = `activity:${user}:${today}`;
    await kv.incr(activityKey);
    await kv.expire(activityKey, 60 * 60 * 24 * 90); // Keep 90 days

    return res.status(200).json({
      success: true,
      id: record.id,
      message: 'Session captured'
    });

  } catch (error) {
    console.error('[gigabrain/ingest] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
