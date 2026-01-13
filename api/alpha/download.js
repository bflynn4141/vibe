/**
 * /api/alpha/download - Gated DMG download
 *
 * GET /api/alpha/download?code=VIBE-COSMIC-001
 * - Validates invite code
 * - Marks code as used
 * - Streams the DMG file
 *
 * Admin bypass: ?code=ADMIN&bypass=<VIBE_ADMIN_SECRET>
 */

import { kv } from '@vercel/kv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

// DMG location - will be uploaded here
const DMG_PATH = join(process.cwd(), 'public', 'downloads', 'vibe-alpha.dmg');
const DMG_FILENAME = 'VIBE-Alpha.dmg';

// Admin bypass secret (from env, never hardcoded)
const ADMIN_SECRET = process.env.VIBE_ADMIN_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, bypass } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Invite code required' });
  }

  try {
    // Admin bypass check (timing-safe comparison)
    const isAdminBypass = ADMIN_SECRET && bypass &&
      bypass.length === ADMIN_SECRET.length &&
      crypto.timingSafeEqual(Buffer.from(bypass), Buffer.from(ADMIN_SECRET));

    if (isAdminBypass) {
      // Log admin bypass usage
      await kv.lpush('vibe:alpha:admin_bypass_log', JSON.stringify({
        timestamp: new Date().toISOString(),
        ip: req.headers['x-forwarded-for'] || 'unknown'
      }));
      // Skip code validation, proceed to download
    } else {
      // Normal code validation
      const codeKey = `vibe:alpha:code:${code.toUpperCase()}`;
      const raw = await kv.get(codeKey);

      if (!raw) {
        await kv.incr('vibe:alpha:stats:failed_attempts');
        return res.status(401).json({ error: 'Invalid invite code' });
      }

      const codeData = typeof raw === 'string' ? JSON.parse(raw) : raw;

      const uses = codeData.uses || 0;
      const maxUses = codeData.maxUses || 3;

      if (uses >= maxUses) {
        return res.status(401).json({ error: 'Invite code has reached maximum uses' });
      }

      // Update code usage
      codeData.uses = uses + 1;
      codeData.lastUsed = new Date().toISOString();
      await kv.set(codeKey, JSON.stringify(codeData));

      // Track successful download
      await kv.incr('vibe:alpha:stats:downloads');
      await kv.lpush('vibe:alpha:download_log', JSON.stringify({
        code: code.toUpperCase(),
        timestamp: new Date().toISOString(),
        ip: req.headers['x-forwarded-for'] || 'unknown'
      }));
    }

    // Check if DMG exists (for both paths)
    if (!existsSync(DMG_PATH)) {
      return res.status(503).json({ error: 'Download not yet available. Check back soon!' });
    }

    // Stream the file
    const file = readFileSync(DMG_PATH);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${DMG_FILENAME}"`);
    res.setHeader('Content-Length', file.length);

    return res.send(file);

  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ error: 'Download failed. Please try again.' });
  }
}
