/**
 * GET /style-demo - PET Green aesthetic showcase
 * Serves the /vibe house style demo page
 */

export default async function handler(req, res) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terminal Guide - New /vibe Aesthetic | /vibe</title>
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

    /* Scan lines */
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

    h1 {
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

    h2 {
      font-size: 16px;
      font-weight: 400;
      margin: 40px 0 20px 0;
      text-transform: uppercase;
      border-bottom: 1px solid #00FF41;
      padding-bottom: 5px;
    }

    p {
      margin-bottom: 20px;
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

    ul {
      list-style: none;
      margin: 20px 0;
    }

    li {
      margin-bottom: 10px;
    }

    li::before {
      content: '> ';
      color: #00AA2B;
    }

    .callout {
      border: 1px solid #00FF41;
      padding: 15px;
      margin: 20px 0;
      background: rgba(0, 255, 65, 0.02);
    }

    .callout-header {
      color: #88FFA8;
      margin-bottom: 10px;
    }

    code {
      background: rgba(0, 255, 65, 0.1);
      padding: 2px 6px;
      border: 1px solid #00AA2B;
    }

    .box {
      border: 1px solid #00FF41;
      padding: 15px;
      margin: 20px 0;
    }

    footer {
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

    .status-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #000;
      border-top: 1px solid #00FF41;
      padding: 10px 20px;
      font-size: 12px;
      z-index: 2000;
    }

    .kbd {
      display: inline-block;
      padding: 2px 6px;
      border: 1px solid #00FF41;
      margin: 0 2px;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <pre>┌─ ARTIFACT ──────────────────────────────────────────────────────────────┐
│ NEW /VIBE HOUSE STYLE                                                  │
│ GUIDE · @seth · Jan 10, 2026                                           │
└────────────────────────────────────────────────────────────────────────┘</pre>
    </div>

    <h2>Philosophy</h2>

    <p>
      <strong>Rick Rubin minimalism</strong> — Strip to essence. Remove everything unnecessary.
      Let content breathe.
    </p>

    <p>
      <strong>Tetragrammaton depth</strong> — Long-form ready. Contemplative pace.
      Designed for reading 3,000+ word conversations without fatigue.
    </p>

    <p>
      <strong>Commodore PET technostalgia</strong> — Monochrome green CRT. Chunky pixels.
      Scan lines. Terminal glow. Box-drawing characters.
    </p>

    <h2>Core Principles</h2>

    <ul>
      <li>Monospace fonts only (Courier New)</li>
      <li>80-character terminal width</li>
      <li>Box-drawing characters for structure</li>
      <li>Phosphor green on pure black</li>
      <li>Text glow/shadow for CRT effect</li>
      <li>Scan lines overlay</li>
      <li>No rounded corners</li>
      <li>No gradients</li>
      <li>No AI slop</li>
    </ul>

    <h2>Color Palette</h2>

    <div class="box">
      <pre>Background:    #000000  (pure black)
Foreground:    #00FF41  (phosphor green)
Dimmed:        #00AA2B  (dimmed green)
Highlighted:   #88FFA8  (bright green)
Text glow:     rgba(0, 255, 65, 0.3)</pre>
    </div>

    <h2>Typography</h2>

    <p>
      All text uses <code>Courier New</code> or <code>Monaco</code> monospace.
      14px base size. Letter spacing 0.05em. Line height 1.6.
    </p>

    <div class="callout">
      <div class="callout-header">⚠ IMPORTANT</div>
      <p>
        Never use system sans-serif, Helvetica, or Arial.
        This is a terminal aesthetic. Monospace or nothing.
      </p>
    </div>

    <h2>Layout System</h2>

    <p>
      All layouts based on 80-character terminal width. Use ASCII box-drawing
      characters for structure:
    </p>

    <div class="box">
      <pre>┌─────────────────────────────────────────┐
│ Single line borders                     │
├─────────────────────────────────────────┤
│ Use for most UI elements                │
└─────────────────────────────────────────┘

╔═════════════════════════════════════════╗
║ Double line borders                     ║
╠═════════════════════════════════════════╣
║ Use for emphasis or modals              ║
╚═════════════════════════════════════════╝</pre>
    </div>

    <h2>Example: Inbox View</h2>

    <div class="box">
      <pre>┌─ INBOX ──────────────────────────────────┐
│                                          │
│ @solienne                   2 min ago    │
│ ──────────────────────────────────────── │
│ The protocol is working.                 │
│                                          │
│ @genekogan                 15 min ago    │
│ ──────────────────────────────────────── │
│ Checking out the AIRC spec.              │
│                                          │
└──────────────────────────────────────────┘</pre>
    </div>

    <h2>Function Keys</h2>

    <p>
      Always show function key hints in status bar:
    </p>

    <p>
      <span class="kbd">F1</span> Help
      <span class="kbd">F2</span> Inbox
      <span class="kbd">F3</span> Compose
      <span class="kbd">F10</span> Menu
    </p>

    <h2>What This Isn't</h2>

    <ul>
      <li>Not a modern web framework aesthetic</li>
      <li>Not Notion-style databases</li>
      <li>Not a Slack clone interface</li>
      <li>Not AI-generated gradients</li>
      <li>Not generic SaaS dashboards</li>
    </ul>

    <div class="callout">
      <div class="callout-header">✓ SUCCESS CRITERIA</div>
      <p>
        A /vibe artifact should be instantly recognizable. It should feel
        handcrafted, not generated. Rick Rubin would approve. It should age
        well — look good in 10 years.
      </p>
    </div>

    <h2>Next Steps</h2>

    <ul>
      <li>Apply this aesthetic to all new artifacts</li>
      <li>Migrate existing artifacts to PET Green template</li>
      <li>Build keyboard navigation system</li>
      <li>Create ASCII art generator for borders</li>
      <li>Document CLI output formatting standards</li>
    </ul>

    <footer>
      /vibe · slashvibe.dev · quintessentially vibe<span class="cursor">_</span>
    </footer>
  </div>

  <div class="status-bar">
    <span class="kbd">F1</span> Help
    <span class="kbd">ESC</span> Close
    <span style="float: right; color: #00AA2B;">
      PET GREEN MODE · 80 COL
    </span>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  return res.status(200).send(html);
}
