/**
 * /api/alpha/validate - Check if invite code is valid
 *
 * POST /api/alpha/validate
 * Body: { "code": "VIBE-COSMIC-001" }
 *
 * Returns: { "valid": true, "remaining": 2 } or { "valid": false }
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

  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ valid: false, error: 'Code required' });
  }

  try {
    const raw = await kv.get(`vibe:alpha:code:${code.toUpperCase()}`);

    if (!raw) {
      return res.json({ valid: false });
    }

    const codeData = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const uses = codeData.uses || 0;
    const maxUses = codeData.maxUses || 3;
    const remaining = maxUses - uses;

    if (remaining <= 0) {
      return res.json({ valid: false, error: 'Code exhausted' });
    }

    return res.json({
      valid: true,
      remaining,
      assignedTo: codeData.assignedTo || null
    });

  } catch (error) {
    console.error('Validate error:', error);
    return res.status(500).json({ valid: false, error: 'Validation failed' });
  }
}
