/**
 * POST /api/payments/tip
 *
 * Social tipping - record appreciation between users
 * MVP: Stored in KV as social proof (no blockchain yet)
 * Future: Will integrate with X402 Micropayments
 *
 * Request:
 * {
 *   "from": "@alice",
 *   "to": "@bob",
 *   "amount": 5,
 *   "message": "Thanks for the help!"
 * }
 */

import { kv } from '@vercel/kv';
import crypto from 'crypto';

// Fee percentage (will apply when real payments enabled)
const TIP_FEE_PERCENT = 2.5;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - retrieve tip history
  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  // POST - send a tip
  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res) {
  const { handle, type } = req.query;

  if (!handle) {
    return res.status(400).json({ error: 'Missing handle parameter' });
  }

  const cleanHandle = handle.replace('@', '').toLowerCase();

  try {
    // Get tips sent by user
    const sent = await kv.lrange(`tips:sent:${cleanHandle}`, 0, 50) || [];

    // Get tips received by user
    const received = await kv.lrange(`tips:received:${cleanHandle}`, 0, 50) || [];

    // Get totals
    const totalSent = await kv.get(`tips:total:sent:${cleanHandle}`) || 0;
    const totalReceived = await kv.get(`tips:total:received:${cleanHandle}`) || 0;

    return res.json({
      success: true,
      handle: cleanHandle,
      sent: type === 'received' ? [] : sent.map(t => JSON.parse(t)),
      received: type === 'sent' ? [] : received.map(t => JSON.parse(t)),
      totals: {
        sent: totalSent,
        received: totalReceived,
        net: totalReceived - totalSent
      }
    });

  } catch (error) {
    console.error('[Tip] Get error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function handlePost(req, res) {
  try {
    const { from, to, amount, message } = req.body;

    // Validation
    if (!from || !to) {
      return res.status(400).json({
        error: 'Missing required fields: from, to'
      });
    }

    const tipAmount = parseFloat(amount) || 1; // Default to $1 if not specified

    if (tipAmount <= 0 || tipAmount > 100) {
      return res.status(400).json({
        error: 'Amount must be between $0.01 and $100'
      });
    }

    const fromClean = from.replace('@', '').toLowerCase();
    const toClean = to.replace('@', '').toLowerCase();

    if (fromClean === toClean) {
      return res.status(400).json({
        error: "Can't tip yourself!"
      });
    }

    // Rate limiting - max 20 tips per hour per user
    const rateKey = `tip:ratelimit:${fromClean}`;
    const tipCount = await kv.incr(rateKey);
    if (tipCount === 1) {
      await kv.expire(rateKey, 3600); // 1 hour TTL
    }
    if (tipCount > 20) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Max 20 tips per hour.',
        reset_in: await kv.ttl(rateKey)
      });
    }

    // Generate tip ID
    const tipId = `tip_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const fee = tipAmount * (TIP_FEE_PERCENT / 100);
    const netAmount = tipAmount - fee;

    const tipRecord = {
      id: tipId,
      from: fromClean,
      to: toClean,
      amount: tipAmount,
      fee: fee,
      net: netAmount,
      message: message || null,
      timestamp: Date.now(),
      status: 'recorded', // 'recorded' = social only, 'confirmed' = blockchain confirmed
      mode: 'social' // Will be 'blockchain' when real payments enabled
    };

    // Store tip in both users' histories
    await Promise.all([
      kv.lpush(`tips:sent:${fromClean}`, JSON.stringify(tipRecord)),
      kv.lpush(`tips:received:${toClean}`, JSON.stringify(tipRecord)),
      kv.incrbyfloat(`tips:total:sent:${fromClean}`, tipAmount),
      kv.incrbyfloat(`tips:total:received:${toClean}`, netAmount),
      kv.lpush('tips:global', JSON.stringify(tipRecord))
    ]);

    // Trim histories to last 100
    await Promise.all([
      kv.ltrim(`tips:sent:${fromClean}`, 0, 99),
      kv.ltrim(`tips:received:${toClean}`, 0, 99),
      kv.ltrim('tips:global', 0, 999)
    ]);

    // Award reputation points (async, don't block)
    try {
      // Tipper gets social points
      await kv.incr(`reputation:social:${fromClean}`);
      // Receiver gets economic points
      await kv.incr(`reputation:economic:${toClean}`);
    } catch (e) {
      // Non-fatal
    }

    // Notify recipient via DM (async)
    const apiUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://slashvibe.dev';

    fetch(`${apiUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'system',
        to: toClean,
        text: `💰 @${fromClean} tipped you $${tipAmount}!${message ? ` "${message}"` : ''}\n\n_Tips are currently symbolic. Real payments coming soon!_`
      })
    }).catch(() => {}); // Ignore DM failures

    console.log(`[Tip] ${fromClean} → ${toClean}: $${tipAmount}`);

    return res.status(200).json({
      success: true,
      tip_id: tipId,
      status: 'recorded',
      amount: tipAmount,
      fee: fee,
      net_to_recipient: netAmount,
      message: `Tipped @${toClean} $${tipAmount}!`,
      note: 'Tips are currently symbolic (social proof). Real USDC payments coming soon!'
    });

  } catch (error) {
    console.error('[Tip] Error:', error);
    return res.status(500).json({
      error: 'Tip failed',
      details: error.message
    });
  }
}
