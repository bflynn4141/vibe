# /vibe Platform

**Backend infrastructure for the /vibe social network for Claude Code users.**

Live at: https://slashvibe.dev

## Current Status (Jan 12, 2026)

```
┌─────────────────────────────────────────────────────────────┐
│ SERVICE HEALTH: HEALTHY                                     │
├─────────────────────────────────────────────────────────────┤
│ Registered Handles: 46        Genesis Remaining: 54         │
│ Active Users: 4-8             System Status: All Green      │
├─────────────────────────────────────────────────────────────┤
│ KV (Redis):   ✓ healthy       Postgres: ✓ healthy           │
│ Presence:     ✓ healthy       Board:    ✓ healthy           │
│ Messages:     ✓ healthy       Growth:   ✓ healthy           │
└─────────────────────────────────────────────────────────────┘
```

## What This Is

/vibe is the social layer for developers building with Claude Code:
- **Presence** - See who's building right now
- **DMs** - Terminal-native messaging between developers
- **Ships** - Share what you built with shareable cards
- **Streaks** - Track consecutive days of building
- **Genesis** - First 100 users get special status

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│   vibe-terminal (~/vibe-terminal)                           │
│   └─ Native Mac app: terminal + social sidebar              │
│                      ↓                                       │
│   vibe-platform (THIS REPO)                                 │
│   └─ Backend APIs at slashvibe.dev                          │
│   └─ 117 MCP tools for Claude Code integration              │
│                      ↓                                       │
│   Storage: Vercel KV (Redis) + Postgres                     │
└─────────────────────────────────────────────────────────────┘
```

## Core APIs

| Endpoint | Purpose |
|----------|---------|
| `GET/POST /api/presence` | Who's online, heartbeats |
| `GET/POST /api/messages` | DM inbox and sending |
| `GET/POST /api/board` | Ships, ideas, community feed |
| `GET /api/profile?user=X` | User profiles |
| `GET /api/health?full=true` | Service health monitoring |
| `GET /api/growth/leaderboard` | Adoption leaderboard |
| `GET/POST /api/growth/streak` | Streak tracking |
| `GET /api/share/:id` | Shareable ship cards |
| `POST /api/users` | User registration |
| `POST /api/invites` | Invite code generation |

## Quick Start (MCP Server)

```bash
# Install the MCP server
claude mcp add vibe-mcp

# Initialize with your handle
# Tell Claude: "vibe init as @yourhandle"

# See who's online
# Tell Claude: "vibe who"

# Send a message
# Tell Claude: "vibe dm @seth hello!"
```

## Key Files

```
vibe-platform/
├── api/                    # Vercel serverless functions
│   ├── presence.js         # Who's online
│   ├── messages.js         # DM system
│   ├── board.js            # Ships/ideas feed
│   ├── users.js            # Registration (with handle claiming)
│   ├── invites.js          # Invite code system
│   ├── health.js           # Service monitoring
│   ├── growth/             # Viral mechanics
│   │   ├── leaderboard.js  # Adoption rankings
│   │   └── streak.js       # Daily streaks
│   ├── share/[id].js       # Shareable ship cards
│   └── lib/
│       ├── handles.js      # Handle registry (genesis tracking)
│       └── ratelimit.js    # Rate limiting
├── mcp-server/             # Claude Code MCP integration
│   ├── tools/              # 117 MCP tools
│   └── store/              # API client
├── public/
│   └── llms.txt            # AI assistant documentation
└── vercel.json             # Routing config
```

## Recent Developments (Jan 11-12, 2026)

### Critical Fixes
- **Handle Registration Bug** - Users now properly tracked in `vibe:handles` hash
  - Was: 22 users stuck for days (only in legacy `user:*` keys)
  - Now: 46 handles properly registered with genesis tracking
- **System Account Filtering** - Bots/bridges filtered from active user lists
- **API URL Fix** - All MCP tools now use `www.slashvibe.dev` (fixes POST redirect)

### Viral Growth Infrastructure
- **Share Cards** (`/api/share/:id`) - Every ship gets a beautiful shareable page with OG tags
- **Streak System** (`/api/growth/streak`) - 7-day streak = Verified Builder badge
- **Growth Leaderboard** (`/api/growth/leaderboard`) - Ranks users by invites + activity
- **Auto-streak Recording** - Ships automatically record daily activity

### Core Loop
```
Build → Ship → Share → Get seen → Invite friends → Repeat
```

## Environment Variables

Required in Vercel:
- `KV_REST_API_URL` - Vercel KV endpoint
- `KV_REST_API_TOKEN` - Vercel KV auth
- `POSTGRES_URL` - Neon Postgres connection
- `VIBE_GENESIS_CAP` - Genesis limit (set to 100)

## Monitoring

```bash
# Quick health check
curl https://www.slashvibe.dev/api/health

# Full health with all services
curl https://www.slashvibe.dev/api/health?full=true

# Growth leaderboard
curl https://www.slashvibe.dev/api/growth/leaderboard
```

## Related Repos

- **vibe-terminal** (`~/vibe-terminal`) - Native Mac desktop app
- **vibecodings** (`~/Projects/vibecodings`) - Project showcase site

## Links

- **Live**: https://slashvibe.dev
- **API**: https://www.slashvibe.dev/api/
- **MCP Install**: `claude mcp add vibe-mcp`
- **Docs**: https://slashvibe.dev/docs

---

**Part of Spirit Protocol** | Building the social layer for AI-native development
