/**
 * /api/alpha/waitlist - Join the waitlist
 *
 * POST /api/alpha/waitlist
 * Body: { "email": "user@example.com", "twitter": "@handle" }
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

  const { email, twitter } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Get current position
    const position = await kv.llen('vibe:alpha:waitlist') + 1;

    // Add to waitlist
    await kv.lpush('vibe:alpha:waitlist', JSON.stringify({
      email,
      twitter: twitter || null,
      timestamp: new Date().toISOString(),
      position
    }));

    // Track stats
    await kv.hincrby('vibe:alpha:stats', 'waitlist_signups', 1);

    return res.json({
      success: true,
      position,
      message: `You're #${position} on the waitlist!`
    });

  } catch (error) {
    console.error('Waitlist error:', error);
    return res.status(500).json({ error: 'Failed to join waitlist' });
  }
}
