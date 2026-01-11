/**
 * GET /a/:slug - View artifact
 * Renders artifact as HTML with social context and provenance
 */

import { getArtifactBySlugFromPostgres } from '../artifacts.js';

const { kv } = await import('@vercel/kv');

// Feature flags
const READ_FROM_PG = process.env.ARTIFACTS_READ_FROM_PG === 'true';

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return text.toString().replace(/[&<>"']/g, (m) => map[m]);
}

function renderMarkdown(md) {
  // Escape HTML first, then apply markdown
  const escaped = escapeHtml(md);
  return escaped
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function renderBlocks(blocks) {
  let html = '';

  for (const block of blocks) {
    if (block.type === 'heading') {
      const level = block.level || 2;
      html += `<h${level}>${escapeHtml(block.text)}</h${level}>\n`;
    }
    else if (block.type === 'paragraph') {
      html += `<p>${renderMarkdown(block.markdown)}</p>\n`;
    }
    else if (block.type === 'bullets') {
      html += '<ul>\n';
      for (const item of block.items) {
        html += `<li>${escapeHtml(item)}</li>\n`;
      }
      html += '</ul>\n';
    }
    else if (block.type === 'places' && block.items) {
      html += '<div class="places">\n';
      for (const place of block.items) {
        html += `<div class="place-card">\n`;
        html += `<h3>${escapeHtml(place.name)}</h3>\n`;
        if (place.neighborhood) {
          html += `<p class="neighborhood">${escapeHtml(place.neighborhood)}</p>\n`;
        }
        html += `<p class="why">${escapeHtml(place.why)}</p>\n`;
        if (place.link) {
          html += `<p><a href="${escapeHtml(place.link)}" target="_blank">View →</a></p>\n`;
        }
        html += `</div>\n`;
      }
      html += '</div>\n';
    }
    else if (block.type === 'schedule' && block.items) {
      html += '<div class="schedule">\n';
      for (const item of block.items) {
        html += `<div class="schedule-item">\n`;
        if (item.time) {
          html += `<span class="time">${escapeHtml(item.time)}</span>`;
        }
        html += `<span class="event">${escapeHtml(item.event)}</span>\n`;
        html += `</div>\n`;
      }
      html += '</div>\n';
    }
    else if (block.type === 'callout') {
      const style = block.style || 'info';
      html += `<div class="callout callout-${escapeHtml(style)}">\n`;
      html += `<p>${escapeHtml(block.text)}</p>\n`;
      html += `</div>\n`;
    }
    else if (block.type === 'checklist' && block.items) {
      html += '<div class="checklist">\n';
      for (const item of block.items) {
        const checked = item.checked ? 'checked' : '';
        html += `<label><input type="checkbox" ${checked}> ${escapeHtml(item.text)}</label>\n`;
      }
      html += '</div>\n';
    }
    else if (block.type === 'attribution') {
      html += `<div class="attribution">\n`;
      html += `<p>Created by @${escapeHtml(block.from)}`;
      if (block.to) {
        html += ` for @${escapeHtml(block.to)}`;
      }
      html += `</p>\n`;
      if (block.context) {
        html += `<p class="context">${escapeHtml(block.context)}</p>\n`;
      }
      html += `</div>\n`;
    }
  }

  return html;
}

function renderArtifactPage(artifact) {
  const blocksHtml = renderBlocks(artifact.content.blocks);
  const createdDate = new Date(artifact.created_at).toLocaleDateString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(artifact.title)} | /vibe</title>
  <meta name="description" content="A ${escapeHtml(artifact.template)} artifact created by @${escapeHtml(artifact.created_by)}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #000;
      color: #00FF41;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      line-height: 1.6;
      padding: 40px 20px;
      letter-spacing: 0.05em;
      text-shadow: 0 0 2px rgba(0, 255, 65, 0.3);
    }

    /* Scan lines CRT effect */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.15),
        rgba(0, 0, 0, 0.15) 1px,
        transparent 1px,
        transparent 2px
      );
      pointer-events: none;
      z-index: 1000;
    }

    .container {
      max-width: 80ch;
      margin: 0 auto;
    }

    .header {
      border: 1px solid #00FF41;
      padding: 20px;
      margin-bottom: 40px;
    }

    .header pre {
      color: #00AA2B;
      font-size: 12px;
      line-height: 1.2;
    }

    .header h1 {
      font-size: 20px;
      font-weight: 400;
      margin: 10px 0;
      text-transform: uppercase;
    }

    .meta {
      color: #00AA2B;
      font-size: 12px;
      margin-top: 10px;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid #00FF41;
      margin-right: 10px;
      font-size: 11px;
      text-transform: uppercase;
    }

    .content h1 {
      font-size: 20px;
      font-weight: 400;
      margin: 30px 0 20px 0;
      text-transform: uppercase;
    }

    .content h2 {
      font-size: 16px;
      font-weight: 400;
      margin: 40px 0 20px 0;
      text-transform: uppercase;
      border-bottom: 1px solid #00FF41;
      padding-bottom: 5px;
    }

    .content h3 {
      font-size: 14px;
      font-weight: 400;
      margin: 30px 0 15px 0;
      text-transform: uppercase;
    }

    .content p {
      margin-bottom: 20px;
    }

    .content ul {
      list-style: none;
      margin: 20px 0;
    }

    .content li {
      margin-bottom: 10px;
    }

    .content li::before {
      content: '> ';
      color: #00AA2B;
    }

    strong {
      color: #88FFA8;
      font-weight: 400;
    }

    a {
      color: #88FFA8;
      text-decoration: none;
      border-bottom: 1px solid #88FFA8;
    }

    a:hover {
      color: #00FF41;
      text-shadow: 0 0 4px rgba(0, 255, 65, 0.6);
    }

    code {
      background: rgba(0, 255, 65, 0.1);
      padding: 2px 6px;
      border: 1px solid #00AA2B;
    }

    .places {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }

    .place-card {
      border: 1px solid #00FF41;
      padding: 15px;
      background: rgba(0, 255, 65, 0.02);
    }

    .place-card h3 {
      margin-top: 0;
      margin-bottom: 10px;
      color: #88FFA8;
      font-size: 14px;
      text-transform: uppercase;
    }

    .place-card .neighborhood {
      font-size: 12px;
      color: #00AA2B;
      margin-bottom: 10px;
    }

    .place-card .why {
      color: #00FF41;
      margin-bottom: 10px;
    }

    .schedule {
      border: 1px solid #00FF41;
      padding: 20px;
      margin: 20px 0;
      background: rgba(0, 255, 65, 0.02);
    }

    .schedule-item {
      display: flex;
      gap: 15px;
      padding: 10px 0;
      border-bottom: 1px solid #00AA2B;
    }

    .schedule-item:last-child { border-bottom: none; }

    .schedule-item .time {
      color: #88FFA8;
      min-width: 150px;
    }

    .schedule-item .time::before {
      content: '> ';
      color: #00AA2B;
    }

    .callout {
      border: 1px solid #00FF41;
      padding: 15px;
      margin: 20px 0;
      background: rgba(0, 255, 65, 0.02);
    }

    .callout-info { border-color: #00FF41; }
    .callout-warning { border-color: #88FFA8; }

    .checklist {
      border: 1px solid #00FF41;
      padding: 20px;
      margin: 20px 0;
      background: rgba(0, 255, 65, 0.02);
    }

    .checklist label {
      display: block;
      padding: 8px 0;
      cursor: pointer;
    }

    .checklist input {
      margin-right: 10px;
      accent-color: #00FF41;
    }

    .attribution {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #00FF41;
      color: #00AA2B;
      font-size: 12px;
    }

    .attribution .context {
      margin-top: 5px;
      color: #00AA2B;
    }

    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #00FF41;
      color: #00AA2B;
      font-size: 12px;
    }

    .cursor {
      animation: blink 1s infinite;
    }

    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }

    /* Mobile responsive */
    @media (max-width: 680px) {
      body {
        font-size: 13px;
        padding: 20px 10px;
      }

      .container {
        max-width: 100%;
      }

      .header pre {
        font-size: 10px;
        overflow-x: auto;
      }

      .schedule-item {
        flex-direction: column;
        gap: 5px;
      }

      .schedule-item .time {
        min-width: auto;
      }

      .places {
        gap: 15px;
      }

      a {
        word-break: break-all;
        overflow-wrap: break-word;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <pre>┌─ ARTIFACT ──────────────────────────────────────────────────────────────┐</pre>
      <h1>${escapeHtml(artifact.title)}</h1>
      <div class="meta">
        <span class="badge">${escapeHtml(artifact.template)}</span>
        <span>@${escapeHtml(artifact.created_by)}</span>
        ${artifact.created_for ? `<span>→ @${escapeHtml(artifact.created_for)}</span>` : ''}
        <span>· ${createdDate}</span>
      </div>
      <pre>└────────────────────────────────────────────────────────────────────────┘</pre>
    </div>

    <div class="content">
      ${blocksHtml}
    </div>

    <div class="footer">
      <p>/vibe · <a href="https://slashvibe.dev">slashvibe.dev</a><span class="cursor">_</span></p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { slug } = req.query;

    if (!slug) {
      return res.status(400).json({ error: 'Missing slug parameter' });
    }

    let artifact = null;

    // Try Postgres first if enabled, fallback to KV
    if (READ_FROM_PG) {
      artifact = await getArtifactBySlugFromPostgres(slug);
    }

    // Fallback to KV if Postgres didn't return artifact
    if (!artifact && kv) {
      const artifactIds = await kv.smembers('artifacts:all') || [];

      for (const id of artifactIds) {
        const a = await kv.get(`artifact:${id}`);
        if (a && a.slug === slug) {
          artifact = a;
          break;
        }
      }
    }

    if (!artifact) {
      return res.status(404).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Artifact Not Found | /vibe</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      color: #00FF41;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      padding: 100px 20px;
      text-align: center;
      text-shadow: 0 0 2px rgba(0, 255, 65, 0.3);
    }
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.15) 1px, transparent 1px, transparent 2px);
      pointer-events: none;
    }
    h1 { font-weight: 400; margin-bottom: 20px; text-transform: uppercase; }
    p { margin-bottom: 15px; color: #00AA2B; }
    a { color: #88FFA8; text-decoration: none; border-bottom: 1px solid #88FFA8; }
    a:hover { color: #00FF41; text-shadow: 0 0 4px rgba(0, 255, 65, 0.6); }
  </style>
</head>
<body>
  <h1>404 - Artifact Not Found</h1>
  <p>This artifact may have expired or been removed.</p>
  <p><a href="https://slashvibe.dev">← Back to /vibe</a></p>
</body>
</html>
      `);
    }

    if (artifact.expires_at) {
      const expiryDate = new Date(artifact.expires_at);
      if (expiryDate < new Date()) {
        return res.status(410).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>410 - Artifact Expired | /vibe</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      color: #00FF41;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      padding: 100px 20px;
      text-align: center;
      text-shadow: 0 0 2px rgba(0, 255, 65, 0.3);
    }
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.15) 1px, transparent 1px, transparent 2px);
      pointer-events: none;
    }
    h1 { font-weight: 400; margin-bottom: 20px; text-transform: uppercase; }
    p { margin-bottom: 15px; color: #00AA2B; }
    a { color: #88FFA8; text-decoration: none; border-bottom: 1px solid #88FFA8; }
    a:hover { color: #00FF41; text-shadow: 0 0 4px rgba(0, 255, 65, 0.6); }
  </style>
</head>
<body>
  <h1>410 - Artifact Expired</h1>
  <p>This artifact expired on ${expiryDate.toLocaleDateString()}.</p>
  <p><a href="https://slashvibe.dev">← Back to /vibe</a></p>
</body>
</html>
        `);
      }
    }

    const html = renderArtifactPage(artifact);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('GET /api/artifacts/[slug] error:', error);
    return res.status(500).send('<h1>Error</h1><p>Failed to load artifact</p>');
  }
}
