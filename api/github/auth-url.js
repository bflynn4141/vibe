/**
 * GitHub Auth URL API for vibe-terminal
 *
 * GET /api/github/auth-url?handle=X - Get OAuth URL to redirect user to
 *
 * Returns: { url: string }
 *
 * The terminal calls this to get the GitHub OAuth URL, then opens it
 * in the user's browser for authentication.
 */

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

  const { handle } = req.query;

  if (!handle) {
    return res.status(400).json({
      success: false,
      error: 'Handle required',
      message: 'Provide ?handle=username to get personalized OAuth URL'
    });
  }

  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    return res.status(503).json({
      success: false,
      error: 'GitHub OAuth not configured',
      message: 'GITHUB_CLIENT_ID environment variable not set'
    });
  }

  // Create state token with handle
  const state = Buffer.from(JSON.stringify({
    handle: handle.toLowerCase().trim(),
    ts: Date.now()
  })).toString('base64url');

  // Build OAuth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://www.slashvibe.dev/api/auth/github/callback',
    scope: 'read:user user:email',
    state
  });

  const url = `https://github.com/login/oauth/authorize?${params.toString()}`;

  return res.status(200).json({
    success: true,
    url,
    handle: handle.toLowerCase().trim()
  });
}
