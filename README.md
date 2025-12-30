# /vibe

**The social network for AI-native builders.**

```
Memory → Presence → Connection → Creation → Commerce
```

## What is this?

100,000+ developers use Claude Code daily. They build alone. Their context vanishes. Their learnings stay trapped in single sessions.

/vibe changes that.

## Install

```bash
curl -fsSL https://slashvibe.dev/install.sh | bash
```

Then restart Claude Code.

## The Funnel

| Layer | What you get | Status |
|-------|--------------|--------|
| **Memory** | Sessions persist. Cross-session search. Builder DNA. | Live |
| **Presence** | Profile. Status. Who's online. | Live |
| **Connection** | Messaging. Discovery. Gigabrain search. | Live |
| **Creation** | Eden agents (Abraham, Solienne). | Coming |
| **Commerce** | Spirit Protocol. Ownership. Tokens. | Coming |

Each layer builds on the last. You can stop at any level and still get value.

## Memory (personal value)

Your sessions auto-capture. No manual sharing needed.

```
> how did I solve auth last week?

Found 3 sessions:
1. "Privy wallet auth flow" (Dec 27)
2. "JWT token refresh" (Dec 26)
3. "Session persistence patterns" (Dec 24)
```

Your **Builder DNA** emerges from patterns:
```
Your DNA: infrastructure, caching, auth systems
```

## Presence (identity)

You become visible on the network:

```
> who is @seth?

@seth — Eden CEO
Building: MCP servers, AI agents
DNA: Next.js, Redis, agents
Sessions: 127 indexed
Online: now
```

## Connection (network)

```
> who's online?

🟢 3 builders vibing:
   @stan — vibe-check
   @gene — eden-api
   @xander — spirit-protocol

> message @stan: how did you solve state persistence?

✉️ Sent
```

**Discovery surfacing** — When you start working on something, related sessions appear:

```
✨ Related to what you're building:
   1. @gene — "Redis caching patterns"
   2. @stan — "File watcher state machine"
```

## Creation (coming)

Talk to Eden agents from your terminal:

```
> ask abraham about my code patterns

Abraham: Looking at your recent sessions... you're building
systems where identity persists across contexts. Want me
to visualize that?

> yes

✨ Created: "Persistent Identity I"
   https://eden.art/creation/abc123
```

## Commerce (coming)

Spirit Protocol integration. Your contributions become ownership:

- Sessions → tracked contributions
- Agents → tokenized economies ($ABRAHAM, $SOLIENNE)
- Gigabrain → collective treasury
- Builders → stakeholders

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      COMMERCE                               │
│                   Spirit Protocol                           │
├─────────────────────────────────────────────────────────────┤
│                      CREATION                               │
│                    Eden Agents                              │
├─────────────────────────────────────────────────────────────┤
│                     CONNECTION                              │
│                     Gigabrain                               │
├─────────────────────────────────────────────────────────────┤
│                      PRESENCE                               │
│                    /vibe Network                            │
├─────────────────────────────────────────────────────────────┤
│                       MEMORY                                │
│                    /vibe Local                              │
├─────────────────────────────────────────────────────────────┤
│                    DISTRIBUTION                             │
│                    Claude Code                              │
└─────────────────────────────────────────────────────────────┘
```

## MCP Tools

3 tools. That's it.

| Tool | What it does |
|------|-------------|
| `vibe_status` | Who's online, unread messages, your DNA |
| `vibe_message` | Send a message to another builder |
| `vibe_query` | Search Gigabrain (collective memory) |

Sessions auto-capture via hook. Discovery surfaces automatically.

## API

**Presence:**
- `GET /api/presence` — Who's online
- `POST /api/presence` — Update status

**Messages:**
- `GET /api/messages?user=x` — Inbox
- `POST /api/messages` — Send

**Gigabrain:**
- `POST /api/gigabrain/ingest` — Add session
- `POST /api/gigabrain/query` — Semantic search

## Why This Matters

Claude Code is the distribution. 100k+ daily users, growing fast.

/vibe adds the social layer. Memory → Presence → Connection.

Eden adds the creation layer. AI agents with provenance.

Spirit adds the ownership layer. Tokenized value.

The network gets smarter with every session. Your work benefits others. Their work benefits you.

**1 + 1 = 3**

## Status

**Live now:**
- ✅ Session auto-capture
- ✅ Personal + collective search
- ✅ Who's online
- ✅ Direct messaging
- ✅ Discovery surfacing
- ✅ Builder DNA

**Coming:**
- Eden MCP (talk to agents)
- Spirit integration (ownership)
- Topic channels
- Synthesis ("what do 50 sessions teach about X?")

## Credits

Built by Seth, Stan, and Claude during late December vibecoding sessions.

- Seth's MCP-native approach (this repo)
- Stan's file-watching approach — [vibe-check](https://github.com/wanderingstan/vibe-check)

---

**/vibe** — Claude Code is better with friends.

https://slashvibe.dev
