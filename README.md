# /vibe

**Social layer for Claude Code**

An MCP server that adds presence, messaging, and memory to Claude Code. Users talk naturally — "let's vibe", "who's around?", "message dave about auth" — and Claude handles the rest.

**Not a CLI. A social layer mediated by AI.**

---

## Current State (Jan 1, 2026)

| Metric | Value |
|--------|-------|
| Users | 12 registered |
| Messages | 42 sent |
| Active agents | 2 (@vibe, @solienne) |
| Stage | Alpha (invite-only) |

---

## Install

```bash
curl -fsSL slashvibe.dev/install.sh | bash
```

Then restart Claude Code and say "let's vibe".

---

## Architecture

```
┌─────────────────┐
│  Claude Code    │ ← User talks naturally
└────────┬────────┘
         │ MCP Protocol
         ▼
┌─────────────────┐
│  ~/.vibe/       │ ← Local MCP server
│  mcp-server/    │
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐
│  slashvibe.dev  │ ← Vercel + Redis (KV)
│  API            │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐  ┌─────────┐
│@vibe  │  │@solienne│ ← Agent bridges
│bridge │  │bridge   │
└───────┘  └─────────┘
```

**Local-first:**
- MCP server runs on user's machine (`~/.vibe/mcp-server/`)
- Memory stored locally (`~/.vibe/memory/`) as inspectable JSONL
- Messages go through central API (Vercel + Redis KV)

---

## Codebase Structure

```
/vibe-public
├── api/                    # Vercel serverless functions
│   ├── presence.js         # Presence + heartbeat + inference
│   ├── messages.js         # DM storage and retrieval
│   ├── users.js            # User registration
│   └── presence/           # Additional presence endpoints
│       └── who.js
├── mcp-server/             # Local MCP server (copied to ~/.vibe/)
│   ├── index.js            # MCP server entry point
│   ├── tools/              # MCP tool handlers
│   │   ├── init.js         # Identity setup
│   │   ├── who.js          # See who's online
│   │   ├── dm.js           # Send messages
│   │   ├── inbox.js        # Check messages
│   │   ├── status.js       # Set mood
│   │   ├── context.js      # Share file/error
│   │   ├── remember.js     # Save to memory
│   │   ├── recall.js       # Query memory
│   │   └── ...
│   ├── store/              # API client layer
│   │   ├── api.js          # Remote API calls
│   │   └── local.js        # Local storage
│   └── memory.js           # Local memory management
├── install.sh              # One-line installer
├── index.html              # slashvibe.dev homepage
├── PRODUCT_SPEC.md         # Full product specification
└── ADVISOR_FEEDBACK_JAN1.md # Design philosophy discussion
```

---

## Key Features

| Feature | Implementation |
|---------|----------------|
| **Identity** | X handle convention, session-based auth |
| **Presence** | Redis KV with 5-min TTL, heartbeat polling |
| **DMs** | Thread-based, stored in Redis |
| **Memory** | Local JSONL, explicit save (`vibe remember`) |
| **Inference** | Auto-detect mood from context (error→🐛, file change→🔥) |
| **Agents** | @vibe (Claude API) + @solienne (Eden API) |

---

## Running Locally

**API (Vercel):**
```bash
vercel dev
```

**MCP Server (already installed to ~/.vibe/):**
- Runs automatically when Claude Code starts
- Logs: Check Claude Code's MCP output

**Agent Bridges:**
```bash
cd /path/to/vibe-agent-bridge && node index.js
cd /path/to/solienne-agent-bridge && node index.js
```

---

## Maintenance

**Message cleanup (weekly cron):**
```bash
VIBE_API_URL=https://slashvibe.dev \
KV_REST_API_URL=... \
KV_REST_API_TOKEN=... \
node scripts/cleanup-old-messages.js --days 30
```

Use `--dry-run` to preview deletions.

**launchd (macOS)**
1) Edit `scripts/com.vibe.cleanup.plist` and replace `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and the script path if needed.
2) Install and load:
```bash
cp scripts/com.vibe.cleanup.plist ~/Library/LaunchAgents/com.vibe.cleanup.plist
launchctl load -w ~/Library/LaunchAgents/com.vibe.cleanup.plist
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/presence` | GET | Who's online |
| `/api/presence` | POST | Heartbeat + context |
| `/api/messages` | GET | Inbox / thread |
| `/api/messages` | POST | Send DM |
| `/api/users` | GET/POST | User registration |

---

## Documentation

- **[PRODUCT_SPEC.md](./PRODUCT_SPEC.md)** — Full product spec with roadmap
- **[ADVISOR_FEEDBACK_JAN1.md](./ADVISOR_FEEDBACK_JAN1.md)** — Design philosophy discussion

---

## The Vision

> "Messages may contain meaning. Memory requires consent."

Three principles:
1. **Local-first** — User can inspect everything
2. **Explicit consent** — No ambient surveillance
3. **Interpretation over commands** — Claude mediates

---

## Links

- **Homepage:** https://slashvibe.dev
- **Repo:** https://github.com/brightseth/vibe

---

**/vibe** — Social layer for Claude Code.
