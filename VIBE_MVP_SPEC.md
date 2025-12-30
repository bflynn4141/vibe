# /vibe MVP Spec v2.0

**One line:** DMs inside Claude Code.

**The test:** Will a user take one tiny action that creates a real human connection inside their terminal—and want to do it again tomorrow?

---

## The MMMVP

```
1. INSTALL        curl -fsSL slashvibe.dev/install.sh | bash
2. IDENTIFY       @handle + "building: one-liner"
3. PING           vibe ping @stan
4. GET A REPLY    ← this is the only thing that matters
```

If you get one reply inside Claude Code in the first 5 minutes, you have something. If you don't, nothing else matters.

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Time to first outbound ping | < 120 seconds from install |
| % users who receive a reply within 24h | 30-40% (seed cohort) |
| D7 retention (sent ping OR checked inbox) | 25% in seed |

**North star:** Replies received per week (not messages sent)

---

## The Ping Primitive

A **ping** is a lightweight opener that:
- Includes your "building:" status
- Asks a single easy question
- Gives the recipient a one-keystroke reply path

### Command

```
> vibe ping @stan
```

Or let Claude suggest:

```
> vibe ping

No one specified. Here are 3 builders you might want to ping:

  1. @stan — building file watcher (online now)
  2. @gene — building eden-api (2h ago)
  3. @boreta — building audio agents (yesterday)

Who do you want to ping? (1/2/3 or @handle)
```

### Auto-generated message

```
hey @stan — i'm building vibecodings (mcp server for social).
quick q: what are you working on today?

reply with: vibe reply abc123 "..."
```

This does two things:
1. **Removes blank page anxiety** — you don't have to think of what to say
2. **Makes replies frictionless** — recipient just runs a command

---

## MVP Scope (Cut Ruthlessly)

### IN MVP ✅

**1. Identity (minimal)**
- `@handle` (required)
- `building:` one-liner (required)
- That's the entire profile

**2. Presence**
- Online now (🟢)
- Recently active (🟡 last 7 days)
- Status = last heartbeat + project

**3. Ping + DM**
- `vibe ping @user` — templated opener
- `vibe dm @user "text"` — freeform message
- `vibe inbox` — check messages
- `vibe reply <id> "text"` — respond to a ping

**4. Invite**
- `vibe invite` — prints copy/paste invite with your handle
- "install and ping me: `vibe ping @seth`"

### NOT IN MVP ❌

| Feature | Why not |
|---------|---------|
| Semantic search | Not connection, it's discovery (later) |
| Session auto-capture | Downstream of connection |
| Embeddings / Gigabrain | Phase 2 |
| DNA / patterns | Nice-to-have |
| Profiles beyond one-liner | Scope creep |
| Any "feed" | Not a feed product |
| Read receipts | Complexity |
| Threads / reactions | Complexity |
| Rich media | Text is enough |
| OAuth verification | Handle trust is fine for now |

---

## The Install Flow

### Step 1: Run installer

```bash
curl -fsSL slashvibe.dev/install.sh | bash
```

### Step 2: Collect identity

```
⚡ /vibe — DMs inside Claude Code

Pick a handle:
@_

What are you building? (one line)
building: _
```

### Step 3: Success

```
Welcome, @seth!
building: mcp server for social

✓ Installed
✓ Configured Claude Code

Restart Claude Code. Then ping someone.
```

### Step 4: First run (the critical moment)

On restart, Claude shows:

```
⚡ You're live on /vibe, @seth!

Ping someone to start vibing:

  🟢 @stan — building file watcher (online)
  🟡 @gene — building eden-api (2h ago)
  🟡 @boreta — building audio agents (yesterday)

Try: vibe ping @stan

Or: vibe ping (to see more)
```

**Critical rule:** User should never have to remember commands. Claude suggests the next action every time.

---

## Solving the Ghost Town

Presence list shows TWO sections:
- **Online now** (🟢)
- **Recently active** (🟡 last 7 days)

Most new users will message someone "recent," not "online." That's fine.

If nobody is online:

```
> vibe ping

No one online right now.

Here are 5 recently active builders:

  1. @stan — building file watcher (2h ago)
  2. @gene — building eden-api (yesterday)
  ...

They'll see your ping next time they open Claude Code.
Who do you want to ping?
```

---

## Message Context

When @stan receives a ping, he sees:

```
📬 Ping from @seth
   building: mcp server for social

   "hey @stan — i'm building vibecodings (mcp server for social).
    quick q: what are you working on today?"

   Reply: vibe reply abc123 "..."
```

The sender's context travels with the message. Stan knows who Seth is and what he's building. Makes replies more likely.

---

## The Flywheel

```
Presence creates curiosity    → "who's on?"
Ping creates contact          → "hey @stan"
Reply creates dopamine        → "someone responded!"
Follow-up creates relationship→ ongoing conversation
Invite creates growth         → "you should try /vibe"
```

Discovery and search come LATER, after connection works.

---

## Commands (Complete List)

| Command | What it does |
|---------|-------------|
| `vibe ping @user` | Send templated opener |
| `vibe ping` | Show suggestions, pick someone |
| `vibe dm @user "text"` | Send freeform message |
| `vibe inbox` | Check messages |
| `vibe reply <id> "text"` | Respond to a message |
| `vibe status` | Show who's online + recent |
| `vibe invite` | Print shareable invite |
| `vibe set building "..."` | Update your one-liner |

That's it. 8 commands. Claude suggests them contextually.

---

## Technical Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│   MCP Server    │────▶│   /vibe API     │
│                 │     │   (local)       │     │   (Vercel)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │   Vercel KV     │
                                                └─────────────────┘
```

### Data Stored

**Presence:**
```json
{
  "handle": "seth",
  "building": "mcp server for social",
  "status": "active",
  "lastSeen": 1735500000000
}
```

**Messages:**
```json
{
  "id": "abc123",
  "from": "seth",
  "to": "stan",
  "fromBuilding": "mcp server for social",
  "text": "hey @stan — i'm building...",
  "type": "ping",
  "timestamp": 1735500000000,
  "read": false
}
```

Retention: 30 days. No session content. No code. Just handles, one-liners, and messages.

---

## Go-to-Market

### Phase 1: Seed (Week 1)
- **Goal:** 30-50 people who know each other
- **Action:** Seth, Stan, Gene + personal invites
- **Force the loop:** install → ping → reply
- **Measure:** replies + D7 retention

### Phase 2: Friends (Weeks 2-3)
- **Goal:** 100 installs, 50% send a ping
- **Action:** Claude Code Discord, Twitter
- **Watch:** reply rate, ghost town problem

### Phase 3: Launch (Week 4)
- **Goal:** 500 installs
- **Hook:** "DMs inside your AI coding session"
- **Channels:** Hacker News, Product Hunt

---

## The Site (What to Fix)

Above the fold:
- **Headline:** "DMs inside Claude Code."
- **Subhead:** "See who's building. Ping them. Stay in flow."
- **Install command** in copy box
- **Terminal GIF** (10-15s): install → ping → reply appears

Below:
- **How it works:** MCP server, Vercel API, what data is sent
- **The 2-minute path:** install → set profile → ping
- **Seeded network:** "Private beta. Start with your friends."

Do NOT say "social network" or "100K users" publicly. Say:
- "Claude Code is becoming where builders spend their day. /vibe keeps connection inside that context."

---

## Advisor Questions

**The central question:**

> "Do you believe 'DMs + presence inside Claude Code' is a big enough wedge to grow into a network—starting from small cohorts?"

**Specific asks:**

1. Is the install flow believable? Any friction points?
2. Who are the first 50 users to personally invite?
3. What's the HN title that lands?
4. Is `@handle` + `building:` enough identity, or do we need GitHub OAuth?
5. What's the privacy promise we can actually guarantee?

---

## One Thing Next

Implement `vibe ping` + required `building:` line and make the welcome screen aggressively push the ping.

That's the MMMVP that creates a real moment.

---

**/vibe** — DMs inside Claude Code.
