/**
 * GitHub OAuth Callback
 *
 * GET /api/auth/github/callback - Handle GitHub OAuth callback
 *
 * Exchanges code for access token, fetches GitHub profile,
 * links GitHub identity to vibe handle.
 */

import { logEvent } from '../../lib/events.js';

const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    console.error('[github/callback] KV load error:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error } = req.query;

  // Handle OAuth errors
  if (error) {
    return res.redirect(302, `/community?error=github_${error}`);
  }

  if (!code || !state) {
    return res.redirect(302, '/community?error=missing_params');
  }

  // Decode state to get handle
  let stateData;
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch (e) {
    return res.redirect(302, '/community?error=invalid_state');
  }

  const { handle, ts } = stateData;

  // Check state isn't too old (10 minute expiry)
  if (Date.now() - ts > 10 * 60 * 1000) {
    return res.redirect(302, '/community?error=state_expired');
  }

  // Exchange code for access token
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code
      })
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('[github/callback] Token error:', tokenData.error);
      return res.redirect(302, `/community?error=token_${tokenData.error}`);
    }

    const accessToken = tokenData.access_token;

    // Fetch GitHub user profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'vibe-platform'
      }
    });

    const githubUser = await userRes.json();

    if (!githubUser.login) {
      return res.redirect(302, '/community?error=github_profile_failed');
    }

    // Store GitHub connection
    const kv = await getKV();
    if (kv) {
      // Update handle record with GitHub info
      const handleRecord = await kv.hget('vibe:handles', handle);
      if (handleRecord) {
        const record = typeof handleRecord === 'string' ? JSON.parse(handleRecord) : handleRecord;
        record.github_handle = githubUser.login;
        record.github_id = githubUser.id;
        record.github_connected_at = new Date().toISOString();
        record.verified = 'github';
        await kv.hset('vibe:handles', { [handle]: JSON.stringify(record) });
      }

      // Store access token for contact import (encrypted in production)
      await kv.set(`github:token:${handle}`, {
        access_token: accessToken,
        github_login: githubUser.login,
        github_id: githubUser.id,
        connected_at: new Date().toISOString()
      }, { ex: 60 * 60 * 24 * 30 }); // 30 day expiry

      // Store reverse mapping: github login -> vibe handle
      await kv.hset('vibe:github:handles', { [githubUser.login.toLowerCase()]: handle });

      // Log event
      await logEvent(kv, 'github_connected', handle, {
        github_login: githubUser.login,
        github_id: githubUser.id
      });
    }

    // Redirect to success page
    return res.redirect(302, `/community?github=connected&gh=${githubUser.login}`);

  } catch (e) {
    console.error('[github/callback] Error:', e.message);
    return res.redirect(302, `/community?error=github_error`);
  }
}
