/**
 * /session/:id
 *
 * Public session view page - shows session metadata and replay link.
 * This is a shareable landing page for sessions.
 */

import { sql, isConfigured } from '../lib/db.js';

const BASE_URL = process.env.VIBE_BASE_URL || 'https://slashvibe.dev';

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDuration(seconds) {
  if (!seconds) return 'Unknown';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default async function handler(req, res) {
  // Extract session ID from Vercel's dynamic route param
  const id = req.query.id;

  if (!id || !id.startsWith('ses_')) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html><head><title>Invalid Session</title></head>
      <body style="font-family: monospace; background: #0a0a0a; color: #fff; padding: 40px;">
        <h1>Invalid session ID</h1>
        <p><a href="/sessions" style="color: #6b8fff;">Browse sessions</a></p>
      </body></html>
    `);
  }

  if (!isConfigured()) {
    return res.status(503).send('Database not configured');
  }

  try {
    const sessions = await sql`
      SELECT
        id, author_handle, title, description, visibility,
        enrichment, summary, chunk_count, duration_seconds,
        views, forks, created_at
      FROM shared_sessions
      WHERE id = ${id}
    `;

    if (sessions.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><title>Session Not Found</title></head>
        <body style="font-family: monospace; background: #0a0a0a; color: #fff; padding: 40px;">
          <h1>Session not found</h1>
          <p><a href="/sessions" style="color: #6b8fff;">Browse sessions</a></p>
        </body></html>
      `);
    }

    const session = sessions[0];

    if (session.visibility === 'private') {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html><head><title>Private Session</title></head>
        <body style="font-family: monospace; background: #0a0a0a; color: #fff; padding: 40px;">
          <h1>This session is private</h1>
          <p><a href="/sessions" style="color: #6b8fff;">Browse sessions</a></p>
        </body></html>
      `);
    }

    // Increment view count
    sql`SELECT increment_session_views(${id})`.catch(() => {});

    const enrichment = session.enrichment || {};
    const techStack = enrichment.techStack || [];
    const problemType = enrichment.problemType || 'unknown';
    const outcome = enrichment.outcome || 'unknown';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(session.title)} | /vibe</title>
  <meta name="description" content="${escapeHtml(session.description || session.summary || 'A shared coding session')}">
  <meta property="og:title" content="${escapeHtml(session.title)}">
  <meta property="og:description" content="${escapeHtml(session.description || 'A shared coding session on /vibe')}">
  <meta property="og:url" content="${BASE_URL}/session/${id}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .header { margin-bottom: 32px; }
    .back { color: #6b8fff; text-decoration: none; font-size: 14px; }
    .back:hover { text-decoration: underline; }
    h1 { font-size: 28px; margin: 16px 0 8px; color: #fff; }
    .author { color: #888; font-size: 14px; margin-bottom: 16px; }
    .author a { color: #6b8fff; text-decoration: none; }
    .meta { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; font-size: 13px; color: #666; }
    .meta-item { display: flex; align-items: center; gap: 6px; }
    .tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
    .tag {
      background: #1a1a1a;
      border: 1px solid #333;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      color: #aaa;
    }
    .tag.outcome-success { border-color: #4ade80; color: #4ade80; }
    .tag.outcome-failed { border-color: #f87171; color: #f87171; }
    .tag.type { border-color: #6b8fff; color: #6b8fff; }
    .description {
      background: #111;
      border: 1px solid #222;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
      line-height: 1.6;
    }
    .summary {
      background: #0d1117;
      border-left: 3px solid #6b8fff;
      padding: 16px 20px;
      margin-bottom: 24px;
      font-size: 14px;
      line-height: 1.6;
      color: #aaa;
    }
    .actions { display: flex; gap: 16px; margin-top: 32px; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #6b8fff;
      color: #000;
    }
    .btn-primary:hover { background: #8ba3ff; }
    .btn-secondary {
      background: transparent;
      border: 1px solid #333;
      color: #e0e0e0;
    }
    .btn-secondary:hover { border-color: #6b8fff; color: #6b8fff; }
    .stats {
      display: flex;
      gap: 32px;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #222;
      font-size: 13px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <a href="/sessions" class="back">&larr; Browse sessions</a>
      <h1>${escapeHtml(session.title)}</h1>
      <p class="author">by <a href="/u/${escapeHtml(session.author_handle)}">@${escapeHtml(session.author_handle)}</a></p>
    </div>

    <div class="meta">
      <span class="meta-item">
        <span>&#9716;</span>
        <span>${formatDuration(session.duration_seconds)}</span>
      </span>
      <span class="meta-item">
        <span>&#9776;</span>
        <span>${session.chunk_count.toLocaleString()} chunks</span>
      </span>
      <span class="meta-item">
        <span>&#128065;</span>
        <span>${session.views.toLocaleString()} views</span>
      </span>
      ${session.forks > 0 ? `
      <span class="meta-item">
        <span>&#9734;</span>
        <span>${session.forks.toLocaleString()} forks</span>
      </span>
      ` : ''}
    </div>

    <div class="tags">
      <span class="tag type">${escapeHtml(problemType)}</span>
      <span class="tag outcome-${outcome === 'success' ? 'success' : outcome === 'failed' ? 'failed' : ''}">${escapeHtml(outcome)}</span>
      ${techStack.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    </div>

    ${session.description ? `
    <div class="description">
      ${escapeHtml(session.description)}
    </div>
    ` : ''}

    ${session.summary ? `
    <div class="summary">
      <strong>AI Summary:</strong> ${escapeHtml(session.summary)}
    </div>
    ` : ''}

    <div class="actions">
      <a href="/replay/${id}" class="btn btn-primary">
        <span>&#9654;</span> Watch Replay
      </a>
      <a href="/api/sessions/replay?id=${id}" class="btn btn-secondary">
        Raw JSON
      </a>
    </div>

    <div class="stats">
      <span>Shared ${new Date(session.created_at).toLocaleDateString()}</span>
      ${enrichment.tokenCount ? `<span>${enrichment.tokenCount.toLocaleString()} tokens</span>` : ''}
      ${enrichment.cost ? `<span>$${enrichment.cost.toFixed(2)} cost</span>` : ''}
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('[sessions/view] Error:', error);
    return res.status(500).send('Error loading session');
  }
}
