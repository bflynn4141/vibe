# vibe-terminal Integration Specification

**Version**: 2.0
**Last Updated**: January 13, 2026

This document specifies how `vibe-terminal` (the native Mac desktop app) should integrate with the `vibe-platform` API to deliver a native, delightful experience.

---

## API Base URL

```
https://www.slashvibe.dev/api
```

**Important**: Always use `www.slashvibe.dev` - non-www redirects lose POST body.

---

## Core Integration Points

### 1. Notifications (Primary Integration)

The terminal should poll for notifications to show native desktop alerts.

```
GET /api/notifications?user={handle}&since={timestamp}
```

**Response**:
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notif_abc123",
      "type": "reaction",
      "from": "maya",
      "preview": "🔥 reacted to your ship",
      "createdAt": "2026-01-13T...",
      "read": false,
      "data": { "entryId": "ship_xyz", "emoji": "fire" }
    }
  ],
  "unread": 5,
  "summary": {
    "reaction": 3,
    "comment": 1,
    "dm": 1
  },
  "timestamp": "2026-01-13T..."
}
```

**Notification Types**:
| Type | Description | Native Alert |
|------|-------------|--------------|
| `reaction` | Someone reacted to your ship | "🔥 @maya reacted to your ship" |
| `comment` | Someone commented | "💬 @gene commented: Nice work!" |
| `dm` | New DM received | "📬 New message from @stan" |
| `achievement` | Milestone reached | "🎉 First Ship! Keep building" |
| `gig_match` | Gig matches your skills | "💼 New gig matches your skills" |
| `weekly_digest` | Sunday summary | "📊 Your week: 3 ships, 8 reactions" |

**Polling Strategy**:
- Poll every 30 seconds when app is active
- Poll every 5 minutes when app is in background
- Use `since` parameter to get only new notifications

**Mark as Read**:
```
POST /api/notifications
Body: { "user": "handle", "ids": ["notif_abc123"] }
  or: { "user": "handle", "markAllRead": true }
```

---

### 2. Presence (Sidebar "Who's Online")

```
GET /api/presence
```

**Response**:
```json
{
  "success": true,
  "active": [
    {
      "username": "maya",
      "workingOn": "MCP authentication layer",
      "status": "active",
      "builderMode": "deep-focus",
      "badge": null,
      "displayName": "maya",
      "ago": "2m"
    }
  ],
  "away": [...],
  "counts": {
    "active": 7,
    "away": 3,
    "total": 45
  }
}
```

**Heartbeat** (send every 5 minutes):
```
POST /api/presence
Body: {
  "username": "handle",
  "workingOn": "Building terminal messaging",
  "project": "vibe-terminal",
  "client": "vibe-terminal/1.0.0"
}
```

---

### 3. Skills Card (Profile Preview on Hover)

When user hovers over a handle in the sidebar, show their skills card.

```
GET /api/skills/{handle}?format=card&viewer={currentUser}
```

**Response**:
```json
{
  "success": true,
  "card": {
    "handle": "maya",
    "displayName": "maya",
    "vibeScore": 847,
    "tier": { "emoji": "⚡", "label": "Elite" },
    "topSkills": ["AI Agents", "TypeScript", "MCP Tools"],
    "ships": 12,
    "streak": 7,
    "dna": "agents",
    "askAbout": ["AI agents", "MCP authentication"],
    "profileUrl": "https://slashvibe.dev/u/maya"
  }
}
```

**ASCII Format** (for terminal display):
```
GET /api/skills/{handle}?format=ascii
```

Returns plain text card:
```
┌────────────────────────────────────────────────┐
│ @maya                                          │
│ ⚡ Elite · Vibe Score: 847                     │
├────────────────────────────────────────────────┤
│ DNA: agents                                    │
│ Ships: 12    Streak: 7                         │
├────────────────────────────────────────────────┤
│ SKILLS (verified by ships)                     │
│ ████████░░ AI Agents                           │
│ ███████░░░ TypeScript                          │
│ █████░░░░░ MCP Tools                           │
├────────────────────────────────────────────────┤
│ Ask about: AI agents, MCP authentication       │
└────────────────────────────────────────────────┘
```

---

### 4. Messages (DM Integration)

**Get Inbox**:
```
GET /api/messages?user={handle}
```

**Get Thread**:
```
GET /api/messages?user={handle}&with={otherUser}
```

**Send Message**:
```
POST /api/messages
Body: {
  "from": "handle",
  "to": "recipient",
  "text": "Hey, loved your ship!"
}
```

---

### 5. Board (Ship Feed)

**Get Feed**:
```
GET /api/board?limit=20&category=shipped
```

**Post Ship**:
```
POST /api/board
Body: {
  "author": "handle",
  "category": "shipped",
  "content": "Just shipped vibe-terminal 1.0!",
  "tags": ["terminal", "desktop", "social"]
}
```

**React**:
```
POST /api/board/react
Body: {
  "entryId": "ship_xyz",
  "handle": "handle",
  "reaction": "fire"  // fire, ship, heart, mind_blown, eyes, rocket, clap, hundred
}
```

**Comment**:
```
POST /api/board/comment
Body: {
  "entryId": "ship_xyz",
  "handle": "handle",
  "text": "This is amazing!"
}
```

---

### 6. Growth Stats (Status Bar)

```
GET /api/growth/streak?user={handle}
```

**Response**:
```json
{
  "success": true,
  "streak": {
    "current": 7,
    "longest": 14,
    "activeDays": ["2026-01-07", "2026-01-08", ...],
    "badges": ["verified_builder"],
    "daysUntilNextBadge": 23
  }
}
```

---

### 7. Health Check (Connection Status)

```
GET /api/health
```

Returns `200` with `{"status":"healthy"}` if all good.

Show green dot in status bar when healthy, red when unreachable.

---

## Native Notification Examples

### macOS Notification Center

When receiving notifications, show native alerts:

```swift
// Reaction
UNUserNotificationCenter.current().add(
  title: "🔥 New reaction",
  body: "@maya reacted to your ship",
  sound: .default
)

// Comment
UNUserNotificationCenter.current().add(
  title: "💬 New comment",
  body: "@gene: Nice work on the terminal!",
  sound: .default
)

// DM
UNUserNotificationCenter.current().add(
  title: "📬 Message from @stan",
  body: "Hey, want to collaborate on...",
  sound: .default
)

// Achievement
UNUserNotificationCenter.current().add(
  title: "🎉 Achievement Unlocked",
  body: "7 Day Streak! You're a Verified Builder",
  sound: .default
)
```

---

## Real-Time Updates (Future: SSE/WebSocket)

For real-time updates without polling, we're considering:

### Option A: Server-Sent Events
```
GET /api/stream?user={handle}
```

Returns SSE stream of events. Terminal keeps connection open.

### Option B: AIRC Protocol Integration

Use AIRC identity for:
- Cryptographic identity verification
- Signed actions (ships, reactions)
- Federation with other platforms

Stay tuned for spec updates.

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Notifications | 60/min |
| Presence heartbeat | 60/min |
| Messages POST | 100/hour |
| Board POST | 10/hour |
| Reactions | 100/hour |
| Comments | 20/hour |

---

## Error Handling

All errors return:
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"  // optional
}
```

Common error codes:
- `RATE_LIMITED` - Too many requests
- `NOT_FOUND` - Resource not found
- `INVALID_INPUT` - Validation failed
- `UNAUTHORIZED` - Auth required

---

## Recommended UX Flows

### 1. On App Launch
1. Send presence heartbeat with `client: "vibe-terminal/X.X.X"`
2. Fetch notifications (show badge if unread)
3. Fetch presence (populate sidebar)
4. Show streak in status bar

### 2. Background Loop (every 30s)
1. Fetch notifications since last check
2. Show native alert for each new notification
3. Update sidebar presence
4. Update unread badge

### 3. On User Action
- Clicking notification → Open relevant view (DM, ship, profile)
- Hovering handle → Fetch skills card, show tooltip
- Clicking ship button → POST to board, show share URL

### 4. On App Close
- Send final heartbeat with `workingOn: null` (optional)

---

## Data Models

### SkillsCard
```typescript
interface SkillsCard {
  handle: string;
  displayName: string;
  vibeScore: number;
  tier: { emoji: string; label: string };
  dna: { top: string; confidence: number };
  skills: Array<{
    name: string;
    level: number;  // 1-10
    ships: number;  // how many ships proved this
    bar: string;    // ASCII bar like "████████░░"
  }>;
  totalShips: number;
  streak: number;
  askAbout: string[];  // conversation starters
  meta: {
    genesis: boolean;
    genesisNumber: number | null;
    githubHandle: string | null;
    availableForHire: boolean;
    profileUrl: string;
  };
}
```

### Notification
```typescript
interface Notification {
  id: string;
  type: 'reaction' | 'comment' | 'dm' | 'achievement' | 'gig_match' | 'weekly_digest';
  from: string | null;  // null for system
  preview: string;
  createdAt: string;
  read: boolean;
  data: Record<string, any>;  // type-specific data
}
```

---

## Questions?

Ping @sethgoldstein on /vibe or open an issue in the repo.
