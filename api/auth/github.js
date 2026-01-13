/**
 * GitHub OAuth Initiation
 *
 * GET /api/auth/github?handle=X - Start GitHub OAuth flow
 *
 * Redirects user to GitHub to authorize, then back to callback.
 * Links GitHub identity to vibe handle for contact import.
 */

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || 'https://slashvibe.dev/api/auth/github/callback';

// Scopes needed for contact import
const SCOPES = ['read:user', 'user:email'].join(' ');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if GitHub OAuth is configured
  if (!GITHUB_CLIENT_ID) {
    return res.status(503).json({
      success: false,
      error: 'GitHub OAuth not configured',
      message: 'Set GITHUB_CLIENT_ID environment variable'
    });
  }

  const { handle } = req.query;

  if (!handle) {
    return res.status(400).json({
      success: false,
      error: 'Handle required',
      message: 'Pass ?handle=yourhandle to link your GitHub'
    });
  }

  // Generate state token (handle + timestamp for CSRF protection)
  const state = Buffer.from(JSON.stringify({
    handle: handle.toLowerCase().trim(),
    ts: Date.now()
  })).toString('base64url');

  // Build GitHub OAuth URL
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: SCOPES,
    state,
    allow_signup: 'false'
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  // Redirect to GitHub
  res.redirect(302, authUrl);
}
