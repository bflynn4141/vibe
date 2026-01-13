/**
 * GitHub Contacts Import
 *
 * GET /api/github/contacts?handle=X - Get GitHub contacts matched to vibe handles
 *
 * "The Git graph is what you want" - Rob Goldman
 *
 * Fetches user's GitHub followers/following, matches to existing vibe handles,
 * suggests "people you might know" for social graph bootstrap.
 */

import { logEvent } from '../lib/events.js';

const KV_CONFIGURED = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function getKV() {
  if (!KV_CONFIGURED) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch (e) {
    console.error('[github/contacts] KV load error:', e.message);
    return null;
  }
}

// Fetch paginated GitHub data
async function fetchGitHubPaginated(url, accessToken, maxPages = 3) {
  const results = [];
  let page = 1;

  while (page <= maxPages) {
    const res = await fetch(`${url}?per_page=100&page=${page}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'vibe-platform'
      }
    });

    if (!res.ok) break;

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    results.push(...data);
    page++;
  }

  return results;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const kv = await getKV();
  if (!kv) {
    return res.status(503).json({
      success: false,
      error: 'Service unavailable'
    });
  }

  const { handle } = req.query;

  if (!handle) {
    return res.status(400).json({
      success: false,
      error: 'Handle required'
    });
  }

  const normalizedHandle = handle.toLowerCase().trim();

  // Get stored GitHub token
  const tokenData = await kv.get(`github:token:${normalizedHandle}`);
  if (!tokenData) {
    return res.status(400).json({
      success: false,
      error: 'GitHub not connected',
      message: 'Connect GitHub first: /api/auth/github?handle=' + normalizedHandle,
      connect_url: `https://slashvibe.dev/api/auth/github?handle=${normalizedHandle}`
    });
  }

  const { access_token, github_login } = tokenData;

  try {
    // Fetch followers and following in parallel
    const [followers, following] = await Promise.all([
      fetchGitHubPaginated(`https://api.github.com/users/${github_login}/followers`, access_token),
      fetchGitHubPaginated(`https://api.github.com/users/${github_login}/following`, access_token)
    ]);

    // Get all GitHub logins
    const allGitHubLogins = new Set([
      ...followers.map(u => u.login.toLowerCase()),
      ...following.map(u => u.login.toLowerCase())
    ]);

    // Get the github -> vibe handle mapping
    const githubHandles = await kv.hgetall('vibe:github:handles') || {};

    // Find matches
    const matches = [];
    const suggestions = [];

    for (const ghLogin of allGitHubLogins) {
      const vibeHandle = githubHandles[ghLogin];
      const isFollower = followers.some(u => u.login.toLowerCase() === ghLogin);
      const isFollowing = following.some(u => u.login.toLowerCase() === ghLogin);

      if (vibeHandle && vibeHandle !== normalizedHandle) {
        // This GitHub user is on vibe!
        matches.push({
          github_login: ghLogin,
          vibe_handle: vibeHandle,
          relationship: isFollower && isFollowing ? 'mutual' : (isFollower ? 'follower' : 'following'),
          on_vibe: true
        });
      } else if (!vibeHandle) {
        // Not on vibe yet - potential invite target
        const ghUser = followers.find(u => u.login.toLowerCase() === ghLogin) ||
                      following.find(u => u.login.toLowerCase() === ghLogin);
        if (ghUser) {
          suggestions.push({
            github_login: ghUser.login,
            github_id: ghUser.id,
            avatar_url: ghUser.avatar_url,
            relationship: isFollower && isFollowing ? 'mutual' : (isFollower ? 'follower' : 'following'),
            on_vibe: false
          });
        }
      }
    }

    // Sort matches: mutuals first, then by handle
    matches.sort((a, b) => {
      if (a.relationship === 'mutual' && b.relationship !== 'mutual') return -1;
      if (a.relationship !== 'mutual' && b.relationship === 'mutual') return 1;
      return a.vibe_handle.localeCompare(b.vibe_handle);
    });

    // Sort suggestions: mutuals first, limit to top 50
    suggestions.sort((a, b) => {
      if (a.relationship === 'mutual' && b.relationship !== 'mutual') return -1;
      if (a.relationship !== 'mutual' && b.relationship === 'mutual') return 1;
      return 0;
    });

    // Log event
    await logEvent(kv, 'github_contacts_imported', normalizedHandle, {
      total_github_contacts: allGitHubLogins.size,
      matches_found: matches.length
    });

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'private, max-age=300');

    return res.status(200).json({
      success: true,
      github_login,
      stats: {
        followers: followers.length,
        following: following.length,
        total_contacts: allGitHubLogins.size
      },
      // People on vibe that you know from GitHub
      people_you_know: matches,
      // GitHub contacts not yet on vibe (invite targets)
      invite_suggestions: suggestions.slice(0, 50),
      message: matches.length > 0
        ? `Found ${matches.length} of your GitHub contacts on /vibe!`
        : 'None of your GitHub contacts are on /vibe yet. Be the first to invite them!'
    });

  } catch (e) {
    console.error('[github/contacts] Error:', e.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch contacts',
      message: e.message
    });
  }
}
