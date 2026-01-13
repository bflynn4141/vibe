/**
 * /replay/:id
 *
 * Session replay page - plays back terminal session at variable speeds.
 * The "multiplayer unlock" - watch how others code with AI.
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

export default async function handler(req, res) {
  // Extract session ID from path
  const pathParts = req.url.split('?')[0].split('/');
  const id = pathParts[pathParts.length - 1] || req.query.id;

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

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Replay: ${escapeHtml(session.title)} | /vibe</title>
  <meta name="description" content="Watch ${escapeHtml(session.author_handle)}'s coding session">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      background: #111;
      border-bottom: 1px solid #222;
    }
    .title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .title h1 { font-size: 14px; font-weight: 500; }
    .title .author { color: #666; font-size: 12px; }
    .title .author a { color: #6b8fff; text-decoration: none; }
    .back { color: #6b8fff; text-decoration: none; font-size: 13px; }
    .controls {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .speed-control {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .speed-btn {
      background: #1a1a1a;
      border: 1px solid #333;
      color: #888;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
    }
    .speed-btn:hover { border-color: #6b8fff; color: #6b8fff; }
    .speed-btn.active { background: #6b8fff; color: #000; border-color: #6b8fff; }
    .play-btn {
      background: #6b8fff;
      border: none;
      color: #000;
      padding: 8px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .play-btn:hover { background: #8ba3ff; }
    .play-btn.paused { background: #333; color: #fff; }
    .terminal-wrapper {
      flex: 1;
      padding: 20px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .terminal {
      flex: 1;
      background: #000;
      border: 1px solid #222;
      border-radius: 8px;
      overflow: auto;
      padding: 16px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .terminal .output { color: #e0e0e0; }
    .terminal .input { color: #4ade80; }
    .terminal .thinking { color: #666; font-style: italic; }
    .terminal .marker { color: #6b8fff; font-weight: bold; }
    .progress-bar {
      height: 4px;
      background: #222;
      margin-top: 16px;
      border-radius: 2px;
      overflow: hidden;
      cursor: pointer;
    }
    .progress-fill {
      height: 100%;
      background: #6b8fff;
      width: 0%;
      transition: width 0.1s linear;
    }
    .status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      font-size: 11px;
      color: #666;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: #666;
    }
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    .cursor {
      display: inline-block;
      width: 8px;
      height: 16px;
      background: #6b8fff;
      animation: blink 1s infinite;
      vertical-align: text-bottom;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <a href="/session/${id}" class="back">&larr;</a>
      <div>
        <h1>${escapeHtml(session.title)}</h1>
        <span class="author">by <a href="/u/${escapeHtml(session.author_handle)}">@${escapeHtml(session.author_handle)}</a></span>
      </div>
    </div>
    <div class="controls">
      <div class="speed-control">
        <button class="speed-btn" data-speed="0.5">0.5x</button>
        <button class="speed-btn active" data-speed="1">1x</button>
        <button class="speed-btn" data-speed="2">2x</button>
        <button class="speed-btn" data-speed="4">4x</button>
      </div>
      <button class="play-btn" id="playBtn">
        <span id="playIcon">&#9654;</span>
        <span id="playText">Play</span>
      </button>
    </div>
  </div>

  <div class="terminal-wrapper">
    <div class="terminal" id="terminal">
      <div class="loading">Loading session...</div>
    </div>
    <div class="progress-bar" id="progressBar">
      <div class="progress-fill" id="progressFill"></div>
    </div>
    <div class="status-bar">
      <span id="chunkStatus">0 / ${session.chunk_count} chunks</span>
      <span id="timeStatus">0:00 / ${Math.floor(session.duration_seconds / 60)}:${String(session.duration_seconds % 60).padStart(2, '0')}</span>
    </div>
  </div>

  <script>
    const SESSION_ID = '${id}';
    const TOTAL_CHUNKS = ${session.chunk_count};
    const TOTAL_DURATION = ${session.duration_seconds * 1000}; // ms
    const API_URL = '${BASE_URL}/api/sessions/replay';

    let chunks = [];
    let currentIndex = 0;
    let isPlaying = false;
    let speed = 1;
    let timeoutId = null;
    let startTime = 0;

    const terminal = document.getElementById('terminal');
    const playBtn = document.getElementById('playBtn');
    const playIcon = document.getElementById('playIcon');
    const playText = document.getElementById('playText');
    const progressFill = document.getElementById('progressFill');
    const chunkStatus = document.getElementById('chunkStatus');
    const timeStatus = document.getElementById('timeStatus');
    const progressBar = document.getElementById('progressBar');

    // Load chunks
    async function loadChunks() {
      let since = -1;
      while (true) {
        const url = API_URL + '?id=' + SESSION_ID + '&since=' + since + '&limit=500';
        const res = await fetch(url);
        const data = await res.json();

        if (!data.success) {
          terminal.innerHTML = '<div style="color: #f87171;">Error loading session</div>';
          return;
        }

        chunks = chunks.concat(data.chunks);
        chunkStatus.textContent = chunks.length + ' / ' + TOTAL_CHUNKS + ' chunks';

        if (!data.hasMore) break;
        since = data.nextSince;
      }

      terminal.innerHTML = '<span class="cursor"></span>';
      chunkStatus.textContent = chunks.length + ' / ' + TOTAL_CHUNKS + ' chunks loaded';
    }

    // Decode base64 chunk data
    function decodeChunk(data) {
      try {
        return atob(data);
      } catch {
        return data;
      }
    }

    // Escape HTML for display
    function escapeHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    // Render a chunk
    function renderChunk(chunk) {
      const content = escapeHtml(decodeChunk(chunk.data));
      const className = chunk.type;

      // Remove cursor, add content, re-add cursor
      const cursor = terminal.querySelector('.cursor');
      if (cursor) cursor.remove();

      const span = document.createElement('span');
      span.className = className;
      span.innerHTML = content;
      terminal.appendChild(span);

      const newCursor = document.createElement('span');
      newCursor.className = 'cursor';
      terminal.appendChild(newCursor);

      // Auto-scroll
      terminal.scrollTop = terminal.scrollHeight;
    }

    // Update progress
    function updateProgress() {
      const progress = currentIndex / chunks.length * 100;
      progressFill.style.width = progress + '%';

      const elapsed = chunks[currentIndex - 1]?.timestamp || 0;
      const mins = Math.floor(elapsed / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      const totalMins = Math.floor(TOTAL_DURATION / 60000);
      const totalSecs = Math.floor((TOTAL_DURATION % 60000) / 1000);
      timeStatus.textContent = mins + ':' + String(secs).padStart(2, '0') +
        ' / ' + totalMins + ':' + String(totalSecs).padStart(2, '0');
    }

    // Play next chunk
    function playNext() {
      if (currentIndex >= chunks.length) {
        pause();
        playText.textContent = 'Replay';
        currentIndex = 0;
        return;
      }

      const chunk = chunks[currentIndex];
      renderChunk(chunk);
      currentIndex++;
      updateProgress();
      chunkStatus.textContent = currentIndex + ' / ' + chunks.length + ' chunks';

      // Calculate delay to next chunk
      if (currentIndex < chunks.length) {
        const nextChunk = chunks[currentIndex];
        const delay = (nextChunk.timestamp - chunk.timestamp) / speed;
        // Cap delay at 2 seconds (sped up already)
        const cappedDelay = Math.min(Math.max(delay, 10), 2000);
        timeoutId = setTimeout(playNext, cappedDelay);
      } else {
        pause();
        playText.textContent = 'Replay';
      }
    }

    function play() {
      if (currentIndex >= chunks.length) {
        // Reset for replay
        terminal.innerHTML = '<span class="cursor"></span>';
        currentIndex = 0;
      }
      isPlaying = true;
      playBtn.classList.remove('paused');
      playIcon.innerHTML = '&#10074;&#10074;';
      playText.textContent = 'Pause';
      playNext();
    }

    function pause() {
      isPlaying = false;
      playBtn.classList.add('paused');
      playIcon.innerHTML = '&#9654;';
      playText.textContent = 'Play';
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    // Event listeners
    playBtn.addEventListener('click', () => {
      if (isPlaying) pause();
      else play();
    });

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        speed = parseFloat(btn.dataset.speed);
      });
    });

    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      currentIndex = Math.floor(pct * chunks.length);

      // Re-render up to current point
      terminal.innerHTML = '<span class="cursor"></span>';
      for (let i = 0; i < currentIndex; i++) {
        renderChunk(chunks[i]);
      }
      updateProgress();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) pause();
        else play();
      }
    });

    // Init
    loadChunks();
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);

  } catch (error) {
    console.error('[sessions/replay-page] Error:', error);
    return res.status(500).send('Error loading replay');
  }
}
