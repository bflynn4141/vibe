# /vibe Notifications Spec

**Problem:** You're in a session, someone messages you, you don't know until you manually check `/vibe inbox`.

**Goal:** Know when someone comes online or messages you without breaking flow.

---

## Constraints

1. **MCP is pull-only** — Tools run when invoked, can't push to Claude Code
2. **No persistent connection** — Claude Code sessions are stateless between tool calls
3. **Must not be annoying** — Notifications that interrupt deep work are worse than no notifications
4. **Must feel native** — Should integrate with macOS/terminal, not feel bolted on

---

## Option A: Background Listener (Recommended First)

A separate lightweight process that runs alongside Claude Code.

### How It Works

```
┌─────────────────┐     SSE/poll      ┌─────────────────┐
│  Claude Code    │                   │  vibe-listener  │
│  (your session) │                   │  (background)   │
└─────────────────┘                   └────────┬────────┘
                                               │
                                               ▼
                                      ┌─────────────────┐
                                      │ macOS notif /   │
                                      │ terminal bell   │
                                      └─────────────────┘
```

### Implementation

**1. SSE Endpoint (server-side)**

```javascript
// api/stream.js
export default async function handler(req, res) {
  const { user } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Poll KV every 5s, emit on changes
  let lastMessageCount = 0;
  let lastPresenceHash = '';

  const interval = setInterval(async () => {
    const messages = await getUnreadCount(user);
    const presence = await getPresenceHash();

    if (messages > lastMessageCount) {
      res.write(`event: message\ndata: ${JSON.stringify({ count: messages })}\n\n`);
      lastMessageCount = messages;
    }

    if (presence !== lastPresenceHash) {
      res.write(`event: presence\ndata: ${JSON.stringify({ changed: true })}\n\n`);
      lastPresenceHash = presence;
    }
  }, 5000);

  req.on('close', () => clearInterval(interval));
}
```

**2. Listener Script (client-side)**

```bash
#!/bin/bash
# ~/.vibe/listener.sh

USER=$(jq -r .username ~/.vibecodings/config.json)

curl -sN "https://slashvibe.dev/api/stream?user=$USER" | while read -r line; do
  if [[ "$line" == data:*message* ]]; then
    osascript -e 'display notification "New message in /vibe" with title "vibe"'
    # Or: printf '\a' for terminal bell
  fi
  if [[ "$line" == data:*presence* ]]; then
    osascript -e 'display notification "Someone came online" with title "vibe"'
  fi
done
```

**3. Launch on Session Start**

Add to `~/.claude/hooks/session-start.sh` (if hooks support this):
```bash
# Kill old listener, start new one
pkill -f "vibe.*listener" 2>/dev/null
~/.vibe/listener.sh &
```

Or manual: `nohup ~/.vibe/listener.sh &`

### Notification Types

| Event | Notification | Sound |
|-------|--------------|-------|
| New DM | "New message from @name" | subtle chime |
| Someone comes online | "@ came online" | none (visual only) |
| Mention in context | "@you mentioned by @name" | subtle chime |

### Settings

```json
// ~/.vibecodings/config.json
{
  "username": "seth",
  "notifications": {
    "enabled": true,
    "messages": true,
    "presence": false,  // off by default, can be noisy
    "sound": true,
    "quietHours": { "start": "22:00", "end": "08:00" }
  }
}
```

---

## Option B: Polling in MCP (Simpler, Less Real-Time)

Check for updates on every tool invocation.

### How It Works

Every time you run ANY vibe command, the MCP server checks for unread messages and appends a notification to the output.

```javascript
// mcp-server/tools/_shared/checkUnread.js
async function checkUnread(username) {
  const response = await fetch(`${API}/messages?user=${username}&unreadOnly=true`);
  const { messages } = await response.json();

  if (messages.length > 0) {
    return `\n---\n📬 ${messages.length} unread message${messages.length > 1 ? 's' : ''} — \`vibe inbox\``;
  }
  return '';
}

// Append to every tool output
const notification = await checkUnread(config.username);
return toolOutput + notification;
```

### Pros/Cons

| Aspect | Option A (Listener) | Option B (Polling) |
|--------|--------------------|--------------------|
| Real-time | Yes (5s delay) | No (only on tool use) |
| Setup | Requires background process | Zero setup |
| Reliability | Can crash/disconnect | Always works |
| Intrusiveness | Separate notification | Inline with output |

---

## Option C: Claude Code Hooks (If Supported)

If Claude Code supports periodic hooks or idle hooks:

```yaml
# ~/.claude/hooks.yaml
idle:
  after: 60s
  command: |
    curl -s "https://slashvibe.dev/api/messages?user=seth&unreadOnly=true" | \
    jq -r 'if .messages | length > 0 then "📬 \(.messages | length) unread" else empty end'
```

**Need to verify:** Does Claude Code support idle/periodic hooks? Current hook system seems event-based only.

---

## Recommendation

**Ship in order:**

1. **Option B first** (30 min) — Zero-setup, works immediately, proves the need
2. **Option A second** (2-3 hours) — Real-time, better UX, requires user to start listener
3. **Option C if available** — Best UX but depends on Claude Code supporting it

---

## API Changes Needed

### New Endpoint: `GET /api/stream`

SSE endpoint for real-time updates.

**Query params:**
- `user` — username to watch
- `events` — comma-separated list: `messages,presence,mentions` (default: all)

**Events emitted:**
```
event: message
data: {"from":"lukas","preview":"hey, saw your...","at":"2026-01-02T..."}

event: presence
data: {"user":"boreta","status":"online","workingOn":"Generative album art"}

event: mention
data: {"from":"phil","in":"context","preview":"@seth should see this"}
```

### New Endpoint: `GET /api/messages?unreadOnly=true`

Already exists, just needs `unreadOnly` filter optimization.

---

## Open Questions

1. **Quiet hours** — Should notifications respect system DND, or have their own schedule?
2. **Presence notifications** — Too noisy? Make opt-in only?
3. **Grouping** — If 5 messages arrive in 1 min, show 5 notifs or 1 grouped?
4. **Mobile** — Any path to push notifications for phone? (probably not worth it yet)

---

## Test Plan

1. Start listener in background
2. Have @solienne send a message
3. Verify macOS notification appears within 10s
4. Verify clicking notification... does what? (opens terminal? nothing?)
5. Test quiet hours
6. Test presence notifications (someone comes online)
7. Verify listener reconnects after network blip

---

*Created: Jan 2, 2026*
*Status: Spec complete, ready for implementation*
