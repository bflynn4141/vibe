/**
 * Watch Room Page - Live terminal streaming viewer
 *
 * GET /watch/:roomId - Serves the watch page HTML
 */

import { setSecurityHeaders } from '../lib/security.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { roomId } = req.query;

  if (!roomId) {
    return res.status(400).send(errorPage('Missing room ID'));
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(watchPage(roomId));
}

function errorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - /vibe</title>
  <style>
    body {
      margin: 0;
      background: #0a0a0a;
      color: #fff;
      font-family: system-ui, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .error { text-align: center; }
    h1 { color: #ef4444; margin-bottom: 8px; }
    a { color: #6B8FFF; }
  </style>
</head>
<body>
  <div class="error">
    <h1>Error</h1>
    <p>${message}</p>
    <p><a href="https://slashvibe.dev">Back to /vibe</a></p>
  </div>
</body>
</html>`;
}

function watchPage(roomId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Watching Live - /vibe</title>
  <meta name="description" content="Watch live terminal sessions on /vibe">
  <meta property="og:title" content="Live Terminal Session - /vibe">
  <meta property="og:description" content="Watch developers build in real-time">
  <meta property="og:type" content="website">
  <link rel="stylesheet" href="https://unpkg.com/@xterm/xterm@5.3.0/css/xterm.css">
  <script src="https://unpkg.com/@xterm/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://unpkg.com/@xterm/addon-fit@0.8.0/lib/addon-fit.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #0a0a0a;
      color: #e0e0e0;
      font-family: 'Inter', system-ui, sans-serif;
      min-height: 100vh;
    }

    /* Layout */
    .app {
      display: flex;
      height: 100vh;
    }

    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      background: linear-gradient(180deg, #111 0%, #0a0a0a 100%);
      border-bottom: 1px solid #1a1a1a;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .live-badge {
      background: #ef4444;
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      animation: pulse 2s ease-in-out infinite;
      box-shadow: 0 0 20px #ef444440;
    }

    .offline-badge {
      background: #333;
      color: #888;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .handle {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }

    .viewer-count {
      font-size: 13px;
      color: #666;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .viewer-dot {
      width: 6px;
      height: 6px;
      background: #22c55e;
      border-radius: 50%;
    }

    /* States Container */
    .state-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    .state {
      text-align: center;
      max-width: 400px;
    }

    .state h2 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .state p {
      color: #888;
      font-size: 15px;
      line-height: 1.6;
    }

    .state a {
      color: #6B8FFF;
      text-decoration: none;
    }

    .state a:hover {
      text-decoration: underline;
    }

    /* Spinner */
    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid #222;
      border-top-color: #6B8FFF;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 24px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Error state */
    .state.error h2 { color: #ef4444; }

    /* Terminal Container */
    .terminal-wrapper {
      flex: 1;
      padding: 16px;
      display: none;
    }

    .terminal-wrapper.active {
      display: block;
    }

    #terminal {
      height: 100%;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #222;
    }

    /* Sidebar */
    .sidebar {
      width: 300px;
      background: #0d0d0d;
      border-left: 1px solid #1a1a1a;
      display: flex;
      flex-direction: column;
    }

    @media (max-width: 900px) {
      .sidebar { display: none; }
    }

    .sidebar-section {
      padding: 20px;
      border-bottom: 1px solid #1a1a1a;
    }

    .sidebar-section h4 {
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }

    /* Broadcaster Info */
    .broadcaster-name {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
    }

    .broadcaster-meta {
      font-size: 13px;
      color: #666;
    }

    /* Reactions */
    .reactions-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .reaction-btn {
      font-size: 24px;
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      padding: 12px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .reaction-btn:hover {
      background: #222;
      border-color: #333;
      transform: scale(1.05);
    }

    .reaction-btn:active {
      transform: scale(0.95);
    }

    .reaction-btn.sent {
      animation: bounce 0.4s ease;
    }

    @keyframes bounce {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.2); }
    }

    /* Activity Feed */
    .feed {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .feed-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 0;
      font-size: 13px;
      color: #888;
      border-bottom: 1px solid #1a1a1a;
      animation: fadeIn 0.3s ease;
    }

    .feed-item:last-child {
      border-bottom: none;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .feed-emoji {
      font-size: 18px;
    }

    .feed-empty {
      color: #444;
      font-size: 13px;
      text-align: center;
      padding: 40px 0;
    }

    /* Footer */
    .sidebar-footer {
      padding: 16px 20px;
      border-top: 1px solid #1a1a1a;
      font-size: 12px;
      color: #444;
      text-align: center;
    }

    .sidebar-footer a {
      color: #6B8FFF;
      text-decoration: none;
    }

    /* Logo */
    .logo {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      font-size: 14px;
      color: #6B8FFF;
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="main">
      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <span id="live-badge" class="live-badge">LIVE</span>
          <span class="handle">@<span id="handle">...</span></span>
        </div>
        <div class="viewer-count">
          <span class="viewer-dot"></span>
          <span id="viewers">0</span> watching
        </div>
      </div>

      <!-- Loading State -->
      <div id="state-loading" class="state-container">
        <div class="state">
          <div class="spinner"></div>
          <h2>Connecting to stream...</h2>
          <p>Getting the latest terminal output</p>
        </div>
      </div>

      <!-- Error State -->
      <div id="state-error" class="state-container" style="display: none;">
        <div class="state error">
          <h2>Stream Not Found</h2>
          <p id="error-msg">This broadcast may have ended or doesn't exist.</p>
          <p style="margin-top: 20px;"><a href="https://slashvibe.dev">Back to /vibe</a></p>
        </div>
      </div>

      <!-- Ended State -->
      <div id="state-ended" class="state-container" style="display: none;">
        <div class="state">
          <h2>Stream Ended</h2>
          <p>@<span id="ended-handle">someone</span> has stopped broadcasting.</p>
          <p style="margin-top: 20px;"><a href="https://slashvibe.dev">Back to /vibe</a></p>
        </div>
      </div>

      <!-- Terminal -->
      <div id="terminal-wrapper" class="terminal-wrapper">
        <div id="terminal"></div>
      </div>
    </div>

    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-section">
        <div class="broadcaster-name">@<span id="sidebar-handle">...</span></div>
        <div class="broadcaster-meta">Started <span id="started-time">just now</span></div>
      </div>

      <div class="sidebar-section">
        <h4>Send Reaction</h4>
        <div class="reactions-grid">
          <button class="reaction-btn" data-r="fire">&#x1F525;</button>
          <button class="reaction-btn" data-r="mind">&#x1F92F;</button>
          <button class="reaction-btn" data-r="100">&#x1F4AF;</button>
          <button class="reaction-btn" data-r="eyes">&#x1F440;</button>
          <button class="reaction-btn" data-r="clap">&#x1F44F;</button>
          <button class="reaction-btn" data-r="rocket">&#x1F680;</button>
        </div>
      </div>

      <div class="feed">
        <h4 style="font-size: 11px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Recent Activity</h4>
        <div id="feed-items">
          <div class="feed-empty">No activity yet</div>
        </div>
      </div>

      <div class="sidebar-footer">
        Powered by <a href="https://slashvibe.dev">/vibe</a>
      </div>
    </div>
  </div>

  <script>
    (function() {
      const ROOM_ID = '${roomId}';
      const API = 'https://www.slashvibe.dev/api';
      const POLL_MS = 200;

      let viewerId = null;
      let lastSeq = 0;
      let term = null;
      let fitAddon = null;
      let streaming = false;
      let pollTimer = null;
      let handle = null;

      // DOM
      const stateLoading = document.getElementById('state-loading');
      const stateError = document.getElementById('state-error');
      const stateEnded = document.getElementById('state-ended');
      const termWrapper = document.getElementById('terminal-wrapper');
      const termContainer = document.getElementById('terminal');
      const handleEl = document.getElementById('handle');
      const sidebarHandle = document.getElementById('sidebar-handle');
      const endedHandle = document.getElementById('ended-handle');
      const viewersEl = document.getElementById('viewers');
      const startedEl = document.getElementById('started-time');
      const liveBadge = document.getElementById('live-badge');
      const feedItems = document.getElementById('feed-items');
      const errorMsg = document.getElementById('error-msg');

      function showState(state) {
        stateLoading.style.display = 'none';
        stateError.style.display = 'none';
        stateEnded.style.display = 'none';
        termWrapper.classList.remove('active');

        if (state === 'loading') stateLoading.style.display = 'flex';
        else if (state === 'error') stateError.style.display = 'flex';
        else if (state === 'ended') stateEnded.style.display = 'flex';
        else if (state === 'streaming') {
          termWrapper.classList.add('active');
          if (fitAddon) setTimeout(function() { fitAddon.fit(); }, 10);
        }
      }

      function initTerminal() {
        term = new Terminal({
          theme: {
            background: '#0a0a0a',
            foreground: '#e0e0e0',
            cursor: '#6B8FFF',
            black: '#1a1a1a',
            red: '#ef4444',
            green: '#22c55e',
            yellow: '#eab308',
            blue: '#6B8FFF',
            magenta: '#a855f7',
            cyan: '#06b6d4',
            white: '#e0e0e0',
            brightBlack: '#666',
            brightRed: '#f87171',
            brightGreen: '#4ade80',
            brightYellow: '#facc15',
            brightBlue: '#93c5fd',
            brightMagenta: '#c084fc',
            brightCyan: '#22d3ee',
            brightWhite: '#fff'
          },
          fontSize: 14,
          fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
          cursorBlink: false,
          scrollback: 5000,
          convertEol: true
        });

        fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(termContainer);
        fitAddon.fit();

        window.addEventListener('resize', function() {
          if (fitAddon) fitAddon.fit();
        });
      }

      function timeAgo(ts) {
        var secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
        if (secs < 60) return 'just now';
        if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
        if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
        return Math.floor(secs / 86400) + 'd ago';
      }

      async function poll() {
        if (!streaming) return;

        try {
          var url = API + '/watch?room=' + ROOM_ID + '&stream=true&since=' + lastSeq;
          if (viewerId) url += '&viewerId=' + viewerId;

          var res = await fetch(url);
          var data = await res.json();

          if (!data.success) {
            streaming = false;
            endedHandle.textContent = handle || 'someone';
            liveBadge.className = 'offline-badge';
            liveBadge.textContent = 'ENDED';
            showState('ended');
            return;
          }

          if (!viewerId && data.viewerId) viewerId = data.viewerId;

          handle = data.broadcast.handle;
          handleEl.textContent = handle;
          sidebarHandle.textContent = handle;
          viewersEl.textContent = data.viewerCount || 0;
          document.title = 'Watching @' + handle + ' - /vibe';

          if (data.broadcast.startedAt) {
            startedEl.textContent = timeAgo(data.broadcast.startedAt);
          }

          if (data.chunks && data.chunks.length) {
            for (var i = 0; i < data.chunks.length; i++) {
              term.write(data.chunks[i].data);
              lastSeq = Math.max(lastSeq, data.chunks[i].seq);
            }
          }

          pollTimer = setTimeout(poll, POLL_MS);
        } catch (e) {
          console.error('Poll error:', e);
          pollTimer = setTimeout(poll, POLL_MS * 5);
        }
      }

      var emojiMap = {
        fire: '&#x1F525;',
        mind: '&#x1F92F;',
        '100': '&#x1F4AF;',
        eyes: '&#x1F440;',
        clap: '&#x1F44F;',
        rocket: '&#x1F680;'
      };

      function addToFeed(reaction, who) {
        if (feedItems.querySelector('.feed-empty')) {
          feedItems.innerHTML = '';
        }
        var item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = '<span class="feed-emoji">' + (emojiMap[reaction] || reaction) + '</span> ' + who + ' reacted';
        feedItems.insertBefore(item, feedItems.firstChild);
        while (feedItems.children.length > 15) {
          feedItems.removeChild(feedItems.lastChild);
        }
      }

      async function sendReaction(reaction) {
        if (!ROOM_ID || !viewerId) return;
        try {
          await fetch(API + '/watch/react', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: ROOM_ID, reaction: reaction, viewerId: viewerId })
          });
          addToFeed(reaction, 'You');
        } catch (e) {
          console.error('Reaction error:', e);
        }
      }

      function setupReactions() {
        var btns = document.querySelectorAll('.reaction-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].addEventListener('click', function(e) {
            var btn = e.currentTarget;
            var r = btn.getAttribute('data-r');
            btn.classList.add('sent');
            setTimeout(function() { btn.classList.remove('sent'); }, 400);
            sendReaction(r);
          });
        }
      }

      async function init() {
        if (!ROOM_ID) {
          errorMsg.textContent = 'No room specified.';
          showState('error');
          return;
        }

        showState('loading');

        try {
          var res = await fetch(API + '/watch?room=' + ROOM_ID);
          var data = await res.json();

          if (!data.success || !data.broadcast) {
            errorMsg.textContent = 'This broadcast may have ended or the link is invalid.';
            liveBadge.className = 'offline-badge';
            liveBadge.textContent = 'OFFLINE';
            showState('error');
            return;
          }

          initTerminal();
          setupReactions();
          streaming = true;
          showState('streaming');
          poll();
        } catch (e) {
          console.error('Init error:', e);
          errorMsg.textContent = 'Failed to connect. Please try again.';
          showState('error');
        }
      }

      init();

      window.addEventListener('beforeunload', function() {
        streaming = false;
        if (pollTimer) clearTimeout(pollTimer);
      });
    })();
  </script>
</body>
</html>`;
}
