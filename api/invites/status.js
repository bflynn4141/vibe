/**
 * Invite Status API for vibe-terminal
 *
 * GET /api/invites/status?username=X - Get invite status for a user
 *
 * Returns data in the shape the terminal expects:
 * {
 *   username: string,
 *   invitesRemaining: number,
 *   invitesSent: [{ code, usedBy?, createdAt }],
 *   isFounder: boolean,
 *   tier: "founder" | "early" | "standard"
 * }
 */

import { kv } from '@vercel/kv';

// Tier system based on genesis number
// Founder (1-100): 10 invites
// Early (101-500): 5 invites
// Standard (500+): 3 invites
function getTier(genesisNumber, isGenesis) {
  if (isGenesis && genesisNumber <= 100) return { tier: 'founder', maxInvites: 10 };
  if (isGenesis && genesisNumber <= 500) return { tier: 'early', maxInvites: 5 };
  return { tier: 'standard', maxInvites: 3 };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;

  if (!username) {
    return res.status(400).json({
      success: false,
      error: 'Username required'
    });
  }

  const handle = username.toLowerCase().trim();

  try {
    // Get user's handle record
    const handleRecord = await kv.hget('vibe:handles', handle);
    if (!handleRecord) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = typeof handleRecord === 'string' ? JSON.parse(handleRecord) : handleRecord;

    // Determine tier and max invites
    const { tier, maxInvites } = getTier(userData.genesis_number, userData.genesis);

    // Get user's invite codes
    const userCodesKey = `vibe:invites:by:${handle}`;
    const codelist = await kv.smembers(userCodesKey) || [];

    // Get details for each invite code
    const invitesSent = [];
    for (const code of codelist) {
      const codeData = await kv.hget('vibe:invites', code);
      if (codeData) {
        const invite = typeof codeData === 'string' ? JSON.parse(codeData) : codeData;
        invitesSent.push({
          code: invite.code,
          usedBy: invite.used_by || undefined,
          createdAt: invite.created_at
        });
      }
    }

    // Count used invites
    const usedInvites = invitesSent.filter(i => i.usedBy).length;
    const invitesRemaining = Math.max(0, maxInvites - codelist.length);

    // Cache for 1 minute
    res.setHeader('Cache-Control', 'private, max-age=60');

    return res.status(200).json({
      success: true,
      username: handle,
      invitesRemaining,
      invitesSent: invitesSent.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
      isFounder: userData.genesis && (userData.genesis_number || 0) <= 100,
      tier,
      stats: {
        totalCodes: codelist.length,
        usedCodes: usedInvites,
        maxInvites
      }
    });

  } catch (e) {
    console.error('[invites/status] Error:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to get invite status',
      message: e.message
    });
  }
}
