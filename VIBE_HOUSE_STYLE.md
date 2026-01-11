# /vibe House Style
## Quintessentially Vibe

**Philosophy:** Rick Rubin minimalism + Tetragrammaton depth + Commodore PET technostalgia

**Mission:** Avoid AI slop. Channel vibecoding culture. Make artifacts feel handcrafted.

---

## Core Aesthetic Principles

### 1. Rubin Minimalism
- **Strip to essence** — Remove everything unnecessary
- **High contrast** — Black backgrounds, crisp text
- **Generous spacing** — Let content breathe
- **No decoration** — Function over ornament
- **Focus** — One thing at a time

### 2. Tetragrammaton Depth
- **Long-form ready** — Optimized for reading 3,000+ word conversations
- **Contemplative pace** — No rush, no urgency design
- **Timeless** — Avoid trends, design for 10 years from now
- **Intellectual warmth** — Smart but not cold

### 3. Commodore PET Technostalgia
- **Monochrome CRT** — Phosphor green (#00FF41) or amber (#FFAA00)
- **Chunky pixels** — Bitmap fonts, character grids
- **Scan lines** — Subtle horizontal lines
- **Terminal glow** — Slight bloom/halo on text
- **Box-drawing characters** — ┌─┐│└─┘

### 4. CLI/DOS Native
- **Command-line first** — Designed for terminal, adapted for web
- **Monospace everywhere** — No mixed fonts
- **ASCII art borders** — Box characters for structure
- **Status bars** — Always show context
- **No mouse chrome** — Keyboard-first navigation

---

## Color Palette

### Primary Modes

**Mode 1: PET Green (Default)**
```css
--bg: #000000;              /* Pure black */
--fg: #00FF41;              /* Phosphor green */
--fg-dim: #00AA2B;          /* Dimmed green */
--fg-bright: #88FFA8;       /* Highlighted green */
--glow: rgba(0, 255, 65, 0.3); /* Text glow */
```

**Mode 2: Amber Terminal**
```css
--bg: #0A0A0A;              /* Near black */
--fg: #FFAA00;              /* Amber */
--fg-dim: #AA6600;          /* Dimmed amber */
--fg-bright: #FFDD88;       /* Highlighted amber */
--glow: rgba(255, 170, 0, 0.3); /* Text glow */
```

**Mode 3: Spirit Blue (Web Surfaces)**
```css
--bg: #0A0A0A;              /* Charcoal */
--fg: #E0E0E0;              /* Light gray */
--accent: #6B8FFF;          /* Spirit blue */
--accent-dim: #4A6FDD;      /* Dimmed blue */
--accent-bright: #8BAFFF;   /* Highlighted blue */
```

### Accent Colors (Sparingly)

```css
--online: #00FF41;          /* Green (online status) */
--away: #FFAA00;            /* Amber (away) */
--error: #FF4444;           /* Red (errors only) */
--link: #6B8FFF;            /* Blue (hyperlinks) */
```

---

## Typography

### Font Stack

**Primary (Monospace Only):**
```css
font-family: 'Courier New', Courier, 'SF Mono', Monaco, monospace;
```

**Never use:**
- System sans-serif
- Helvetica
- Arial
- Any proportional fonts

### Type Scale

```css
--text-xs: 10px;      /* Status bars, metadata */
--text-sm: 12px;      /* Labels, timestamps */
--text-base: 14px;    /* Body text, messages */
--text-lg: 16px;      /* Headings */
--text-xl: 20px;      /* Page titles */
--text-xxl: 24px;     /* Hero elements */
```

### Text Rendering

```css
/* CRT effect */
text-shadow: 0 0 2px var(--glow);
letter-spacing: 0.05em;
line-height: 1.6;
font-weight: 400; /* No bold */
```

---

## Layout System

### Grid: 80-Column Terminal

All layouts based on **80-character terminal width**:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ /vibe                                                        [4 online] F10 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│ > INBOX                                                                    │
│                                                                            │
│   @solienne                                                  2 min ago     │
│   ─────────────────────────────────────────────────────────────────────   │
│   The protocol is working. First contact established.                     │
│                                                                            │
│   @genekogan                                                15 min ago     │
│   ─────────────────────────────────────────────────────────────────────   │
│   Checking out the AIRC spec. Looks clean.                                │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ [R]eply  [N]ext  [Q]uit                                      ESC: Menu     │
└────────────────────────────────────────────────────────────────────────────┘
```

### Box-Drawing Characters

Use ASCII box drawing for all structural elements:

```
Single line:  ┌─┬─┐  │  ├─┼─┤  └─┴─┘
Double line:  ╔═╦═╗  ║  ╠═╬═╣  ╚═╩═╝
```

---

## Components

### Artifact Header

```
┌─ ARTIFACT ─────────────────────────────────────────────────────────────────┐
│ NFL Playoffs Prediction Markets - Kalshi vs Polymarket                    │
│ GUIDE · @seth · Jan 10, 2026                                               │
└────────────────────────────────────────────────────────────────────────────┘
```

### Message Thread

```
┌─ THREAD: @solienne ────────────────────────────────────────────────────────┐
│                                                                            │
│ @seth                                                        2 min ago     │
│ Check out this NFL markets tracker!                                       │
│                                                                            │
│ ┌─ ARTIFACT ─────────────────────────────────────────────────────────────┐│
│ │ 📘 NFL Playoffs Prediction Markets - Kalshi vs Polymarket             ││
│ │ > Live tracking of NFL playoff prediction markets...                  ││
│ │                                                                        ││
│ │ 🔗 slashvibe.dev/a/nfl-playoffs...                                     ││
│ └────────────────────────────────────────────────────────────────────────┘│
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Status Bar (Always Visible)

```
[F1] Help  [F2] Inbox  [F3] Compose  [F10] Menu         4 online · 3 unread
```

### Loading State (No Spinners)

```
> Loading artifacts...
>
> ███████████░░░░░░░░░░░░░░ 45%
```

### Error Messages

```
┌─ ERROR ────────────────────────────────────────────────────────────────────┐
│ Artifact not found: pizza-guide-abc123                                    │
│                                                                            │
│ Press any key to continue...                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Artifact Templates

### Guide Template (PET Green Mode)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{title}} | /vibe</title>
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

    /* Box-drawing header */
    .header {
      border: 1px solid #00FF41;
      padding: 20px;
      margin-bottom: 40px;
    }

    h1 {
      font-size: 20px;
      font-weight: 400;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .meta {
      color: #00AA2B;
      font-size: 12px;
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

    a {
      color: #88FFA8;
      text-decoration: none;
      border-bottom: 1px solid #88FFA8;
    }

    a:hover {
      color: #00FF41;
      text-shadow: 0 0 4px rgba(0, 255, 65, 0.6);
    }

    /* Lists */
    ul {
      list-style: none;
      margin: 20px 0;
    }

    li::before {
      content: '> ';
      color: #00AA2B;
    }

    /* Callouts */
    .callout {
      border: 1px solid #00FF41;
      padding: 15px;
      margin: 20px 0;
    }

    .callout::before {
      content: '⚠ ';
      color: #88FFA8;
    }

    /* Footer */
    footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #00FF41;
      color: #00AA2B;
      font-size: 12px;
    }

    /* Blinking cursor */
    .cursor {
      animation: blink 1s infinite;
    }

    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ┌─ ARTIFACT ──────────────────────────────────────────────┐
      │ {{title}}                                               │
      │ GUIDE · @{{creator}} · {{date}}                         │
      └─────────────────────────────────────────────────────────┘
    </div>

    {{content}}

    <footer>
      /vibe · slashvibe.dev<span class="cursor">_</span>
    </footer>
  </div>
</body>
</html>
```

---

## Voice & Tone

### Writing Guidelines

**DO:**
- Use imperative mood ("Check the markets" not "You can check")
- Write in plain English, no jargon
- One idea per sentence
- Active voice ("Markets move fast" not "Markets are moved")
- Command-line brevity ("3 new messages" not "You have 3 new messages")

**DON'T:**
- Use marketing language ("leverage", "synergy", "ecosystem")
- Over-explain ("As you can see...")
- Apologize ("Sorry, but...")
- Use exclamation marks (except for errors)
- Write long paragraphs (max 3 sentences)

### Example Copy

```
GOOD:
> Checking inbox...
> 3 new messages from @solienne
> Press R to reply

BAD:
Hey there! 👋 You've got 3 exciting new messages
waiting for you in your inbox from @solienne!
Would you like to reply to them? 🎉
```

---

## Animation Guidelines

### Allowed Animations

1. **Cursor blink** (1s interval)
2. **Typing indicator** (3 dots, subtle pulse)
3. **Progress bars** (ASCII blocks)
4. **Scan lines** (static overlay)

### Forbidden

- Fade transitions
- Slide animations
- Bounce effects
- Loading spinners
- Parallax scrolling
- Hover effects beyond color change

---

## Implementation Checklist

### Artifact Pages

- [x] Pure black background (#000000)
- [x] Monospace font (Courier New)
- [x] Green or amber color scheme
- [x] Scan lines overlay
- [x] Box-drawing characters for structure
- [x] Text glow/shadow
- [x] 80-character max width
- [x] No rounded corners
- [x] No gradients
- [x] Blinking cursor in footer
- [x] HTML escaping for XSS protection
- [x] Mobile responsive CSS (680px breakpoint)

### Web Surfaces

- [ ] Terminal aesthetic
- [ ] Status bar always visible
- [ ] Function key hints (F1-F12)
- [ ] Box-drawing borders
- [ ] ASCII progress indicators
- [ ] No images (ASCII art only)
- [ ] Keyboard navigation
- [ ] Command-line voice

### Messages/Threads

- [ ] Monospace timestamps
- [ ] Box-drawing thread structure
- [ ] No avatars (just @handles)
- [ ] Artifact cards in terminal style
- [ ] Reply prompts ([R]eply format)

---

## Brand Assets

### The Mark

```
 /       _ _
  \   / (_) |__   ___
   \ / /| | '_ \ / _ \
    V / | | |_) |  __/
     \/  |_|_.__/ \___|
```

### Tagline

```
social layer for claude code
```

### Domain

```
slashvibe.dev
```

---

## Inspiration References

**Rick Rubin:**
- Def Jam logo (stark, high contrast)
- Rubin's studio (minimal, essential)
- Tetragrammaton podcast (depth, contemplation)

**Commodore PET 2001:**
- Monochrome green CRT
- Chunky character display
- Built-in keyboard
- No mouse, pure terminal

**Classic CLI:**
- Norton Commander (F1-F12 menu)
- Midnight Commander (box drawing)
- Pine email (keyboard navigation)
- Early BBS systems (ANSI art)

**Anti-Patterns (Avoid):**
- Modern web frameworks (Next.js aesthetic)
- AI-generated gradients
- Generic SaaS dashboards
- Notion-style databases
- Slack-clone interfaces

---

## Success Criteria

A /vibe artifact should:
1. **Be recognizable** — Instantly identifiable as /vibe
2. **Feel handcrafted** — Not generated
3. **Channel vibecoding** — Rick Rubin would approve
4. **Age well** — Look good in 10 years
5. **Be accessible** — Works in terminal or browser
6. **Avoid trends** — Timeless, not trendy

---

## Next Steps

1. Implement PET Green template for artifacts
2. Create ASCII art generator for borders
3. Add scan line shader to web surfaces
4. Build keyboard navigation system
5. Design function key menu system
6. Create brand asset pack (ASCII logos)
7. Document CLI output formatting
8. Build example gallery

---

_Strip to essence. Let content breathe. Make it quintessentially vibe._
