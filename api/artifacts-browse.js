/**
 * GET /artifacts - Browse artifacts page
 * Returns HTML page showing all artifacts in the network
 */

export default async function handler(req, res) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artifacts | /vibe</title>
  <meta name="description" content="Browse guides, learnings, and workspaces created by the /vibe community">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

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

    header {
      border: 1px solid #00FF41;
      padding: 20px;
      margin-bottom: 40px;
      text-align: center;
    }

    h1 {
      font-size: 20px;
      font-weight: 400;
      margin-bottom: 15px;
      text-transform: uppercase;
    }

    .subtitle {
      color: #00AA2B;
      font-size: 12px;
      margin-bottom: 20px;
    }

    .stats {
      display: flex;
      gap: 20px;
      justify-content: center;
      border-top: 1px solid #00AA2B;
      padding-top: 15px;
      margin-top: 15px;
    }

    .stat {
      color: #00AA2B;
      font-size: 11px;
      text-align: center;
    }

    .stat strong {
      color: #88FFA8;
      font-size: 16px;
      font-weight: 400;
      display: block;
      margin-bottom: 5px;
    }

    .loading {
      text-align: center;
      padding: 100px 20px;
      color: #00AA2B;
      font-size: 14px;
    }

    .loading::after {
      content: '...';
      animation: dots 1.5s steps(4, end) infinite;
    }

    @keyframes dots {
      0%, 20% { content: '.'; }
      40% { content: '..'; }
      60%, 100% { content: '...'; }
    }

    .error {
      text-align: center;
      padding: 100px 20px;
      color: #88FFA8;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
      margin-top: 30px;
    }

    .card {
      background: rgba(0, 255, 65, 0.02);
      border: 1px solid #00FF41;
      padding: 20px;
      cursor: pointer;
      text-decoration: none;
      color: #00FF41;
      display: block;
      transition: all 0.2s ease;
    }

    .card:hover {
      background: rgba(0, 255, 65, 0.05);
      box-shadow: 0 0 10px rgba(0, 255, 65, 0.2);
    }

    .card-header {
      margin-bottom: 12px;
    }

    .template-badge {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid #00FF41;
      font-size: 11px;
      text-transform: uppercase;
    }

    .template-guide {
      border-color: #00FF41;
      color: #00FF41;
    }

    .template-learning {
      border-color: #88FFA8;
      color: #88FFA8;
    }

    .template-workspace {
      border-color: #00AA2B;
      color: #00AA2B;
    }

    .card-title {
      font-size: 16px;
      font-weight: 400;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #00AA2B;
    }

    .creator {
      color: #88FFA8;
    }

    .creator::before {
      content: '> ';
    }

    .date {
      color: #00AA2B;
    }

    .card-preview {
      color: #00FF41;
      font-size: 13px;
      line-height: 1.5;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }

    .empty {
      text-align: center;
      padding: 100px 20px;
      color: #00AA2B;
    }

    .empty h2 {
      color: #00FF41;
      font-weight: 400;
      text-transform: uppercase;
      margin-bottom: 15px;
    }

    footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #00FF41;
      text-align: center;
      color: #00AA2B;
      font-size: 12px;
    }

    footer a {
      color: #88FFA8;
      text-decoration: none;
      border-bottom: 1px solid #88FFA8;
    }

    footer a:hover {
      color: #00FF41;
      text-shadow: 0 0 4px rgba(0, 255, 65, 0.6);
    }

    .cursor {
      animation: blink 1s infinite;
    }

    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }

    @media (max-width: 768px) {
      .stats {
        flex-wrap: wrap;
        gap: 15px;
      }

      h1 {
        font-size: 16px;
      }
    }

    @media (max-width: 680px) {
      body {
        font-size: 13px;
        padding: 20px 10px;
      }

      .container {
        max-width: 100%;
        padding: 0 10px;
      }

      .grid {
        grid-template-columns: 1fr;
        gap: 15px;
      }

      .card {
        padding: 15px;
      }

      .stats {
        gap: 10px;
      }

      .stat {
        font-size: 12px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Artifacts</h1>
      <p class="subtitle">Just-in-time social objects — guides, learnings, and workspaces</p>
      <div class="stats">
        <div class="stat">
          <strong id="total-count">—</strong>
          <span>Total</span>
        </div>
        <div class="stat">
          <strong id="guide-count">—</strong>
          <span>Guides</span>
        </div>
        <div class="stat">
          <strong id="learning-count">—</strong>
          <span>Learnings</span>
        </div>
        <div class="stat">
          <strong id="workspace-count">—</strong>
          <span>Workspaces</span>
        </div>
      </div>
    </header>

    <div id="content">
      <div class="loading">Loading artifacts</div>
    </div>

    <footer>
      <p>/vibe · <a href="https://slashvibe.dev">slashvibe.dev</a> · social layer for Claude Code<span class="cursor">_</span></p>
    </footer>
  </div>

  <script>
    async function loadArtifacts() {
      const contentEl = document.getElementById('content');

      try {
        // Fetch artifacts from API
        const response = await fetch('/api/artifacts?scope=network&handle=guest&limit=50');
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to load artifacts');
        }

        const artifacts = data.artifacts || [];

        // Update stats
        document.getElementById('total-count').textContent = artifacts.length;
        document.getElementById('guide-count').textContent =
          artifacts.filter(a => a.template === 'guide').length;
        document.getElementById('learning-count').textContent =
          artifacts.filter(a => a.template === 'learning').length;
        document.getElementById('workspace-count').textContent =
          artifacts.filter(a => a.template === 'workspace').length;

        // Render artifacts
        if (artifacts.length === 0) {
          contentEl.innerHTML = \`
            <div class="empty">
              <h2>No artifacts yet</h2>
              <p>Be the first to create one!</p>
            </div>
          \`;
          return;
        }

        const grid = document.createElement('div');
        grid.className = 'grid';

        artifacts.forEach(artifact => {
          const card = createArtifactCard(artifact);
          grid.appendChild(card);
        });

        contentEl.innerHTML = '';
        contentEl.appendChild(grid);

      } catch (error) {
        console.error('Error loading artifacts:', error);
        contentEl.innerHTML = \`
          <div class="error">
            <p>Failed to load artifacts</p>
            <p style="font-size: 0.9rem; margin-top: 10px;">\${error.message}</p>
          </div>
        \`;
      }
    }

    function createArtifactCard(artifact) {
      const card = document.createElement('a');
      card.className = 'card';
      card.href = \`/a/\${artifact.slug}\`;

      // Extract preview text from first paragraph block
      let previewText = 'No preview available';
      if (artifact.content && artifact.content.blocks) {
        const firstPara = artifact.content.blocks.find(b => b.type === 'paragraph');
        if (firstPara && firstPara.markdown) {
          previewText = firstPara.markdown.substring(0, 150);
          if (firstPara.markdown.length > 150) {
            previewText += '...';
          }
        }
      }

      // Format date
      const date = new Date(artifact.created_at);
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      card.innerHTML = \`
        <div class="card-header">
          <span class="template-badge template-\${artifact.template}">\${artifact.template}</span>
        </div>
        <h2 class="card-title">\${escapeHtml(artifact.title)}</h2>
        <div class="card-meta">
          <span class="creator">@\${escapeHtml(artifact.created_by)}</span>
          <span class="date">\${dateStr}</span>
        </div>
        <p class="card-preview">\${escapeHtml(previewText)}</p>
      \`;

      return card;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Load artifacts on page load
    loadArtifacts();
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  return res.status(200).send(html);
}
