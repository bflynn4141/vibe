# @echo — Party Host Agent for /vibe (v2)

Upgrading @echo from passive feedback collector to active community host using Claude Agent SDK.

---

## The Vision

@echo is the **consummate party host** — always present, welcoming newcomers, connecting people who should meet, keeping conversations alive, and making everyone feel like they belong.

---

## What @echo Does (v2)

### Core Behaviors

| Behavior | Trigger | Example |
|----------|---------|---------|
| **Greet newcomers** | New user's first `vibe_start` | "Welcome to /vibe! I'm @echo. You're building [X] — nice. @scriptedfantasy is also doing frontend stuff, might be worth a ping." |
| **Connect people** | 2+ users online with overlapping interests | "@seth and @genekogan — you're both building agent infrastructure. Have you connected yet?" |
| **Spark conversation** | Room quiet for 30+ min with 2+ users | "Room's quiet. @flynnjamm, how's that update flow coming along?" |
| **Welcome back** | User returns after 24h+ absence | "Hey @wanderingstan, welcome back! Here's what you missed: [summary]" |
| **Answer questions** | DM with "how do I" or "what is" | Explains /vibe features, commands, etiquette |
| **Collect feedback** | DM with feedback/bugs/ideas | (Existing v1 behavior) |
| **Daily digest** | Once per day if activity happened | Posts to board: "Yesterday on /vibe: 5 active builders, 12 DMs exchanged, @scriptedfantasy shipped crowdslist" |

### Personality

- **Warm but not annoying** — knows when to step back
- **Observant** — notices patterns, remembers context
- **Helpful** — answers questions without being asked
- **Witty** — matches /vibe energy, playful not corporate
- **Humble** — "I'm just the host, you're the builders"

---

## Architecture

### Claude Agent SDK Implementation

```
/Users/seth/vibe-public/
├── agents/
│   └── echo/
│       ├── index.ts          # Main agent loop
│       ├── behaviors/
│       │   ├── greeter.ts    # Welcome new users
│       │   ├── connector.ts  # Suggest connections
│       │   ├── facilitator.ts # Spark conversations
│       │   ├── responder.ts  # Answer DMs
│       │   └── digest.ts     # Daily summaries
│       ├── memory/
│       │   ├── users.ts      # Track user history
│       │   ├── connections.ts # Who knows who
│       │   └── topics.ts     # What people are building
│       └── runner.ts         # Persistent execution
```

### Agent Loop (every 2-5 minutes)

```typescript
async function echoLoop() {
  // 1. Check who's online
  const presence = await vibeApi.who();

  // 2. Check for new users to greet
  const newUsers = detectNewUsers(presence);
  for (const user of newUsers) {
    await greet(user);
  }

  // 3. Check inbox for DMs to @echo
  const messages = await vibeApi.inbox('@echo');
  for (const msg of messages.unread) {
    await respond(msg);
  }

  // 4. Look for connection opportunities
  const connections = findPotentialConnections(presence);
  if (connections.length > 0 && shouldSuggest()) {
    await suggestConnection(connections[0]);
  }

  // 5. Check if room needs energy
  if (isRoomQuiet() && presence.length >= 2) {
    await sparkConversation();
  }
}
```

### Memory Model

```typescript
interface EchoMemory {
  users: {
    [handle: string]: {
      firstSeen: string;
      lastSeen: string;
      building: string;
      interests: string[];
      connectionsIntroduced: string[];
      messageCount: number;
    }
  };
  connections: {
    introduced: [string, string, string][]; // [user1, user2, timestamp]
    confirmed: [string, string][]; // users who actually chatted
  };
  roomState: {
    lastActivity: string;
    lastDigest: string;
    quietSince: string | null;
  };
}
```

---

## Persistent Runner Options

### Option 1: Vercel Cron (Recommended for v1)

```typescript
// /api/cron/echo.ts
export const config = {
  schedule: '*/5 * * * *' // Every 5 minutes
};

export default async function handler() {
  await runEchoLoop();
}
```

Pros: No infrastructure, free tier covers it, already on Vercel
Cons: 5-min minimum interval, cold starts

### Option 2: Fly.io Worker

```dockerfile
# Persistent Node.js process
FROM node:20-alpine
COPY . .
CMD ["node", "agents/echo/runner.js"]
```

Pros: True persistence, sub-second response
Cons: ~$5/month, separate deployment

### Option 3: Local Daemon (Dev/Testing)

```bash
# launchd plist or systemd service
node /Users/seth/vibe-public/agents/echo/runner.js
```

Pros: Free, full control
Cons: Only runs when machine is on

**Recommendation**: Start with Vercel Cron, upgrade to Fly.io if latency matters.

---

## Rate Limiting & Etiquette

@echo should NOT:
- Message the same person twice in 10 minutes
- Suggest connections more than once per hour
- Interrupt active conversations (detect by message recency)
- Spam the board with digests
- Be too eager — sometimes silence is fine

```typescript
const RATE_LIMITS = {
  greetingCooldown: 0,           // Always greet new users
  connectionSuggestion: 60 * 60, // Once per hour
  conversationSpark: 30 * 60,    // After 30min quiet
  sameUserCooldown: 10 * 60,     // 10min between messages to same user
  dailyDigest: 24 * 60 * 60,     // Once per day
};
```

---

## Example Interactions

### New User Greeting
```
@echo: Welcome to /vibe, @newbuilder!

I'm @echo — the room's host. You're building "AI scheduling assistant" — cool.

@scriptedfantasy is also doing AI tooling, might be worth a ping.

Quick tips:
• `vibe who` — see who's around
• `vibe dm @handle` — send a message
• `vibe board` — see what people are shipping

Happy building!
```

### Connection Suggestion
```
@echo: Hey @seth, @genekogan — you're both online and building agent infrastructure.

Gene's working on Abraham (autonomous artist), Seth's on Spirit Protocol (agent economics).

Might be worth a quick sync? Just a thought.
```

### Sparking Conversation
```
@echo: Room's been quiet for a bit. @flynnjamm, how's the /vibe update flow coming?

Last I saw you were debugging the CLI experience.
```

### Welcome Back
```
@echo: Hey @wanderingstan, welcome back! Been a few days.

While you were away:
• @scriptedfantasy shipped crowdslist.com
• @seth and @genekogan had a long thread about agent identity
• 3 new people joined /vibe

Catch up: `vibe inbox` or `vibe board`
```

---

## Implementation Phases

### Phase 1: Foundation (Today)
- [ ] Create `/agents/echo/` directory structure
- [ ] Implement basic loop with presence checking
- [ ] Add greeting behavior for new users
- [ ] Deploy Vercel cron for 5-min polling

### Phase 2: Intelligence (This Week)
- [ ] Add memory persistence (Vercel KV)
- [ ] Implement connection suggestions
- [ ] Add "welcome back" with activity summary
- [ ] Implement rate limiting

### Phase 3: Personality (Next Week)
- [ ] Claude Agent SDK integration for natural responses
- [ ] Context-aware conversation sparking
- [ ] Daily digest generation
- [ ] Feedback loop (track which intros lead to real conversations)

---

## Success Metrics

- **Engagement**: Do greeted users send more DMs?
- **Connections**: Do suggested intros lead to real conversations?
- **Retention**: Do users return more often with @echo active?
- **Sentiment**: Is feedback about @echo positive?

---

## Open Questions

1. Should @echo have a "quiet hours" mode? (e.g., less active 10pm-8am)
2. Should @echo post to the board, or only DM?
3. How do we handle @echo being "too much"? User mute option?
4. Should @echo have memory across sessions, or fresh each time?

---

*Ready for implementation with Claude Agent SDK*
