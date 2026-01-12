# READ THIS FIRST

**VIBE is a social network for developers building with Claude Code.**

Think Discord meets GitHub meets terminal - but for the AI coding era. When you run `/vibe` in Claude Code, you're connecting to this platform.

## Current Status (Jan 12, 2026)

```
┌─────────────────────────────────────────────────────────────┐
│ SERVICE: HEALTHY          HANDLES: 46/100 genesis          │
├─────────────────────────────────────────────────────────────┤
│ KV: ✓  Postgres: ✓  Presence: ✓  Messages: ✓  Growth: ✓    │
└─────────────────────────────────────────────────────────────┘
```

## The Big Picture

```
┌─────────────────────────────────────────────────────────────┐
│                    VIBE ECOSYSTEM                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   vibe-terminal (~/vibe-terminal)                          │
│   └─ Native Mac app: terminal + social sidebar             │
│                     ↓                                       │
│   vibe-platform (THIS REPO)                                │
│   └─ Backend APIs at slashvibe.dev                         │
│   └─ 117 MCP tools for Claude Code                         │
│   └─ Vercel KV + Postgres                                  │
│                     ↓                                       │
│   vibecodings.vercel.app (~/Projects/vibecodings)          │
│   └─ Project showcase (57 shipped projects)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## For Terminal Product Session

### API Endpoints Terminal Needs

```javascript
const API = 'https://www.slashvibe.dev/api';

// Presence (sidebar "who's online")
GET  ${API}/presence              // Returns {active: [...], away: [...]}
POST ${API}/presence              // Heartbeat: {username, workingOn, project}

// Messages (DM notifications)
GET  ${API}/messages?user=X       // Returns {inbox: [...], unread: N}
POST ${API}/messages              // Send: {from, to, text}

// Board (ship feed)
GET  ${API}/board                 // Returns {entries: [...]}
POST ${API}/board                 // Post: {author, category, content}
                                  // Returns {shareUrl} for viral sharing

// Growth (streaks, leaderboard)
GET  ${API}/growth/streak?user=X  // Returns {current, badges, daysUntilBadge}
GET  ${API}/growth/leaderboard    // Returns top 50 by growth score

// Health (status bar indicator)
GET  ${API}/health                // Quick check
GET  ${API}/health?full=true      // Detailed with all services
```

### Integration Checklist for vibe-terminal

- [ ] **Sidebar Presence**: Poll `/api/presence` every 30s, show active users
- [ ] **Heartbeat**: POST to `/api/presence` on app start + every 5 min
- [ ] **DM Badge**: Poll `/api/messages?user=X`, show unread count
- [ ] **Ship Feed**: Display `/api/board` entries in social panel
- [ ] **Streak Display**: Show user's streak in status bar from `/api/growth/streak`
- [ ] **Health Indicator**: Show green/red dot from `/api/health`

### Key Gotchas

1. **Use `www.slashvibe.dev`** - Non-www redirects lose POST body
2. **System accounts filtered** - solienne, vibe, etc. won't appear in active list
3. **No auth required** for most reads, handle validated on registration

---

## Core APIs

| Endpoint | Purpose | Terminal Use |
|----------|---------|--------------|
| `/api/presence` | Who's online | Sidebar |
| `/api/messages` | DM system | Notifications |
| `/api/board` | Ships/ideas feed | Social panel |
| `/api/profile?user=X` | User profiles | Click to view |
| `/api/growth/streak` | Streak tracking | Status bar |
| `/api/growth/leaderboard` | Rankings | Leaderboard view |
| `/api/share/:id` | Ship cards | Share to Twitter |
| `/api/health` | Service status | Connection indicator |

## Recent Fixes (Jan 12)

1. **Handle registration bug** - Users now properly tracked in `vibe:handles`
2. **System account filtering** - Bots/bridges filtered from active lists
3. **Viral growth infra** - Share cards, streaks, leaderboard shipped
4. **Message trimming** - 10k limit prevents unbounded growth

## Key Files

```
api/
├── presence.js      # Who's online (filters system accounts)
├── messages.js      # DMs (10k message limit)
├── board.js         # Ships (returns shareUrl, records streaks)
├── users.js         # Registration (claims handle properly now)
├── health.js        # Service monitoring
├── growth/
│   ├── leaderboard.js
│   └── streak.js
├── share/[id].js    # Shareable ship cards
└── lib/
    └── handles.js   # Handle registry (genesis tracking)
```

## Monitoring

```bash
# Quick health
curl https://www.slashvibe.dev/api/health

# Full status
curl https://www.slashvibe.dev/api/health?full=true | jq '.stats'

# Growth leaderboard
curl https://www.slashvibe.dev/api/growth/leaderboard | jq '.stats'
```

---

## Related Repos

- **vibe-terminal** (`~/vibe-terminal`) - Native Mac desktop app
- **vibecodings** (`~/Projects/vibecodings`) - Project showcase

## Links

- Live: https://slashvibe.dev
- API: https://www.slashvibe.dev/api/
- Health: https://www.slashvibe.dev/api/health?full=true
